import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import workspaceContainer from '../container/workspaceContainer.js';
import { workspaceIngestionQueue } from '../infrastructure/workspaceQueue.js';
import { workspaceUploadQueue } from '../infrastructure/workspaceUploadQueue.js';
import { getWorkspaceUser, requireWorkspaceOwnership, checkWorkspaceLimits, checkSourceLimits } from '../middleware/workspaceAuth.js';
import { workspaceApiLimiter, workspaceChatLimiter, workspaceUploadLimiter, workspaceGenerateLimiter } from '../middleware/workspaceRateLimiter.js';
import ApiResponse from '../utils/ApiResponse.js';
import logger from '../loggers/logger.js';
import config from '../config/env.js';

import workspaceController from '../controllers/workspace.controller.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: (config.workspaceMaxPdfMb || 15) * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') return cb(null, true);
    cb(new Error('Only PDF files are supported in document upload.'));
  },
});

// Video uploads use memory storage — then we route to Supabase or local depending on provider
const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    try {
      workspaceContainer.workspaceVideoUploadService.validateVideo(file);
      cb(null, true);
    } catch (err) {
      cb(err);
    }
  }
});

/**
 * Upload a video buffer to Supabase Storage (production) or local disk (dev).
 * Returns the storage path reference stored in Firestore.
 */
async function storeVideoFile(workspaceId, sourceId, file) {
  const storageService = workspaceContainer.workspaceStorageService;
  const ext = path.extname(file.originalname).toLowerCase();
  const fileName = `original${ext}`;
  return storageService.saveFile(workspaceId, sourceId, fileName, file.buffer, {
    contentType: file.mimetype,
  });
}


// Hidden diagnostics health panel route
router.get('/health', workspaceController.getHealth);

// Apply global Workspace User Identification header check to all routes
router.use(getWorkspaceUser);

// ─── WORKSPACE CRUD ──────────────────────────────────────────────────────────

// 1. List user workspaces
router.get('/', workspaceApiLimiter, workspaceController.listWorkspaces);

// 2. Create workspace
router.post('/', workspaceApiLimiter, checkWorkspaceLimits, workspaceController.createWorkspace);

// 3. Get workspace detail (includes sources and recent outputs)
router.get('/:wid', workspaceApiLimiter, requireWorkspaceOwnership, workspaceController.getWorkspace);

// 4. Update workspace name/emoji
router.patch('/:wid', workspaceApiLimiter, requireWorkspaceOwnership, workspaceController.updateWorkspace);

// 5. Delete workspace (cascade purge vectors and sources)
router.delete('/:wid', workspaceApiLimiter, requireWorkspaceOwnership, workspaceController.deleteWorkspace);


// ─── SOURCES MANAGEMENT ──────────────────────────────────────────────────────

