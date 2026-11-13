import fs from 'fs';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import AppError from '../utils/AppError.js';
import config from '../config/env.js';
import { hasDemoAdminPasscode } from '../middleware/demoAdmin.js';

class LessonController {
  constructor(lessonService) {
    this.lessonService = lessonService;
  }

  assertInstructor(req) {
    if (req.user?.role !== 'instructor') {
      throw new AppError('Only instructors can delete lessons.', 403);
    }
  }

  /**
   * Demo protection (always on in production, or locally when DEMO_ADMIN_PASSCODE is set): a visitor may only delete lessons they
   * created themselves; the team passcode is required to delete anyone else's (e.g. prepared demo lessons).
   */
  async assertCanDelete(req, lessonId) {
    this.assertInstructor(req);
    if (!config.demoProtection || hasDemoAdminPasscode(req)) return;

    const lesson = await this.lessonService.getById(lessonId);
    if (lesson.createdBy !== req.user.uid) {
      throw new AppError('This lesson is protected for the demo. Only lessons you added can be deleted.', 403, {
        type: 'demo_protected',
      });
    }
  }

  parseRangeHeader(rangeHeader, fileSize) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader || '');
    if (!match) return null;

    const [, rawStart, rawEnd] = match;
    if (!rawStart && !rawEnd) return null;

    let start;
    let end;

    if (!rawStart) {
      const suffixLength = Number(rawEnd);
      if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null;
      start = Math.max(fileSize - suffixLength, 0);
      end = fileSize - 1;
    } else {
      start = Number(rawStart);
      end = rawEnd ? Number(rawEnd) : Math.min(start + 10 * 1024 * 1024, fileSize - 1);
    }

    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= fileSize) {
      return null;
    }

    return {
      start,
      end: Math.min(end, fileSize - 1),
    };
  }

  requestUploadUrl = asyncHandler(async (req, res) => {
    const result = await this.lessonService.requestUploadUrl(req.body, req.user);
    res.status(200).json(ApiResponse.success(result, 'Signed upload URL generated successfully'));
  });

  confirmUpload = asyncHandler(async (req, res) => {
    const result = await this.lessonService.confirmUpload(req.params.lessonId, req.body, req.user);
    res.status(200).json(ApiResponse.success(result, result.message));
  });

  localUploadEmulator = asyncHandler(async (req, res) => {
    // Development-only stand-in for cloud signed uploads. Disabled with cloud storage, and it only
    // accepts the exact file a pending lesson is waiting for, up to the configured size limit.
    if (config.storageProvider !== 'local') {
      throw new AppError('Not found', 404);
    }

    const { fileName } = req.params;
    const lessonId = fileName.replace(/\.[a-z0-9]+$/i, '');
    const lesson = await this.lessonService.lessonRepository.findById(lessonId).catch(() => null);
    if (!lesson || lesson.storagePath !== `local:${fileName}`) {
      throw new AppError('No pending upload for this file.', 404);
    }

    const maxBytes = config.maxVideoUploadMb * 1024 * 1024;
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > maxBytes) {
      throw new AppError(`File too large. Maximum upload size is ${config.maxVideoUploadMb} MB.`, 413);
    }

    const localPath = this.lessonService.videoStorageService.resolveLocalVideoPath(`local:${fileName}`);
    const writeStream = fs.createWriteStream(localPath);
    let received = 0;

    await new Promise((resolve, reject) => {
      req.on('data', (chunk) => {
        received += chunk.length;
        if (received > maxBytes) {
          req.unpipe(writeStream);
          writeStream.destroy();
          fs.promises.unlink(localPath).catch(() => {});
          reject(new AppError(`File too large. Maximum upload size is ${config.maxVideoUploadMb} MB.`, 413));
        }
      });
      req.pipe(writeStream);
      writeStream.on('finish', resolve);
      req.on('error', reject);
      writeStream.on('error', reject);
    });

    res.status(200).json(ApiResponse.success({ fileName }, 'Local file uploaded successfully via emulator'));
  });

  ingestYoutube = asyncHandler(async (req, res) => {
    const result = await this.lessonService.createYoutubeLesson(req.body, req.user);
    res.status(201).json(ApiResponse.success(result, result.message, 201));
  });

  ingestUrl = asyncHandler(async (req, res) => {
    const result = await this.lessonService.createUrlLesson(req.body, req.user);
    res.status(201).json(ApiResponse.success(result, result.message, 201));
  });

  // Legacy upload endpoint (kept for backward compatibility during transition)
  upload = asyncHandler(async (req, res) => {
    const result = await this.lessonService.createUploadedLesson(req.body, req.file, req.user);
    res.status(201).json(ApiResponse.success(result, result.message, 201));
  });

  status = asyncHandler(async (req, res) => {
    const status = await this.lessonService.getStatus(req.params.lessonId);
    res.json(ApiResponse.success(status, 'Lesson status fetched'));
  });

  video = asyncHandler(async (req, res) => {
    const video = await this.lessonService.getVideo(req.params.lessonId, {
      delivery: req.query.delivery,
    });
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    if (video.type === 'redirect') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.redirect(302, video.url);
    }

    const rangeHeader = req.headers.range;
    if (rangeHeader) {
      const range = this.parseRangeHeader(rangeHeader, video.fileSize);

      if (!range) {
        res.writeHead(416, {
          'Content-Range': `bytes */${video.fileSize}`,
          'Accept-Ranges': 'bytes',
        });
        return res.end();
      }

      const { start, end } = range;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${video.fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': video.contentType,
        'Cross-Origin-Resource-Policy': 'cross-origin',
      });
      return fs.createReadStream(video.filePath, { start, end }).pipe(res);
    }

    res.writeHead(200, {
      'Content-Length': video.fileSize,
      'Content-Type': video.contentType,
      'Accept-Ranges': 'bytes',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    return fs.createReadStream(video.filePath).pipe(res);
  });

  playbackUrl = asyncHandler(async (req, res) => {
    const playback = await this.lessonService.getPlaybackUrl(req.params.lessonId);
    res.json(ApiResponse.success(playback, 'Playback URL fetched'));
  });

  getById = asyncHandler(async (req, res) => {
    const lesson = await this.lessonService.getById(req.params.lessonId);
    res.json(ApiResponse.success({ lesson }, 'Lesson fetched'));
  });

  list = asyncHandler(async (req, res) => {
    const lessons = await this.lessonService.listByCourse(req.query.courseId, {
      status: req.query.status,
      includeFailed: req.query.includeFailed,
    });
    res.json(ApiResponse.success({ lessons }, 'Lessons fetched'));
  });

  failed = asyncHandler(async (req, res) => {
    const result = await this.lessonService.listFailedByCourse(req.query.courseId);
    res.json(ApiResponse.success(result, 'Failed lessons fetched'));
  });

  deleteFailed = asyncHandler(async (req, res) => {
    this.assertInstructor(req);
    // Without the team passcode, the bulk cleanup only removes the visitor's own failed lessons.
    const onlyCreatedBy = config.demoProtection && !hasDemoAdminPasscode(req) ? req.user.uid : null;
    const result = await this.lessonService.deleteFailedByCourse(req.query.courseId, { onlyCreatedBy });
    res.json(ApiResponse.success(result, 'Failed lessons deleted'));
  });

  deleteFailedLesson = asyncHandler(async (req, res) => {
    await this.assertCanDelete(req, req.params.lessonId);
    const result = await this.lessonService.deleteFailedLesson(req.params.lessonId);
    res.json(ApiResponse.success(result, 'Failed lesson deleted'));
  });

  deleteLesson = asyncHandler(async (req, res) => {
    await this.assertCanDelete(req, req.params.lessonId);
    const result = await this.lessonService.deleteLesson(req.params.lessonId);
    res.json(ApiResponse.success(result, 'Lesson deleted'));
  });

  regenerateChapters = asyncHandler(async (req, res) => {
    const result = await this.lessonService.regenerateChapters(req.params.lessonId);
    res.json(ApiResponse.success(result, 'Chapters regenerated'));
  });

  transcript = asyncHandler(async (req, res) => {
    const chunks = await this.lessonService.getTranscript(req.params.lessonId);
    const message = chunks.length ? 'Transcript fetched' : 'No transcript available yet.';
    res.json(ApiResponse.success({ chunks, total: chunks.length, message }, message));
  });
}

export default LessonController;
