import fs from 'fs';
import logger from '../loggers/logger.js';

class LessonIngestionService {
  constructor({ lessonRepository, transcriptService, chunkingService, chunkRepository, aiMetadataService, chunkCacheService, videoStorageService, embeddingService }) {
    this.lessonRepository = lessonRepository;
    this.transcriptService = transcriptService;
    this.chunkingService = chunkingService;
    this.chunkRepository = chunkRepository;
    this.aiMetadataService = aiMetadataService;
    this.chunkCacheService = chunkCacheService;
    this.videoStorageService = videoStorageService;
    this.embeddingService = embeddingService;
  }

  async updateLessonStatus(lessonId, fields) {
    return this.lessonRepository.updateById(lessonId, fields);
  }

  async safeProgress(lessonId, status, progress) {
    await this.updateLessonStatus(lessonId, { status, progress }).catch(() => {});
  }

  async saveTranscriptArtifacts(lessonId, normalizedTranscript, title, progress = {}) {
    const {
      chunkProgress = 60,
      metadataProgress = 85,
      finalProgress = 95,
    } = progress;

    const chunks = this.chunkingService.chunkTranscript(normalizedTranscript);
    if (!chunks.length) throw new Error('No chunks generated - transcript may be too short or empty.');

    await this.safeProgress(lessonId, 'processing', chunkProgress);
    await this.chunkRepository.saveMany(lessonId, chunks, (savedCount) => (
      this.lessonRepository.updateById(lessonId, { chunkCount: savedCount })
    ));

    if (this.embeddingService) {
      try {
        const lesson = await this.lessonRepository.findById(lessonId);
        const courseId = lesson?.courseId || 'default-course';
        
        const formattedChunks = chunks.map(c => ({
          ...c,
          sourceId: lessonId,
          sourceTitle: title || lesson?.title || 'Lesson Video',
          sourceType: 'video',
          priorityTier: 2,
        }));

        await this.embeddingService.indexChunks(courseId, lessonId, formattedChunks);
        logger.info('Lesson chunks indexed in Qdrant successfully', { lessonId, courseId });
      } catch (embedErr) {
        logger.error('Failed to index lesson chunks in Qdrant (non-fatal)', { lessonId, error: embedErr.message });
      }
    }

    await this.safeProgress(lessonId, 'processing', metadataProgress);
    const [starterQuestions, topicSegments] = await Promise.all([
      this.aiMetadataService.generateStarterQuestions(chunks, title),
      this.aiMetadataService.generateTopicSegments(chunks),
    ]);

    await this.safeProgress(lessonId, 'processing', finalProgress);
    await this.updateLessonStatus(lessonId, {
      status: 'ready',
      progress: 100,
      chunkCount: chunks.length,
      duration: chunks[chunks.length - 1]?.endTime || 0,
      starterQuestions,
      topicSegments,
      error: null,
    });

    this.chunkCacheService.invalidate(lessonId);
    return chunks;
  }

  async runYoutubeIngest(lessonId, youtubeUrl, title, language = 'auto', attemptInfo = {}) {
    const { attemptsMade = 0, maxAttempts = 1 } = attemptInfo;
    const isFinalAttempt = attemptsMade >= maxAttempts - 1;
    logger.info('YouTube ingest started', { lessonId, language, attemptsMade, maxAttempts });

    try {
      await this.safeProgress(lessonId, 'transcribing', 10);
      const normalizedTranscript = await this.transcriptService.fetchYoutubeTranscript(youtubeUrl, language);

      await this.safeProgress(lessonId, 'processing', 40);
      await this.saveTranscriptArtifacts(lessonId, normalizedTranscript, title);
      logger.info('YouTube ingest completed', { lessonId });
    } catch (err) {
      const errorDetails = err.details || null;
      const suggestedAction = errorDetails?.suggestedAction || null;
      logger.error('YouTube ingest failed', { lessonId, error: err.message, attemptsMade, maxAttempts, suggestedAction });
      
      if (isFinalAttempt) {
        await this.updateLessonStatus(lessonId, {
          status: 'failed',
          progress: 0,
          error: err.message,
          errorDetails: {
            reason: errorDetails?.reason || 'youtube_ingest_failed',
            attempts: attemptsMade + 1,
            suggestedAction,
          },
          suggestedAction,
        }).catch(() => {});
      } else {
        await this.updateLessonStatus(lessonId, {
          status: 'transcribing',
          progress: 10,
          error: `YouTube ingest failed, retrying (attempt ${attemptsMade + 1} of ${maxAttempts})... ${err.message}`,
        }).catch(() => {});
      }
      throw err;
    }
  }