// 6. Add source (YouTube URL, PDF, or text paste)
router.post('/:wid/sources', workspaceUploadLimiter, requireWorkspaceOwnership, checkSourceLimits, upload.single('file'), async (req, res, next) => {
  try {
    const wid = req.params.wid;
    const { type, youtubeUrl, title, text } = req.body;

    let sourceData = {
      type,
      title: title || 'Untitled Source',
      status: 'pending',
      progress: 0,
      progressStage: 'Queuing for ingestion...',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (type === 'youtube') {
      if (!youtubeUrl) return res.status(400).json(ApiResponse.error('YouTube URL is required for video sources.', 400));
      const videoId = workspaceContainer.ingestionService.extractYoutubeId(youtubeUrl);
      if (!videoId) return res.status(400).json(ApiResponse.error('Invalid YouTube video link.', 400));
      sourceData.meta = { videoId, url: youtubeUrl };
    } else if (type === 'pdf') {
      if (!req.file) return res.status(400).json(ApiResponse.error('PDF file upload is missing.', 400));
      sourceData.title = req.file.originalname;
      sourceData.meta = { size: req.file.size };
    } else if (type === 'text') {
      if (!text?.trim()) return res.status(400).json(ApiResponse.error('Text content is missing.', 400));
      if (!title?.trim()) return res.status(400).json(ApiResponse.error('Title is required for text source.', 400));
      sourceData.title = title.trim();
      sourceData.meta = { size: Buffer.byteLength(text, 'utf8') };
    } else {
      return res.status(400).json(ApiResponse.error('Invalid source type specified.', 400));
    }

    // Create record in Firestore
    const sourceDoc = await workspaceContainer.workspaceSourceRepository.create(wid, sourceData);
    const sid = sourceDoc.id;

    // Queue in BullMQ background job
    const jobData = {
      workspaceId: wid,
      sourceId: sid,
      type,
    };

    if (type === 'youtube') {
      jobData.youtubeUrl = youtubeUrl;
    } else if (type === 'pdf') {
      jobData.fileBuffer = req.file.buffer;
      jobData.fileName = req.file.originalname;
    } else if (type === 'text') {
      jobData.text = text;
      jobData.title = title;
    }

    await workspaceIngestionQueue.add(`${type}-ingest-${sid}`, jobData);

    res.status(202).json(ApiResponse.success(sourceDoc, 'Source uploaded and queued for processing'));
  } catch (error) {
    next(error);
  }
});

// 6.1. Add video source (Local video file upload → Supabase or local storage)
router.post('/:wid/sources/video-upload', workspaceUploadLimiter, requireWorkspaceOwnership, checkSourceLimits, videoUpload.single('file'), async (req, res, next) => {
  try {
    const wid = req.params.wid;
    const { title } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json(ApiResponse.error('Video file upload is missing.', 400));
    }

    const sid = uuidv4();
    const cleanTitle = title || file.originalname.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');

    // Upload to storage provider (Supabase or local)
    let storagePath;
    try {
      storagePath = await storeVideoFile(wid, sid, file);
      logger.info('Video file stored successfully', { wid, sid, storagePath });
    } catch (storageErr) {
      logger.error('Failed to store video file', { error: storageErr.message });
      return res.status(500).json(ApiResponse.error('Failed to store uploaded video. Please try again.', 500));
    }

    const sourceData = {
      type: 'video',
      title: cleanTitle,
      status: 'pending',
      progress: 0,
      progressStage: 'Queuing for video ingestion...',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      meta: {
        fileName: file.originalname,
        size: file.size,
        storagePath,
      }
    };

    // Create source in database with pre-allocated ID
    const sourceDoc = await workspaceContainer.workspaceSourceRepository.create(wid, sourceData, sid);

    // Enqueue in workspaceUploadQueue — pass storagePath (not localPath)
    const jobData = {
      workspaceId: wid,
      sourceId: sid,
      fileName: file.originalname,
      storagePath,
      title: cleanTitle,
    };

    await workspaceUploadQueue.add(`video-ingest-${sid}`, jobData);

    res.status(202).json(ApiResponse.success(sourceDoc, 'Local video file uploaded and queued for processing'));
  } catch (error) {
    next(error);
  }
});

