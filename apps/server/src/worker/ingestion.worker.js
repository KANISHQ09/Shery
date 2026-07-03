import { Worker } from 'bullmq';
import { redisConnection } from '../infrastructure/redis.js';
import container from '../container.js';
import logger from '../loggers/logger.js';

export const ingestionWorker = new Worker(
  'ingestion-queue',
  async (job) => {
    const { lessonId, youtubeUrl, sourceUrl, fileMime, fileName, language, title, source } = job.data;
    const attemptInfo = {
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts || 1,
    };
    logger.info(`Starting ingestion job ${job.id} for Lesson: ${lessonId} (Attempt ${job.attemptsMade + 1} of ${attemptInfo.maxAttempts})`);

    if (source === 'youtube') {
      await container.ingestionService.runYoutubeIngest(lessonId, youtubeUrl, title, language, attemptInfo);
    } else if (source === 'upload') {
      // In the new direct upload flow, the file is already stored in Supabase or local disk.
      // We read the file from storage, submit to AssemblyAI, etc.
      // Let's pass the parameters accordingly.
      await container.ingestionService.runUploadIngest(lessonId, null, fileMime, fileName, language, title, attemptInfo);
    } else if (source === 'external_url' || source === 'google_drive' || source === 'zoom') {
      await container.ingestionService.runPublicUrlIngest(lessonId, sourceUrl, title, language, attemptInfo);
    }
  },
  {
    connection: redisConnection,
    concurrency: 2, // Concurrency limit of 2 for ingestion workers to prevent CPU overload
    stalledInterval: 180000, // Check for stalled jobs every 3 minutes (reduces polling commands)
    lockDuration: 60000,     // Extend lock duration to 60s to reduce renew frequency
    lockRenewTime: 20000,    // Renew every 20s
    metrics: { maxDataPoints: 0 }, // Disable metrics collection to prevent extra Redis writes
  }
);

ingestionWorker.on('completed', (job) => {
  logger.info(`Ingestion job ${job.id} completed successfully`);
});

ingestionWorker.on('failed', (job, err) => {
  logger.error(`Ingestion job ${job?.id} failed: ${err.message}`, { stack: err.stack });
});

export default ingestionWorker;
