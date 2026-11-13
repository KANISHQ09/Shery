import { vi, describe, it, expect } from 'vitest';
import request from 'supertest';

// ── Mock ioredis before app loads ──
vi.mock('ioredis', () => {
  return {
    default: class RedisMock {
      constructor() {}
      on() {}
    }
  };
});

// ── Mock BullMQ before app loads ──
vi.mock('bullmq', () => {
  return {
    Queue: class QueueMock {
      constructor() {}
      add() {
        return { id: 'mock-job-id' };
      }
    },
    Worker: class WorkerMock {
      constructor() {}
      on() {}
    },
    QueueEvents: class QueueEventsMock {
      constructor() {}
    }
  };
});

// ── Mock our own firebase.js configuration ──
vi.mock('../src/config/firebase.js', () => {
  const mockCollection = {
    doc: vi.fn().mockReturnThis(),
    set: vi.fn().mockResolvedValue({}),
    get: vi.fn().mockResolvedValue({
      exists: true,
      empty: true,
      docs: [],
      data: () => ({})
    }),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };
  const mockDb = {
    collection: vi.fn().mockReturnValue(mockCollection),
  };
  return {
    initializeFirebase: vi.fn(),
    getDb: vi.fn().mockReturnValue(mockDb),
    getBucket: vi.fn().mockReturnValue({
      name: 'mock-bucket',
      file: vi.fn().mockReturnValue({
        getSignedUrl: vi.fn().mockResolvedValue(['https://mock-signed-url.com']),
      }),
    }),
  };
});

// Now import the app safely
import app from '../src/app.js';
import config from '../src/config/env.js';

// Pin local storage so this test never depends on the developer's .env (or touches a real bucket)
config.storageProvider = 'local';

describe('Lesson API Integration Tests', () => {
  it('should generate a signed upload URL via request-upload-url', async () => {
    const res = await request(app)
      .post('/api/lessons/request-upload-url')
      .send({
        fileName: 'test-video.mp4',
        contentType: 'video/mp4',
        courseId: 'demo-course-001',
        title: 'Test Lecture',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.uploadUrl).toBeDefined();
    expect(res.body.data.lessonId).toBeDefined();
    expect(res.body.data.storageProvider).toBe('local'); // default in dev environment
  });

  it('should validate inputs for youtube-ingest and reject missing courseId', async () => {
    const res = await request(app)
      .post('/api/lessons/ingest-youtube')
      .send({
        title: 'Lecture Title without Course ID',
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('courseId is required.'); 
  });
});
