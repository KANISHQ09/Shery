import { getDb } from '../config/firebase.js';
import { geminiFlash } from '../config/gemini.js';
import { nvidiaChatProvider } from '../providers/nvidiaChat.provider.js';
import { getQdrantClient } from '../infrastructure/qdrant.js';
import config from '../config/env.js';
import { redisConnection } from '../infrastructure/redis.js';
import HotWorkspaceCacheService from '../services/workspace/hotWorkspaceCache.service.js';

// Repositories
import WorkspaceRepository from '../repositories/workspace/workspace.repository.js';
import WorkspaceSourceRepository from '../repositories/workspace/workspaceSource.repository.js';
import WorkspaceChatRepository from '../repositories/workspace/workspaceChat.repository.js';
import WorkspaceOutputRepository from '../repositories/workspace/workspaceOutput.repository.js';
import WorkspaceMemoryRepository from '../repositories/workspace/workspaceMemory.repository.js';
import TranscriptCacheRepository from '../repositories/workspace/transcriptCache.repository.js';
import GenerationLogRepository from '../repositories/workspace/generationLog.repository.js';

// Services
import EmbeddingService from '../services/workspace/embedding.service.js';
import VectorSearchService from '../services/workspace/vectorSearch.service.js';
import ContextManagerService from '../services/workspace/contextManager.service.js';
import WorkspaceMemoryService from '../services/workspace/workspaceMemory.service.js';
import SourceGraphService from '../services/workspace/sourceGraph.service.js';
import PdfParserService from '../services/workspace/pdfParser.service.js';
import TranscriptPostProcessorService from '../services/workspace/transcriptPostProcessor.service.js';
import WorkspaceChunkingService from '../services/workspace/workspaceChunking.service.js';
import TopicExtractionService from '../services/workspace/topicExtraction.service.js';
import IngestionTracerService from '../services/workspace/ingestionTracer.service.js';
import IngestionService from '../services/workspace/ingestion.service.js';
import WorkspaceChatService from '../services/workspace/workspaceChat.service.js';
import StudioGenerationService from '../services/workspace/studioGeneration.service.js';
import ImageGenerationService from '../services/workspace/imageGeneration.service.js';
import PptGenerationService from '../services/workspace/pptGeneration.service.js';
import MediaProviderService from '../services/workspace/mediaProvider.service.js';
import AudioGenerationService from '../services/workspace/audioGeneration.service.js';

// New Intelligence Services
import RetrievalEvaluationService from '../services/workspace/retrievalEvaluation.service.js';
import LearningIntelligenceService from '../services/workspace/learningIntelligence.service.js';
import KnowledgeCoverageService from '../services/workspace/knowledgeCoverage.service.js';
import PromptClassifierService from '../services/workspace/promptClassifier.service.js';
import audioProvider from '../providers/audio.provider.js';
import presentationProvider from '../providers/presentation.provider.js';

// New Ingestion & State Hardening Services
import EmbeddingProviderRegistryService from '../services/workspace/embeddingProviderRegistry.service.js';
import VectorInfrastructureManager from '../services/workspace/vectorInfrastructureManager.service.js';
import WorkspaceIngestionStateMachine from '../services/workspace/workspaceIngestionStateMachine.service.js';
import SafePipelineExecutorService from '../services/workspace/safePipelineExecutor.service.js';
import WorkspaceCleanupManager from '../services/workspace/workspaceCleanupManager.service.js';
import WorkspaceLocalVideoPipeline from '../services/workspace/workspaceLocalVideoPipeline.service.js';
import WorkspaceYoutubePipeline from '../services/workspace/workspaceYoutubePipeline.service.js';
import WorkspaceYoutubeTranscriptFetcherService from '../services/workspace/workspaceYoutubeTranscriptFetcher.service.js';

// Local Video Ingestion Services
import WorkspaceStorageService from '../services/workspace/workspaceStorage.service.js';
import WorkspaceTranscriptionService from '../services/workspace/workspaceTranscription.service.js';
import WorkspaceTranscriptEnhancerService from '../services/workspace/workspaceTranscriptEnhancer.service.js';
import WorkspaceVideoIntelligenceService from '../services/workspace/workspaceVideoIntelligence.service.js';
import WorkspaceVideoProcessorService from '../services/workspace/workspaceVideoProcessor.service.js';
import WorkspaceVideoUploadService from '../services/workspace/workspaceVideoUpload.service.js';
import WorkspaceUploadTelemetryService from '../services/workspace/workspaceUploadTelemetry.service.js';