// 6.2. Serve video source thumbnails
router.get('/:wid/sources/:sid/thumbnail/:filename', workspaceApiLimiter, requireWorkspaceOwnership, async (req, res, next) => {
  try {
    const { wid, sid, filename } = req.params;
    // Sanitize filename to prevent directory traversal
    const safeFilename = path.basename(filename);
    const storageService = workspaceContainer.workspaceStorageService;
    const filePath = storageService.resolveFilePath(wid, sid, path.join('thumbnails', safeFilename));

    if (!fs.existsSync(filePath)) {
      return res.status(404).json(ApiResponse.error('Thumbnail frame not found.', 404));
    }

    res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
});

// 6.3. Serve video file for streaming/playback
router.get('/:wid/sources/:sid/video', workspaceApiLimiter, requireWorkspaceOwnership, async (req, res, next) => {
  try {
    const { wid, sid } = req.params;
    const source = await workspaceContainer.workspaceSourceRepository.findById(wid, sid);
    if (!source || source.type !== 'video') {
      return res.status(404).json(ApiResponse.error('Video source not found.', 404));
    }

    const storageService = workspaceContainer.workspaceStorageService;
    const ext = path.extname(source.meta?.fileName || 'original.mp4');
    const filePath = storageService.resolveFilePath(wid, sid, `original${ext}`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json(ApiResponse.error('Video resource not found on storage.', 404));
    }

    // Express supports range headers automatically for res.sendFile
    res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
});

// 7. Get source details
router.get('/:wid/sources/:sid', workspaceApiLimiter, requireWorkspaceOwnership, async (req, res, next) => {
  try {
    const source = await workspaceContainer.workspaceSourceRepository.findById(req.params.wid, req.params.sid);
    if (!source) return res.status(404).json(ApiResponse.error('Source not found.', 404));
    res.json(ApiResponse.success(source, 'Source fetched successfully'));
  } catch (error) {
    next(error);
  }
});

// 8. Poll ingestion status
router.get('/:wid/sources/:sid/status', workspaceApiLimiter, requireWorkspaceOwnership, async (req, res, next) => {
  try {
    const source = await workspaceContainer.workspaceSourceRepository.findById(req.params.wid, req.params.sid);
    if (!source) return res.status(404).json(ApiResponse.error('Source not found.', 404));
    res.json(ApiResponse.success({
      status: source.status,
      progress: source.progress,
      progressStage: source.progressStage,
      error: source.error,
    }, 'Status polled successfully'));
  } catch (error) {
    next(error);
  }
});

// 8.1. SSE Real-time Ingestion Progress Stream
router.get('/:wid/sources/:sid/progress-stream', workspaceApiLimiter, requireWorkspaceOwnership, async (req, res, next) => {
  try {
    const { wid, sid } = req.params;

    // Setup SSE Headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Fetch initial source
    const source = await workspaceContainer.workspaceSourceRepository.findById(wid, sid);
    if (!source) {
      res.write(`data: ${JSON.stringify({ error: 'Source not found' })}\n\n`);
      return res.end();
    }

    // Emit initial status
    res.write(`data: ${JSON.stringify({
      workspaceId: wid,
      sourceId: sid,
      currentState: source.status,
      nextState: source.status,
      progress: source.progress || 0,
      progressStage: source.progressStage || 'Queuing...',
      timestamp: source.updatedAt || new Date().toISOString(),
      extraData: source.errorDetails || {}
    })}\n\n`);

    const stateMachine = workspaceContainer.workspaceIngestionStateMachine;
    
    // If already terminal, end the connection immediately
    if (stateMachine.isTerminal(source.status)) {
      return res.end();
    }

    const eventName = `${wid}:${sid}`;
    const listener = (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (stateMachine.isTerminal(event.nextState)) {
        res.end();
      }
    };

    stateMachine.on(eventName, listener);

    req.on('close', () => {
      stateMachine.off(eventName, listener);
    });
  } catch (error) {
    logger.error('SSE Progress stream error', { error: error.message });
    next(error);
  }
});

// 9. Delete source (remove vectors + doc + local storage files)
router.delete('/:wid/sources/:sid', workspaceApiLimiter, requireWorkspaceOwnership, async (req, res, next) => {
  try {
    const wid = req.params.wid;
    const sid = req.params.sid;

    // Delete vectors resiliently
    try {
      await workspaceContainer.embeddingService.deleteSourceVectors(wid, sid);
    } catch (vectorErr) {
      logger.error('Failed to delete vectors from Qdrant during source deletion', { wid, sid, error: vectorErr.message });
    }
    
    // Cascade delete local files (videos, audio, thumbnails)
    try {
      await workspaceContainer.workspaceStorageService.deleteSourceDir(wid, sid);
    } catch (storageErr) {
      logger.error('Failed to purge local storage for source', { wid, sid, error: storageErr.message });
    }

    // Delete source doc
    await workspaceContainer.workspaceSourceRepository.delete(wid, sid);

    // Trigger post-ingestion count and graph rebuild resiliently
    try {
      await workspaceContainer.ingestionService.postIngestionUpdate(wid);
    } catch (postErr) {
      logger.error('Failed post-ingestion update during source deletion', { wid, error: postErr.message });
    }

    res.json(ApiResponse.success({ success: true }, 'Source removed and vectors/files deleted successfully'));
  } catch (error) {
    next(error);
  }
});


// ─── CHAT ENGINE ─────────────────────────────────────────────────────────────

// 10. Streaming SSE chat
router.post('/:wid/chat', workspaceChatLimiter, requireWorkspaceOwnership, async (req, res, next) => {
  try {
    console.log('STREAM STEP 1: Request received');
    logger.info('STREAM STEP 1: Request received');
    const wid = req.params.wid;
    const { message, chatId, mode, depth } = req.body;

    if (!message?.trim()) {
      return res.status(400).json(ApiResponse.error('Message content is required.', 400));
    }

    let activeChatId = chatId;
    if (!activeChatId) {
      const newChat = await workspaceContainer.workspaceChatService.createChat(wid, {
        mode: mode || 'explain',
        title: message.trim().substring(0, 30) + '...',
      });
      activeChatId = newChat.id;
    }

    const history = await workspaceContainer.workspaceChatService.getChatHistory(wid, activeChatId);

    // Setup SSE Headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('X-Chat-Id', activeChatId);
    res.flushHeaders();

    // Send initial session payload
    res.write(`data: ${JSON.stringify({ type: 'session', chatId: activeChatId })}\n\n`);

    let clientAborted = false;
    req.on('close', () => {
      clientAborted = true;
      res.end();
    });

    try {
      for await (const event of workspaceContainer.workspaceChatService.streamChat({
        workspaceId: wid,
        message: message.trim(),
        chatId: activeChatId,
        mode: mode || 'explain',
        depth: depth || 'detailed',
        history,
        signal: req.signal,
      })) {
        if (clientAborted) break;
        if (event.type === 'token') {
          console.log('STREAM STEP 6: Token forwarded to SSE');
          logger.info('STREAM STEP 6: Token forwarded to SSE');
        }
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      console.log('STREAM STEP 9: Stream completed');
      logger.info('STREAM STEP 9: Stream completed');
    } catch (streamError) {
      logger.error('Stream processing failed', { error: streamError.message });
      if (!clientAborted) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Stream failed due to AI processing overload.' })}\n\n`);
      }
    }

    if (!res.writableEnded) res.end();
  } catch (error) {
    next(error);
  }
});

// 11. List chat sessions
router.get('/:wid/chats', workspaceApiLimiter, requireWorkspaceOwnership, async (req, res, next) => {
  try {
    const list = await workspaceContainer.workspaceChatService.listChats(req.params.wid);
    res.json(ApiResponse.success({ list }, 'Chat sessions fetched'));
  } catch (error) {
    next(error);
  }
});

// 12. Get chat history
router.get('/:wid/chats/:cid', workspaceApiLimiter, requireWorkspaceOwnership, async (req, res, next) => {
  try {
    const history = await workspaceContainer.workspaceChatService.getChatHistory(req.params.wid, req.params.cid);
    res.json(ApiResponse.success({ history }, 'Chat history fetched'));
  } catch (error) {
    next(error);
  }
});

// 13. Delete chat session
router.delete('/:wid/chats/:cid', workspaceApiLimiter, requireWorkspaceOwnership, async (req, res, next) => {
  try {
    await workspaceContainer.workspaceChatService.deleteChat(req.params.wid, req.params.cid);
    res.json(ApiResponse.success({ success: true }, 'Chat session deleted'));
  } catch (error) {
    next(error);
  }
});


// ─── STUDIO GENERATIVE GENERATION ────────────────────────────────────────────

// 14. Generate studio output
router.post('/:wid/generate', workspaceGenerateLimiter, requireWorkspaceOwnership, async (req, res, next) => {
  try {
    const { type, topicFocus, title, depth } = req.body;
    if (!type) return res.status(400).json(ApiResponse.error('Output type is required.', 400));

    const output = await workspaceContainer.studioGenerationService.generate(req.params.wid, type, {
      topicFocus,
      title,
      depth: depth || 'standard',
    });

    res.json(ApiResponse.success(output, 'Generative output created successfully'));
  } catch (error) {
    next(error);
  }
});

// 15. List outputs
router.get('/:wid/outputs', workspaceApiLimiter, requireWorkspaceOwnership, async (req, res, next) => {
  try {
    const list = await workspaceContainer.studioGenerationService.listOutputs(req.params.wid);
    res.json(ApiResponse.success({ list }, 'Studio outputs fetched'));
  } catch (error) {
    next(error);
  }
});

// 16. Get single output
router.get('/:wid/outputs/:oid', workspaceApiLimiter, requireWorkspaceOwnership, async (req, res, next) => {
  try {
    const output = await workspaceContainer.studioGenerationService.getOutput(req.params.wid, req.params.oid);
    if (!output) return res.status(404).json(ApiResponse.error('Output not found.', 404));
    res.json(ApiResponse.success(output, 'Studio output detail fetched'));
  } catch (error) {
    next(error);
  }
});



// 17. Delete output
router.delete('/:wid/outputs/:oid', workspaceApiLimiter, requireWorkspaceOwnership, async (req, res, next) => {
  try {
    await workspaceContainer.studioGenerationService.deleteOutput(req.params.wid, req.params.oid);
    res.json(ApiResponse.success({ success: true }, 'Studio output deleted'));
  } catch (error) {
    next(error);
  }
});


// ─── INTELLIGENCE LAYER ──────────────────────────────────────────────────────

// 18. Get source graph
router.get('/:wid/graph', workspaceApiLimiter, requireWorkspaceOwnership, async (req, res, next) => {
  try {
    const wid = req.params.wid;
    const clusters = await workspaceContainer.sourceGraphService.getConceptClusters(wid);
    const relationships = await workspaceContainer.sourceGraphService.getSourceRelationships(wid);
    const metrics = await workspaceContainer.sourceGraphService.getKnowledgeCoverage(wid);
    
    res.json(ApiResponse.success({
      clusters,
      relationships,
      metrics,
    }, 'Source graph details fetched'));
  } catch (error) {
    next(error);
  }
});

// 18.1. Get learning intelligence and adaptive tutoring profiles
router.get('/:wid/learning', workspaceApiLimiter, requireWorkspaceOwnership, async (req, res, next) => {
  try {
    const wid = req.params.wid;
    const learningProfile = await workspaceContainer.learningIntelligenceService.getLearningIntelligence(wid);
    res.json(ApiResponse.success(learningProfile, 'Learning intelligence profile fetched successfully'));
  } catch (error) {
    next(error);
  }
});

// 18.2. Get structured knowledge coverage density and heatmap maps
router.get('/:wid/coverage', workspaceApiLimiter, requireWorkspaceOwnership, async (req, res, next) => {
  try {
    const wid = req.params.wid;
    const coverageProfile = await workspaceContainer.knowledgeCoverageService.calculateCoverage(wid);
    res.json(ApiResponse.success(coverageProfile, 'Knowledge coverage analysis fetched successfully'));
  } catch (error) {
    next(error);
  }
});

// 19. Global semantic search cross-source
router.get('/:wid/search', workspaceApiLimiter, requireWorkspaceOwnership, async (req, res, next) => {
  try {
    const query = req.query.q;
    if (!query) return res.status(400).json(ApiResponse.error('Query parameter q is required.', 400));
    
    const results = await workspaceContainer.vectorSearchService.hybridSearch(req.params.wid, query, { topK: 10 });
    res.json(ApiResponse.success({ results }, 'Global semantic search results fetched'));
  } catch (error) {
    next(error);
  }
});

// 20. Workspace metrics / dashboard overview data
router.get('/:wid/metrics', workspaceApiLimiter, requireWorkspaceOwnership, async (req, res, next) => {
  try {
    const metrics = await workspaceContainer.ingestionTracerService.getWorkspaceMetrics(req.params.wid, {
      workspaceRepo: workspaceContainer.workspaceRepository,
      sourceRepo: workspaceContainer.workspaceSourceRepository,
      outputRepo: workspaceContainer.workspaceOutputRepository,
    });
    res.json(ApiResponse.success(metrics, 'Workspace metrics fetched'));
  } catch (error) {
    next(error);
  }
});

// 21. Get workspace memory / learning patterns
router.get('/:wid/memory', workspaceApiLimiter, requireWorkspaceOwnership, async (req, res, next) => {
  try {
    const memory = await workspaceContainer.workspaceMemoryService.getMemoryContext(req.params.wid);
    res.json(ApiResponse.success({ memory }, 'Workspace memory context fetched'));
  } catch (error) {
    next(error);
  }
});

// 22. Get infrastructure health (Qdrant, API providers, background queues)
router.get('/infrastructure/health', workspaceApiLimiter, async (req, res, next) => {
  try {
    const qdrantHealth = await workspaceContainer.vectorInfrastructureManager.getHealth();
    
    // Check API keys presence
    const nvidiaOk = !!config.nvidiaApiKey;
    const openaiOk = !!process.env.OPENAI_API_KEY;

    // Get active job count from queues
    const ingestionQueueCount = await workspaceIngestionQueue.getJobCounts();
    const uploadQueueCount = await workspaceUploadQueue.getJobCounts();

    res.json(ApiResponse.success({
      qdrant: qdrantHealth,
      nvidiaNIM: {
        configured: nvidiaOk,
        status: nvidiaOk ? 'healthy' : 'unconfigured'
      },
      openai: {
        configured: openaiOk,
        status: openaiOk ? 'healthy' : 'unconfigured'
      },
      queues: {
        ingestion: ingestionQueueCount,
        videoUpload: uploadQueueCount
      }
    }, 'Infrastructure health checked'));
  } catch (error) {
    next(error);
  }
});

// 23. Manual retry of source ingestion pipeline
router.post('/:wid/sources/:sid/retry', workspaceApiLimiter, requireWorkspaceOwnership, async (req, res, next) => {
  try {
    const { wid, sid } = req.params;
    const source = await workspaceContainer.workspaceSourceRepository.findById(wid, sid);
    if (!source) {
      return res.status(404).json(ApiResponse.error('Source not found.', 404));
    }

    const activeStates = ['uploading', 'validating', 'parsing', 'extracting_audio', 'generating_transcript', 'enhancing_transcript', 'semantic_cleaning', 'chunking', 'embedding', 'indexing', 'graph_building'];
    if (activeStates.includes(source.status)) {
      return res.status(400).json(ApiResponse.error('Source is already being processed.', 400));
    }

    // Reset status to retrying
    await workspaceContainer.workspaceIngestionStateMachine.transitionTo(wid, sid, 'retrying', 0, 'Re-enqueuing source for checkpoint-resilient ingestion...', {
      error: null,
      errorDetails: null
    });

    const jobData = {
      workspaceId: wid,
      sourceId: sid,
      type: source.type
    };

    if (source.type === 'youtube') {
      jobData.youtubeUrl = source.meta?.url;
      await workspaceIngestionQueue.add(`youtube-ingest-${sid}`, jobData);
    } else if (source.type === 'video') {
      jobData.fileName = source.meta?.fileName;
      jobData.storagePath = source.meta?.storagePath;
      jobData.title = source.title;
      await workspaceUploadQueue.add(`video-ingest-${sid}`, jobData);
    } else if (source.type === 'pdf') {
      jobData.fileName = source.title;
      // Buffer will reload from disk in workspace.worker.js
      await workspaceIngestionQueue.add(`pdf-ingest-${sid}`, jobData);
    } else if (source.type === 'text') {
      jobData.text = source.transcript;
      jobData.title = source.title;
      await workspaceIngestionQueue.add(`text-ingest-${sid}`, jobData);
    } else {
      return res.status(400).json(ApiResponse.error(`Unsupported source type: ${source.type}`, 400));
    }

    res.json(ApiResponse.success({ success: true, status: 'retrying' }, 'Source ingestion retried successfully'));
  } catch (error) {
    next(error);
  }
});

// 24. Sweep orphan storage files for all workspaces of a user
router.post('/infrastructure/sweep-orphans', workspaceApiLimiter, async (req, res, next) => {
  try {
    const userId = req.headers['x-workspace-user-id'] || 'default-user';
    const workspaces = await workspaceContainer.workspaceRepository.findByUser(userId);
    
    for (const ws of workspaces) {
      await workspaceContainer.workspaceCleanupManager.sweepOrphanWorkspaceFiles(ws.id);
    }
    
    res.json(ApiResponse.success({ success: true }, 'Orphan files swept successfully'));
  } catch (error) {
    next(error);
  }
});

// 25. Generate Knowledge Visual
router.post('/:wid/artifacts/generate-visual', workspaceApiLimiter, requireWorkspaceOwnership, async (req, res, next) => {
  try {
    const { wid } = req.params;
    const { prompt, visualType, artifactId: reqArtifactId, sourceDocuments, provider } = req.body;

    let artifactId = reqArtifactId;
    let version = 1;

    if (artifactId) {
      const versions = await workspaceContainer.workspaceOutputRepository.getVersionsForArtifact(wid, artifactId);
      if (versions.length > 0) {
        version = Math.max(...versions.map(v => v.version || 1)) + 1;
      }
    } else {
      const { v4: uuidv4 } = await import('uuid');
      artifactId = uuidv4();
    }

    const outputDoc = await workspaceContainer.workspaceOutputRepository.create(wid, {
      artifactId,
      artifactType: 'diagram',
      title: `Visual: ${visualType || 'Concept Diagram'}`,
      version,
      generationPrompt: prompt,
      sourceDocuments: sourceDocuments || [],
      status: 'generating',
      content: '',
      provider: provider || config.imageProvider || 'gemini',
      artifactVersion: version,
      generatedByProvider: provider || config.imageProvider || 'gemini',
      generatedByModel: '',
      sourceWorkspaceId: wid,
      sourceFiles: sourceDocuments || [],
      generatedAt: new Date().toISOString(),
    });

    // Run the actual generation asynchronously to prevent request timeout (since NVIDIA NIM takes 5-10s)
    // We update status in background and return outputDoc with "generating" status immediately
    (async () => {
      try {
        const result = await workspaceContainer.imageGenerationService.generateVisual(wid, {
          prompt,
          visualType,
          artifactId,
          version,
          sourceDocuments,
          provider,
          userId: req.userId,
        });

        await workspaceContainer.workspaceOutputRepository.update(wid, outputDoc.id, {
          status: 'ready',
          downloadUrl: result.downloadUrl,
          content: result.optimizedPrompt,
          provider: result.provider,
          generatedByProvider: result.provider,
          generatedByModel: result.model,
          generatedAt: new Date().toISOString(),
        });
      } catch (err) {
        logger.error('Background visual generation failed', { error: err.message, artifactId, version });
        await workspaceContainer.workspaceOutputRepository.update(wid, outputDoc.id, {
          status: 'error',
          content: `Generation failed: ${err.message}`,
        });
      }
    })();

    res.json(ApiResponse.success({ id: outputDoc.id, artifactId, version, status: 'generating' }, 'Visual generation started'));
  } catch (error) {
    next(error);
  }
});

// 26. Generate Presentation Outline
router.post('/:wid/artifacts/generate-outline', workspaceApiLimiter, requireWorkspaceOwnership, async (req, res, next) => {
  try {
    const { wid } = req.params;
    const { prompt, slideCount, sourceDocuments, audience, presentationType } = req.body;

    const result = await workspaceContainer.pptGenerationService.generateOutline(wid, {
      prompt,
      slideCount: Number(slideCount || 10),
      sourceDocuments,
      audience,
      presentationType,
      userId: req.userId,
    });

    res.json(ApiResponse.success(result, 'Outline generated successfully'));
  } catch (error) {
    next(error);
  }
});

// 27. Compile Presentation Slides to PPTX
router.post('/:wid/artifacts/compile-presentation', workspaceApiLimiter, requireWorkspaceOwnership, async (req, res, next) => {
  try {
    const { wid } = req.params;
    const { outline, theme, title, artifactId: reqArtifactId, sourceDocuments } = req.body;

    let artifactId = reqArtifactId;
    let version = 1;

    if (artifactId) {
      const versions = await workspaceContainer.workspaceOutputRepository.getVersionsForArtifact(wid, artifactId);
      if (versions.length > 0) {
        version = Math.max(...versions.map(v => v.version || 1)) + 1;
      }
    } else {
      const { v4: uuidv4 } = await import('uuid');
      artifactId = uuidv4();
    }

    const outputDoc = await workspaceContainer.workspaceOutputRepository.create(wid, {
      artifactId,
      artifactType: 'presentation',
      title: title || `Presentation: ${theme || 'Professional'}`,
      version,
      generationPrompt: 'Compiled from presentation outline',
      sourceDocuments: sourceDocuments || [],
      status: 'generating',
      content: JSON.stringify(outline),
      artifactVersion: version,
      generatedByProvider: 'gemini',
      generatedByModel: 'gemini-1.5-flash',
      sourceWorkspaceId: wid,
      sourceFiles: sourceDocuments || [],
      generatedAt: new Date().toISOString(),
    });

    // Run PPTX compilation asynchronously
    (async () => {
      try {
        const result = await workspaceContainer.pptGenerationService.compilePresentation(wid, {
          outline,
          theme,
          artifactId,
          version,
        });

        await workspaceContainer.workspaceOutputRepository.update(wid, outputDoc.id, {
          status: 'ready',
          downloadUrl: result.downloadUrl,
          generatedByProvider: 'gemini',
          generatedByModel: 'gemini-1.5-flash',
          generatedAt: new Date().toISOString(),
        });
      } catch (err) {
        logger.error('Background presentation compilation failed', { error: err.message, artifactId, version });
        await workspaceContainer.workspaceOutputRepository.update(wid, outputDoc.id, {
          status: 'error',
          content: `Compilation failed: ${err.message}`,
        });
      }
    })();

    res.json(ApiResponse.success({ id: outputDoc.id, artifactId, version, status: 'generating' }, 'Presentation compilation started'));
  } catch (error) {
    next(error);
  }
});

// 28. Get Versions List for Artifact
router.get('/:wid/artifacts/:aid/versions', workspaceApiLimiter, requireWorkspaceOwnership, async (req, res, next) => {
  try {
    const { wid, aid } = req.params;
    const list = await workspaceContainer.workspaceOutputRepository.getVersionsForArtifact(wid, aid);
    res.json(ApiResponse.success({ list }, 'Artifact versions fetched'));
  } catch (error) {
    next(error);
  }
});

// 29. Duplicate Artifact
router.post('/:wid/artifacts/:oid/duplicate', workspaceApiLimiter, requireWorkspaceOwnership, async (req, res, next) => {
  try {
    const { wid, oid } = req.params;
    const duplicated = await workspaceContainer.workspaceOutputRepository.duplicateArtifact(wid, oid);
    if (!duplicated) {
      return res.status(404).json(ApiResponse.error('Artifact not found', 404));
    }
    res.json(ApiResponse.success(duplicated, 'Artifact duplicated successfully'));
  } catch (error) {
    next(error);
  }
});

// 30. Rename Artifact Title
router.patch('/:wid/artifacts/:oid/rename', workspaceApiLimiter, requireWorkspaceOwnership, async (req, res, next) => {
  try {
    const { wid, oid } = req.params;
    const { title } = req.body;
    if (!title) {
      return res.status(400).json(ApiResponse.error('Title is required', 400));
    }
    const updated = await workspaceContainer.workspaceOutputRepository.update(wid, oid, { title });
    res.json(ApiResponse.success(updated, 'Artifact renamed successfully'));
  } catch (error) {
    next(error);
  }
});

// 31. Download local versioned asset
router.get('/:wid/artifacts/:aid/versions/:versionNum/download', workspaceApiLimiter, requireWorkspaceOwnership, async (req, res, next) => {
  try {
    const { wid, aid, versionNum } = req.params;
    const versions = await workspaceContainer.workspaceOutputRepository.getVersionsForArtifact(wid, aid);
    const targetVersion = versions.find(v => Number(v.version) === Number(versionNum));

    if (!targetVersion) {
      return res.status(404).json(ApiResponse.error('Version not found', 404));
    }

    const ext = targetVersion.artifactType === 'presentation' ? 'pptx' : 'png';
    const fileName = `version_${versionNum}.${ext}`;
    
    const storageService = workspaceContainer.workspaceStorageService;
    const filePath = storageService.resolveFilePath(wid, aid, fileName);

    const { default: fs } = await import('fs');
    if (!fs.existsSync(filePath)) {
      return res.status(404).json(ApiResponse.error('Local file not found on disk', 404));
    }

    res.download(filePath, `${targetVersion.title.replace(/[^\w\s-]/gi, '') || 'artifact'}_v${versionNum}.${ext}`);
  } catch (error) {
    next(error);
  }
});

// 32. Generate Knowledge Audio Summaries / Narrations
router.post('/:wid/artifacts/generate-audio', workspaceApiLimiter, requireWorkspaceOwnership, async (req, res, next) => {
  try {
    const { wid } = req.params;
    const { prompt, audioType, voice, provider, artifactId: reqArtifactId, sourceDocuments } = req.body;

    let artifactId = reqArtifactId;
    let version = 1;

    if (artifactId) {
      const versions = await workspaceContainer.workspaceOutputRepository.getVersionsForArtifact(wid, artifactId);
      if (versions.length > 0) {
        version = Math.max(...versions.map(v => v.version || 1)) + 1;
      }
    } else {
      const { v4: uuidv4 } = await import('uuid');
      artifactId = uuidv4();
    }

    const outputDoc = await workspaceContainer.workspaceOutputRepository.create(wid, {
      artifactId,
      artifactType: 'audio',
      title: `Audio: ${audioType ? audioType.replace('_', ' ') : 'Summary'}`,
      version,
      generationPrompt: prompt,
      sourceDocuments: sourceDocuments || [],
      status: 'generating',
      content: '',
      provider: provider || config.defaultAudioProvider || 'gemini',
      artifactVersion: version,
      generatedByProvider: provider || 'gemini',
      generatedByModel: 'gemini-2.5-flash',
      sourceWorkspaceId: wid,
      sourceFiles: sourceDocuments || [],
      generatedAt: new Date().toISOString(),
    });

    // Run the actual generation asynchronously to prevent request timeout (since speech/textbook synthesizers take 10s+)
    (async () => {
      try {
        const result = await workspaceContainer.audioGenerationService.generateAudio(wid, {
          prompt,
          audioType,
          voice,
          provider,
          artifactId,
          version,
          sourceDocuments,
          userId: req.userId,
        });

        await workspaceContainer.workspaceOutputRepository.update(wid, outputDoc.id, {
          status: 'ready',
          downloadUrl: result.downloadUrl,
          content: result.script, // Store text transcript inside content field
          provider: result.provider,
          generatedByProvider: result.provider,
          generatedByModel: result.model,
          generatedAt: new Date().toISOString(),
        });
      } catch (err) {
        logger.error('Background audio generation failed', { error: err.message, artifactId, version });
        await workspaceContainer.workspaceOutputRepository.update(wid, outputDoc.id, {
          status: 'error',
          content: `Audio generation failed: ${err.message}`,
        });
      }
    })();

    res.json(ApiResponse.success({ id: outputDoc.id, artifactId, version, status: 'generating' }, 'Audio generation started'));
  } catch (error) {
    next(error);
  }
});

export default router;
