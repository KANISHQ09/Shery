import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import AppError from '../utils/AppError.js';

class LessonService {
  constructor({ lessonRepository, transcriptService, ingestionService, videoStorageService, chunkRepository, chunkCacheService, aiMetadataService, ingestionQueue }) {
    this.lessonRepository = lessonRepository;
    this.transcriptService = transcriptService;
    this.ingestionService = ingestionService;
    this.videoStorageService = videoStorageService;
    this.chunkRepository = chunkRepository;
    this.chunkCacheService = chunkCacheService;
    this.aiMetadataService = aiMetadataService;
    this.ingestionQueue = ingestionQueue;
  }

  baseLessonData(payload, user, overrides = {}) {
    const now = new Date().toISOString();
    return {
      lessonId: overrides.lessonId || uuidv4(),
      courseId: payload.courseId,
      moduleId: payload.moduleId || 'default',
      title: payload.title,
      description: payload.description || '',
      order: Number(payload.order || 0),
      status: 'processing',
      progress: 0,
      chunkCount: 0,
      duration: 0,
      starterQuestions: [],
      topicSegments: [],
      createdBy: user.uid,
      createdAt: now,
      updatedAt: now,
      error: null,
      ...overrides,
    };
  }

  async requestUploadUrl(payload, user) {
    const lessonId = uuidv4();
    const { uploadUrl, storagePath, storageProvider } = await this.videoStorageService.generateUploadUrl(
      lessonId,
      payload.fileName,
      payload.contentType
    );

    // Create a placeholder lesson document
    const lessonData = {
      lessonId,
      courseId: payload.courseId || 'placeholder-course',
      moduleId: payload.moduleId || 'default',
      title: payload.title || payload.fileName,
      description: payload.description || '',
      order: Number(payload.order || 0),
      status: 'uploading',
      progress: 1,
      chunkCount: 0,
      duration: 0,
      source: 'upload',
      storageProvider,
      storagePath,
      videoUrl: storageProvider === 'local' ? `/api/lessons/${lessonId}/video` : null,
      createdBy: user.uid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.lessonRepository.create(lessonData);

    return {
      lessonId,
      uploadUrl,
      storagePath,
      storageProvider,
    };
  }

  async confirmUpload(lessonId, payload, user) {
    const lesson = await this.lessonRepository.findById(lessonId);
    if (!lesson) throw new AppError('Lesson upload session not found.', 404);

    const updateData = {
      title: payload.title || lesson.title,
      description: payload.description || lesson.description,
      order: Number(payload.order || lesson.order || 0),
      courseId: payload.courseId || lesson.courseId,
      moduleId: payload.moduleId || lesson.moduleId || 'default',
      status: 'processing',
      progress: 5,
    };

    await this.lessonRepository.updateById(lessonId, updateData);

    // Enqueue the ingestion background job with exponential backoff retries
    await this.ingestionQueue.add('ingestion-job', {
      lessonId,
      fileName: payload.fileName || lesson.title,
      language: payload.language || 'auto',
      title: payload.title || lesson.title,
      source: 'upload',
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });

    return {
      lessonId,
      status: 'processing',
      message: 'Upload confirmed. Processing started in the background.',
    };
  }

  async createYoutubeLesson(payload, user) {
    const videoId = this.transcriptService.extractYoutubeId(payload.youtubeUrl);
    if (!videoId) {
      throw new AppError('Invalid YouTube URL. Supported formats: watch?v=, youtu.be/, embed/', 400);
    }

    const lessonId = uuidv4();
    const lessonData = this.baseLessonData(payload, user, {
      lessonId,
      source: 'youtube',
      youtubeUrl: payload.youtubeUrl,
      youtubeVideoId: videoId,
    });

    await this.lessonRepository.create(lessonData);

    // Enqueue the YouTube background ingestion job with exponential backoff retries
    await this.ingestionQueue.add('ingestion-job', {
      lessonId,
      youtubeUrl: payload.youtubeUrl,
      title: payload.title,
      language: payload.language || 'auto',
      source: 'youtube',
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });

    return {
      lessonId,
      status: 'processing',
      message: 'YouTube lesson created. Transcript processing started in background.',
    };
  }

  async createUrlLesson(payload, user) {
    const normalized = this.transcriptService.normalizePublicMediaUrl(payload.sourceUrl);

    if (normalized.sourceType === 'youtube') {
      return this.createYoutubeLesson({ ...payload, youtubeUrl: normalized.url }, user);
    }

    const lessonId = uuidv4();
    const lessonData = this.baseLessonData(payload, user, {
      lessonId,
      source: normalized.sourceType,
      sourceUrl: payload.sourceUrl,
      publicMediaUrl: normalized.url,
      videoUrl: normalized.url,
      status: 'processing',
      progress: 5,
    });

    await this.lessonRepository.create(lessonData);

    // Enqueue background public URL ingestion job with exponential backoff retries
    await this.ingestionQueue.add('ingestion-job', {
      lessonId,
      sourceUrl: normalized.url,
      title: payload.title,
      language: payload.language || 'auto',
      source: normalized.sourceType,
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });

    return {
      lessonId,
      status: 'processing',
      source: normalized.sourceType,
      message: 'URL lesson created. Transcript processing started in background.',
    };
  }

  async getStatus(lessonId) {
    const lesson = await this.getById(lessonId);
    return {
      lessonId,
      status: lesson.status,
      progress: lesson.progress || 0,
      chunkCount: lesson.chunkCount || 0,
      error: lesson.error || null,
      errorDetails: lesson.errorDetails || null,
    };
  }

  async getById(lessonId) {
    const lesson = await this.lessonRepository.findById(lessonId);
    if (!lesson) throw new AppError('Lesson not found.', 404);
    const { embedding, ...safeLesson } = lesson;
    return safeLesson;
  }

  formatLessonForList(lesson) {
    return {
      id: lesson.lessonId,
      lessonId: lesson.lessonId,
      title: lesson.title,
      description: lesson.description,
      order: lesson.order,
      source: lesson.source,
      status: lesson.status,
      progress: lesson.progress || 0,
      duration: lesson.duration,
      chunkCount: lesson.chunkCount,
      youtubeUrl: lesson.youtubeUrl,
      youtubeVideoId: lesson.youtubeVideoId,
      sourceUrl: lesson.sourceUrl || null,
      videoUrl: lesson.videoUrl || null,
      error: lesson.error || null,
      starterQuestions: lesson.starterQuestions || [],
      topicSegments: lesson.topicSegments || [],
      errorDetails: lesson.errorDetails || null,
      createdAt: lesson.createdAt,
      updatedAt: lesson.updatedAt,
    };
  }

  async listByCourse(courseId, { status = '', includeFailed = false } = {}) {
    const lessons = await this.lessonRepository.findAllByCourseId(courseId);
    return lessons
      .filter((lesson) => (status ? lesson.status === status : true))
      .filter((lesson) => includeFailed || status === 'failed' || lesson.status !== 'failed')
      .map((lesson) => this.formatLessonForList(lesson));
  }

  async listFailedByCourse(courseId) {
    const lessons = await this.lessonRepository.findAllByCourseId(courseId);
    const failed = lessons
      .filter((lesson) => lesson.status === 'failed')
      .map((lesson) => this.formatLessonForList(lesson));

    return {
      total: failed.length,
      lessons: failed,
    };
  }

  async deleteFailedLesson(lessonId) {
    const lesson = await this.getById(lessonId);
    if (lesson.status !== 'failed') {
      throw new AppError('Only failed lessons can be deleted from this cleanup endpoint.', 400);
    }

    return this.deleteLesson(lessonId);
  }

  async deleteLesson(lessonId) {
    const lesson = await this.getById(lessonId);
    const deletedChunks = await this.chunkRepository.deleteByLessonId(lessonId);
    const deletedVideo = await this.videoStorageService.deleteVideo(lesson.storagePath).catch(() => false);
    await this.lessonRepository.deleteById(lessonId);
    this.chunkCacheService.invalidate(lessonId);

    return {
      lessonId,
      courseId: lesson.courseId,
      deleted: true,
      deletedChunks,
      deletedVideo,
    };
  }

  async deleteFailedByCourse(courseId) {
    const failed = (await this.lessonRepository.findAllByCourseId(courseId))
      .filter((lesson) => lesson.status === 'failed');

    const results = [];
    for (const lesson of failed) {
      results.push(await this.deleteFailedLesson(lesson.lessonId));
    }

    return {
      deletedCount: results.length,
      results,
    };
  }

  async getVideo(lessonId, options = {}) {
    const lesson = await this.getById(lessonId);

    if (this.videoStorageService.isCloudStoragePath(lesson.storagePath)) {
      const signedUrl = await this.videoStorageService.getSignedVideoUrl(lesson.storagePath);
      if (signedUrl) return { type: 'redirect', url: signedUrl };
      if (!lesson.videoUrl) throw new AppError('Video file not found in cloud storage.', 404);
    }

    if (lesson.videoUrl && !lesson.videoUrl.startsWith('/api/')) {
      return { type: 'redirect', url: lesson.videoUrl };
    }

    if (!lesson.storagePath?.startsWith('local:')) {
      throw new AppError('No video file for this lesson.', 404);
    }

    const localInfo = this.videoStorageService.getLocalVideoInfo(lesson.storagePath);
    if (!localInfo) throw new AppError('Video file not found on server.', 404);

    return {
      type: 'local',
      ...localInfo,
      fileName: path.basename(localInfo.filePath),
    };
  }

  async getPlaybackUrl(lessonId) {
    const lesson = await this.getById(lessonId);

    if (this.videoStorageService.isCloudStoragePath(lesson.storagePath)) {
      const signedUrl = await this.videoStorageService.getSignedVideoUrl(lesson.storagePath);
      if (!signedUrl) throw new AppError('Video file not found in cloud storage.', 404);

      return {
        url: signedUrl,
        type: 'signed_url',
        expiresInSeconds: this.videoStorageService.signedUrlTtlSeconds(),
      };
    }

    if (lesson.videoUrl) {
      return {
        url: lesson.videoUrl,
        type: 'public_url',
        expiresInSeconds: null,
      };
    }

    if (lesson.storagePath?.startsWith('local:')) {
      return {
        url: `/api/lessons/${lessonId}/video`,
        type: 'local_stream',
        expiresInSeconds: null,
      };
    }

    throw new AppError('No video file for this lesson.', 404);
  }

  async regenerateChapters(lessonId) {
    const chunks = await this.chunkCacheService.getChunks(lessonId);
    if (!chunks.length) throw new AppError('No transcript chunks found. Process the video first.', 400);

    const topicSegments = await this.aiMetadataService.generateTopicSegments(chunks);
    await this.lessonRepository.updateById(lessonId, { topicSegments });

    return {
      count: topicSegments.length,
      topicSegments,
    };
  }

  async getTranscript(lessonId) {
    const chunks = await this.chunkCacheService.getChunks(lessonId);
    return chunks.map((chunk) => ({
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      startTime: chunk.startTime,
      endTime: chunk.endTime,
      startLabel: chunk.startLabel,
      endLabel: chunk.endLabel,
    }));
  }
}

export default LessonService;