class WorkspaceContainer {
  constructor() {
    // 1. Repositories
    this.workspaceRepository = new WorkspaceRepository(getDb);
    this.workspaceSourceRepository = new WorkspaceSourceRepository(getDb);
    this.workspaceChatRepository = new WorkspaceChatRepository(getDb);
    this.workspaceOutputRepository = new WorkspaceOutputRepository(getDb);
    this.workspaceMemoryRepository = new WorkspaceMemoryRepository(getDb);
    this.transcriptCacheRepository = new TranscriptCacheRepository(getDb);
    this.generationLogRepository = new GenerationLogRepository(getDb);

    // 2. Auxiliary Services
    this.pdfParserService = new PdfParserService();
    this.transcriptPostProcessorService = new TranscriptPostProcessorService({ geminiFlash });
    this.workspaceChunkingService = new WorkspaceChunkingService();
    this.topicExtractionService = new TopicExtractionService({ geminiFlash });
    
    this.ingestionTracerService = new IngestionTracerService({
      workspaceSourceRepository: this.workspaceSourceRepository
    });

    this.embeddingProviderRegistry = new EmbeddingProviderRegistryService({ config });

    // FIX: Instantiate stateMachine and executor BEFORE embeddingService so they
    // are not undefined when injected as constructor dependencies.
    this.workspaceIngestionStateMachine = new WorkspaceIngestionStateMachine({
      workspaceSourceRepository: this.workspaceSourceRepository
    });

    this.safePipelineExecutorService = new SafePipelineExecutorService();

    this.embeddingService = new EmbeddingService({
      embeddingProviderRegistry: this.embeddingProviderRegistry,
      qdrantClient: getQdrantClient(),
      config,
      dbProvider: getDb,
      workspaceSourceRepository: this.workspaceSourceRepository,
      workspaceIngestionStateMachine: this.workspaceIngestionStateMachine
    });

    this.hotWorkspaceCacheService = new HotWorkspaceCacheService({
      redisClient: redisConnection,
      workspaceSourceRepository: this.workspaceSourceRepository
    });

    this.vectorSearchService = new VectorSearchService({
      embeddingService: this.embeddingService,
      qdrantClient: getQdrantClient(),
      aiClient: geminiFlash,
      hotWorkspaceCacheService: this.hotWorkspaceCacheService
    });

    this.vectorInfrastructureManager = new VectorInfrastructureManager({
      dbProvider: getDb,
      embeddingService: this.embeddingService,
      workspaceSourceRepository: this.workspaceSourceRepository,
    });

    this.contextManagerService = new ContextManagerService({
      embeddingService: this.embeddingService
    });

    this.sourceGraphService = new SourceGraphService({
      workspaceSourceRepository: this.workspaceSourceRepository,
      vectorSearchService: this.vectorSearchService
    });

    this.workspaceMemoryService = new WorkspaceMemoryService({
      workspaceMemoryRepository: this.workspaceMemoryRepository,
      sourceGraphService: this.sourceGraphService
    });

    // New Intelligence Registrations
    this.retrievalEvaluationService = new RetrievalEvaluationService();

    this.learningIntelligenceService = new LearningIntelligenceService({
      sourceGraphService: this.sourceGraphService,
      workspaceChatRepository: this.workspaceChatRepository,
      workspaceMemoryRepository: this.workspaceMemoryRepository,
    });

    this.knowledgeCoverageService = new KnowledgeCoverageService({
      sourceGraphService: this.sourceGraphService,
      workspaceSourceRepository: this.workspaceSourceRepository,
    });

    this.promptClassifierService = new PromptClassifierService({ geminiFlash });

    // Local Video Ingestion Services Instantiation
    this.workspaceStorageService = new WorkspaceStorageService();
    this.workspaceTranscriptionService = new WorkspaceTranscriptionService();
    this.workspaceTranscriptEnhancerService = new WorkspaceTranscriptEnhancerService({ aiClient: geminiFlash });
    this.workspaceVideoIntelligenceService = new WorkspaceVideoIntelligenceService();
    this.workspaceVideoProcessorService = new WorkspaceVideoProcessorService();
    this.workspaceVideoUploadService = new WorkspaceVideoUploadService({ workspaceStorageService: this.workspaceStorageService });
    this.workspaceUploadTelemetryService = new WorkspaceUploadTelemetryService({ ingestionTracerService: this.ingestionTracerService });

    // NOTE: workspaceIngestionStateMachine and safePipelineExecutorService are
    // already instantiated above (before embeddingService). Only cleanup manager
    // needs to be wired here.
    this.workspaceCleanupManager = new WorkspaceCleanupManager({
      embeddingService: this.embeddingService,
      workspaceStorageService: this.workspaceStorageService,
      workspaceSourceRepository: this.workspaceSourceRepository
    });

    // YouTube transcript fetcher — multi-strategy caption engine
    this.workspaceYoutubeTranscriptFetcherService = new WorkspaceYoutubeTranscriptFetcherService();

    // 3. Core Ingestion Orchestrator
    this.ingestionService = new IngestionService({
      workspaceSourceRepository: this.workspaceSourceRepository,
      workspaceRepository: this.workspaceRepository,
      transcriptCacheRepository: this.transcriptCacheRepository,
      pdfParserService: this.pdfParserService,
      transcriptPostProcessorService: this.transcriptPostProcessorService,
      workspaceChunkingService: this.workspaceChunkingService,
      topicExtractionService: this.topicExtractionService,
      embeddingService: this.embeddingService,
      sourceGraphService: this.sourceGraphService,
      ingestionTracerService: this.ingestionTracerService,
      workspaceIngestionStateMachine: this.workspaceIngestionStateMachine,
      safePipelineExecutorService: this.safePipelineExecutorService,
      workspaceCleanupManager: this.workspaceCleanupManager,
      workspaceStorageService: this.workspaceStorageService, // NEW: storage abstraction for PDF saves
    });

    // Hardened pipelines
    this.workspaceLocalVideoPipeline = new WorkspaceLocalVideoPipeline({
      workspaceStorageService: this.workspaceStorageService,
      workspaceVideoProcessorService: this.workspaceVideoProcessorService,
      workspaceTranscriptionService: this.workspaceTranscriptionService,
      workspaceTranscriptEnhancerService: this.workspaceTranscriptEnhancerService,
      workspaceVideoIntelligenceService: this.workspaceVideoIntelligenceService,
      workspaceChunkingService: this.workspaceChunkingService,
      topicExtractionService: this.topicExtractionService,
      embeddingService: this.embeddingService,
      workspaceIngestionStateMachine: this.workspaceIngestionStateMachine,
      safePipelineExecutorService: this.safePipelineExecutorService,
      workspaceCleanupManager: this.workspaceCleanupManager,
      workspaceSourceRepository: this.workspaceSourceRepository,
      ingestionService: this.ingestionService,
      transcriptPostProcessorService: this.transcriptPostProcessorService, // FIX: wire postProcessor
    });

    this.workspaceYoutubePipeline = new WorkspaceYoutubePipeline({
      workspaceTranscriptionService: this.workspaceTranscriptionService,
      transcriptPostProcessorService: this.transcriptPostProcessorService,
      workspaceChunkingService: this.workspaceChunkingService,
      topicExtractionService: this.topicExtractionService,
      embeddingService: this.embeddingService,
      workspaceIngestionStateMachine: this.workspaceIngestionStateMachine,
      safePipelineExecutorService: this.safePipelineExecutorService,
      workspaceCleanupManager: this.workspaceCleanupManager,
      workspaceSourceRepository: this.workspaceSourceRepository,
      transcriptCacheRepository: this.transcriptCacheRepository,
      ingestionService: this.ingestionService,
      workspaceYoutubeTranscriptFetcherService: this.workspaceYoutubeTranscriptFetcherService,
    });

    // 4. Core User Interaction Services
    this.workspaceChatService = new WorkspaceChatService({
      vectorSearchService: this.vectorSearchService,
      contextManagerService: this.contextManagerService,
      workspaceMemoryService: this.workspaceMemoryService,
      workspaceChatRepository: this.workspaceChatRepository,
      chatProvider: nvidiaChatProvider,
      retrievalEvaluationService: this.retrievalEvaluationService,
      workspaceSourceRepository: this.workspaceSourceRepository,
    });

    this.studioGenerationService = new StudioGenerationService({
      vectorSearchService: this.vectorSearchService,
      contextManagerService: this.contextManagerService,
      workspaceOutputRepository: this.workspaceOutputRepository,
      workspaceSourceRepository: this.workspaceSourceRepository,
      chatProvider: nvidiaChatProvider, // NVIDIA primary (internal fallback chain)
      geminiFlash,                      // Gemini cross-provider fallback
    });

    this.mediaProviderService = new MediaProviderService();

    this.audioGenerationService = new AudioGenerationService({
      audioProvider,
      vectorSearchService: this.vectorSearchService,
      contextManagerService: this.contextManagerService,
      generationLogRepository: this.generationLogRepository,
    });

    this.imageGenerationService = new ImageGenerationService({
      geminiFlash,
      workspaceStorageService: this.workspaceStorageService,
      workspaceOutputRepository: this.workspaceOutputRepository,
      mediaProviderService: this.mediaProviderService,
      promptClassifierService: this.promptClassifierService,
      generationLogRepository: this.generationLogRepository,
    });

    this.pptGenerationService = new PptGenerationService({
      presentationProvider,
      vectorSearchService: this.vectorSearchService,
      contextManagerService: this.contextManagerService,
      workspaceStorageService: this.workspaceStorageService,
      workspaceOutputRepository: this.workspaceOutputRepository,
      generationLogRepository: this.generationLogRepository,
    });
  }
}

const workspaceContainer = new WorkspaceContainer();
export default workspaceContainer;
