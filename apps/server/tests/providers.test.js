import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import config from '../src/config/env.js';
import { nvidiaChatProvider } from '../src/providers/nvidiaChat.provider.js';
import { geminiImageProvider } from '../src/providers/geminiImage.provider.js';
import { runStartupHealthChecks } from '../src/config/startupHealthCheck.js';
import { withExponentialBackoff } from '../src/utils/aiReliabilityWrapper.js';

// Mock Qdrant
vi.mock('../src/infrastructure/qdrant.js', () => ({
  qdrantHealthCheck: vi.fn(() => Promise.resolve({ healthy: true })),
  ensureQdrantCollection: vi.fn(() => Promise.resolve())
}));

// Mock DI Container
vi.mock('../src/container/workspaceContainer.js', () => ({
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
        if (options.model === 'nvidia/nemotron-3-nano-30b-a3b') {
          throw new Error('API Rate Limit or Quota Exceeded on Nemotron');
        }
        if (options.model === 'meta/llama-3.1-8b-instruct') {
          return Promise.resolve({
            choices: [{ message: { content: 'Response from Llama 3.1 8B' } }]
          });
        }
        return Promise.reject(new Error('Should not reach final fallback'));
      });

      nvidiaChatProvider.getClient = () => ({
        chat: { completions: { create: mockCompletionsCreate } }
      });

      const res = await nvidiaChatProvider.generate('Hello world');
      expect(callCount).toBe(2); // Attempted Nemotron, then Llama 8B
      expect(res.response.text()).toBe('Response from Llama 3.1 8B');
    });

    it('should complete with final fallback model if both primary and secondary fail', async () => {
      let callCount = 0;
      const mockCompletionsCreate = vi.fn().mockImplementation((options) => {
        callCount++;
        if (options.model === 'nvidia/nemotron-3-nano-30b-a3b' || options.model === 'meta/llama-3.1-8b-instruct') {
          throw new Error('Unavailable');
        }
        if (options.model === 'meta/llama-3.3-70b-instruct') {
          return Promise.resolve({
            choices: [{ message: { content: 'Response from Llama 3.3 70B' } }]
          });
        }
        return Promise.reject(new Error('Unknown model'));
      });

      nvidiaChatProvider.getClient = () => ({
        chat: { completions: { create: mockCompletionsCreate } }
      });

      const res = await nvidiaChatProvider.generate('Hello world');
      expect(callCount).toBe(3); // Nemotron -> Llama 8B -> Llama 70B
      expect(res.response.text()).toBe('Response from Llama 3.3 70B');
    });
  });

  describe('geminiImage.provider', () => {
    it('should generate image using Gemini Imagen REST API on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          predictions: [{ bytesBase64Encoded: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' }]
        })
      });

      const res = await geminiImageProvider.generate('a clean flowchart diagram');
      expect(res.provider).toBe('gemini');
      expect(res.buffer).toBeInstanceOf(Buffer);
    });

    it('should fall back to FLUX.1-Schnell if Gemini Image API fails', async () => {
      // First fetch (Gemini) fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Quota Exceeded')
      });

      // Mock NVIDIA client for imageProvider fallback
      const mockImagesGenerate = vi.fn().mockResolvedValue({
        data: [{ url: 'http://nvidia.com/temp-image.png' }]
      });
      const mockImageProviderClient = {
        images: { generate: mockImagesGenerate }
      };
      
      const { imageProvider } = await import('../src/providers/image.provider.js');
      imageProvider.getClient = () => mockImageProviderClient;
      
      // Secondary fetch (NVIDIA temp CDN download) succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10))
      });

      const res = await geminiImageProvider.generate('a clean flowchart diagram');
      expect(res.provider).toBe('nvidia');
      expect(res.model).toContain('flux-1-schnell');
      expect(res.buffer).toBeInstanceOf(Buffer);
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
        json: () => Promise.resolve({ models: [{ name: 'models/gemini-2.5-flash' }] })
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