  async runPublicUrlIngest(lessonId, publicMediaUrl, title, language = 'auto', attemptInfo = {}) {
    const { attemptsMade = 0, maxAttempts = 1 } = attemptInfo;
    const isFinalAttempt = attemptsMade >= maxAttempts - 1;
    logger.info('URL ingest started', { lessonId, language, attemptsMade, maxAttempts });

    try {
      await this.safeProgress(lessonId, 'transcribing', 12);
      const transcriptId = await this.transcriptService.submitTranscript(publicMediaUrl, language);
      const rawTranscript = await this.transcriptService.pollTranscriptUntilDone(
        transcriptId,
        (pct) => this.safeProgress(lessonId, 'transcribing', pct),
        15,
        78,
      );

      const normalizedTranscript = this.transcriptService.normalizeAssemblyResult(rawTranscript);
      await this.safeProgress(lessonId, 'processing', 79);
      await this.saveTranscriptArtifacts(lessonId, normalizedTranscript, title, {
        chunkProgress: 82,
        metadataProgress: 88,
        finalProgress: 95,
      });
      logger.info('URL ingest completed', { lessonId });
    } catch (err) {
      logger.error('URL ingest failed', { lessonId, error: err.message, attemptsMade, maxAttempts });
      
      if (isFinalAttempt) {
        await this.updateLessonStatus(lessonId, {
          status: 'failed',
          progress: 0,
          error: err.message,
          errorDetails: {
            reason: 'url_ingest_failed',
            attempts: attemptsMade + 1,
          }
        }).catch(() => {});
      } else {
        await this.updateLessonStatus(lessonId, {
          status: 'transcribing',
          progress: 12,
          error: `URL ingest failed, retrying (attempt ${attemptsMade + 1} of ${maxAttempts})... ${err.message}`,
        }).catch(() => {});
      }
      throw err;
    }
  }

  async runUploadIngest(lessonId, fileBuffer, fileMime, fileName, language, title, attemptInfo = {}) {
    const { attemptsMade = 0, maxAttempts = 1 } = attemptInfo;
    const isFinalAttempt = attemptsMade >= maxAttempts - 1;
    logger.info('Upload ingest started', { lessonId, language, attemptsMade, maxAttempts });

    try {
      const lesson = await this.lessonRepository.findById(lessonId);
      if (!lesson) throw new Error('Lesson record not found.');

      await this.safeProgress(lessonId, 'transcribing', 10);

      let mediaUrl;

      if (lesson.storagePath?.startsWith('supabase:')) {
        // Supabase mode: Generate a signed read URL for AssemblyAI
        const signedUrl = await this.videoStorageService.getSignedVideoUrl(lesson.storagePath);
        if (!signedUrl) throw new Error('Could not generate Supabase signed read URL for transcribing.');
        mediaUrl = signedUrl;
      } else {
        // Local dev mode: Read the file from local disk and upload to AssemblyAI
        const localPath = this.videoStorageService.resolveLocalVideoPath(lesson.storagePath);
        if (!fs.existsSync(localPath)) {
          throw new Error(`Local file not found at ${localPath}`);
        }
        const fileContent = await fs.promises.readFile(localPath);
        mediaUrl = await this.transcriptService.uploadBufferToAssemblyAI(fileContent);
      }

      await this.safeProgress(lessonId, 'transcribing', 20);

      const transcriptId = await this.transcriptService.submitTranscript(mediaUrl, language);
      const rawTranscript = await this.transcriptService.pollTranscriptUntilDone(
        transcriptId,
        (pct) => this.safeProgress(lessonId, 'transcribing', pct),
        21,
        78,
      );

      const normalizedTranscript = this.transcriptService.normalizeAssemblyResult(rawTranscript);
      await this.safeProgress(lessonId, 'processing', 79);

      await this.saveTranscriptArtifacts(lessonId, normalizedTranscript, title, {
        chunkProgress: 82,
        metadataProgress: 88,
        finalProgress: 95,
      });

      logger.info('Upload ingest completed', { lessonId });
    } catch (err) {
      logger.error('Upload ingest failed', { lessonId, error: err.message, attemptsMade, maxAttempts });
      
      if (isFinalAttempt) {
        await this.updateLessonStatus(lessonId, {
          status: 'failed',
          progress: 0,
          error: err.message,
          errorDetails: {
            reason: 'upload_ingest_failed',
            attempts: attemptsMade + 1,
          }
        }).catch(() => {});
      } else {
        await this.updateLessonStatus(lessonId, {
          status: 'transcribing',
          progress: 20,
          error: `Upload ingest failed, retrying (attempt ${attemptsMade + 1} of ${maxAttempts})... ${err.message}`,
        }).catch(() => {});
      }
      throw err;
    }
  }
}

export default LessonIngestionService;
