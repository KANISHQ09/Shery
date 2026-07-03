import { Queue, QueueEvents } from 'bullmq';
import { redisConnection } from './redis.js';

export const workspaceUploadQueue = new Queue('workspace-upload-queue', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: true,
  },
});

export const workspaceUploadQueueEvents = new QueueEvents('workspace-upload-queue', {
  connection: redisConnection,
});

export default workspaceUploadQueue;
