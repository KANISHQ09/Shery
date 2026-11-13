import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import config from '../src/config/env.js';
import { nvidiaChatProvider } from '../src/providers/nvidiaChat.provider.js';
import { runStartupHealthChecks } from '../src/config/startupHealthCheck.js';
import { withExponentialBackoff } from '../src/utils/aiReliabilityWrapper.js';

// Mock Qdrant
vi.mock('../src/infrastructure/qdrant.js', () => ({
  qdrantHealthCheck: vi.fn(() => Promise.resolve({ healthy: true })),
  ensureQdrantCollection: vi.fn(() => Promise.resolve())
}));

// Mock DI Container
vi.mock('../src/container.js', () => ({
  default: {
    embeddingService: {
      providerRegistry: {
        generateEmbeddings: vi.fn(() => Promise.resolve([[0.1, 0.2]]))
      }
    }
  }
}));

describe('AI Providers & Reliability Refactor', () => {
  let mockFetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    config.nvidiaApiKey = 'mock-nvidia-key';
    config.geminiApiKey = 'mock-gemini-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('nvidiaChat.provider', () => {
    it('should fall back across the model chain if primary fails', async () => {
      let callCount = 0;
      const mockCompletionsCreate = vi.fn().mockImplementation((options) => {
        callCount++;
        if (options.model === 'nvidia/nemotron-3.5-lightning-30b-a3b') {
          throw new Error('API Rate Limit or Quota Exceeded on Nemotron');
        }
        if (options.model === 'nvidia/nemotron-3.5-bolt-e4b') {
          return Promise.resolve({
            choices: [{ message: { content: 'Response from Bolt' } }]
          });
        }
        return Promise.reject(new Error('Should not reach final fallback'));
      });

      nvidiaChatProvider.getClient = () => ({
        chat: { completions: { create: mockCompletionsCreate } }
      });

      const res = await nvidiaChatProvider.generate('Hello world');
      expect(callCount).toBe(2); // Lightning, then Bolt
      expect(res.response.text()).toBe('Response from Bolt');
    });

    it('should complete with final fallback model if both primary and secondary fail', async () => {
      let callCount = 0;
      const mockCompletionsCreate = vi.fn().mockImplementation((options) => {
        callCount++;
        if (options.model === 'nvidia/nemotron-3.5-lightning-30b-a3b' || options.model === 'nvidia/nemotron-3.5-bolt-e4b') {
          throw new Error('Unavailable');
        }
        if (options.model === 'nvidia/nemotron-3-ultra-550b-a55b') {
          return Promise.resolve({
            choices: [{ message: { content: 'Response from Ultra' } }]
          });
        }
        return Promise.reject(new Error('Unknown model'));
      });

      nvidiaChatProvider.getClient = () => ({
        chat: { completions: { create: mockCompletionsCreate } }
      });

      const res = await nvidiaChatProvider.generate('Hello world');
      expect(callCount).toBe(3); // Lightning -> Bolt -> Ultra
      expect(res.response.text()).toBe('Response from Ultra');
    });
  });

  describe('withExponentialBackoff', () => {
    it('should retry matching execution times', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary API error');
        }
        return 'success';
      };

      const result = await withExponentialBackoff(fn, 3, 5);
      expect(attempts).toBe(3);
      expect(result).toBe('success');
    });
  });

  describe('Startup health checks', () => {
    it('should run successfully under normal healthy conditions', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ models: [{ name: 'models/gemini-3.5-flash-lite' }] })
      });

      // Mock Gemini & NVIDIA Clients completion creation
      const mockCompletionsCreate = vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'ok' } }]
      });
      const mockClient = { chat: { completions: { create: mockCompletionsCreate } } };
      
      const { default: geminiFlash } = await import('../src/config/gemini.js');
      geminiFlash.getClient = () => mockClient;

      // Mock nvidiaChatProvider client
      nvidiaChatProvider.getClient = () => mockClient;

      const health = await runStartupHealthChecks();
      expect(health.providerStatus).toBe('healthy');
    });

    it('should fail startup if Qdrant is down in production', async () => {
      const originalNodeEnv = config.nodeEnv;
      config.nodeEnv = 'production';
      try {
        const { qdrantHealthCheck } = await import('../src/infrastructure/qdrant.js');
        qdrantHealthCheck.mockResolvedValueOnce({ healthy: false, error: 'Connection refused' });

        await expect(runStartupHealthChecks()).rejects.toThrow('Qdrant is unhealthy');
      } finally {
        config.nodeEnv = originalNodeEnv;
      }
    });

    it('should not fail startup if Qdrant is down in development (degraded mode)', async () => {
      const originalNodeEnv = config.nodeEnv;
      config.nodeEnv = 'development';
      const { providerHealthStatus } = await import('../src/config/providerStatusState.js');
      providerHealthStatus.searchMode = 'full';
      try {
        const { qdrantHealthCheck } = await import('../src/infrastructure/qdrant.js');
        qdrantHealthCheck.mockResolvedValueOnce({ healthy: false, error: 'Connection refused' });

        // Mock Gemini & NVIDIA Clients completion creation so the rest of checks pass
        const mockCompletionsCreate = vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'ok' } }]
        });
        const mockClient = { chat: { completions: { create: mockCompletionsCreate } } };
        const { default: geminiFlash } = await import('../src/config/gemini.js');
        geminiFlash.getClient = () => mockClient;
        nvidiaChatProvider.getClient = () => mockClient;

        const health = await runStartupHealthChecks();
        expect(health.providerStatus).toBe('unhealthy');
        expect(providerHealthStatus.searchMode).toBe('degraded');
      } finally {
        config.nodeEnv = originalNodeEnv;
      }
    });
  });
});
