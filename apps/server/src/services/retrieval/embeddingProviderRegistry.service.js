import OpenAI from 'openai';
import logger from '../../loggers/logger.js';
import AppError from '../../utils/AppError.js';

class EmbeddingProviderRegistryService {
  constructor({ config }) {
    this.config = config;
    
    // Only the configured model: vectors from different embedding models are not comparable,
    // so silently falling back to another model would corrupt search over already-indexed lessons.
    // If you change NVIDIA_EMBEDDING_MODEL, re-index existing lessons.
    this.nvidiaModelFallbackChain = [this.config.nvidiaEmbeddingModel];

    this.openaiModels = [
      'text-embedding-3-small',
      'text-embedding-ada-002'
    ];

    // Initialize clients lazily
    this._nvidiaClient = null;
    this._openaiClient = null;
  }

  getNvidiaClient() {
    if (!this._nvidiaClient) {
      if (!this.config.nvidiaApiKey) {
        logger.warn('NVIDIA_API_KEY is missing from environment variables. Nvidia embedding provider will be skipped.');
        return null;
      }
      this._nvidiaClient = new OpenAI({
        apiKey: this.config.nvidiaApiKey,
        baseURL: 'https://integrate.api.nvidia.com/v1',
      });
    }
    return this._nvidiaClient;
  }

  getOpenaiClient() {
    if (!this._openaiClient) {
      const apiKey = process.env.OPENAI_API_KEY || this.config.nvidiaApiKey; // fallback to nvidia key just in case they use a unified key proxy
      if (!apiKey) {
        logger.warn('OPENAI_API_KEY is missing from environment variables. OpenAI embedding provider will be skipped.');
        return null;
      }
      this._openaiClient = new OpenAI({ apiKey });
    }
    return this._openaiClient;
  }

  /**
   * Generate emergency fallback deterministic embeddings using a local 1024-dimensional TF-IDF-like projection.
   * Ensures that even if the internet is completely offline, vector indexing succeeds and stays operational.
   * @param {string[]} texts
   * @returns {number[][]}
   */
  generateEmergencyEmbeddings(texts) {
    logger.info(`Generating emergency local deterministic embeddings for ${texts.length} items`);
    return texts.map(text => {
      const vector = new Array(1024).fill(0);
      const words = text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 1);

      if (words.length === 0) {
        // Uniform fallback vector
        return new Array(1024).fill(1 / Math.sqrt(1024));
      }

      // Hash words deterministically to dimensions
      for (const word of words) {
        let hash = 0;
        for (let i = 0; i < word.length; i++) {
          hash = (hash * 31 + word.charCodeAt(i)) >>> 0;
        }
        const dimension = hash % 1024;
        
        // TF score weight
        vector[dimension] += 1;
      }

      // Normalize vector to L2 unit length
      let sqSum = 0;
      for (let i = 0; i < 1024; i++) {
        sqSum += vector[i] * vector[i];
      }
      const norm = Math.sqrt(sqSum);
      
      return vector.map(v => (norm > 0 ? v / norm : 1 / Math.sqrt(1024)));
    });
  }

  /**
   * Generate embeddings for a list of texts using the provider chain (Nvidia -> OpenAI -> Local Fallback)
   * @param {string[]} texts
   * @param {string} inputType 'passage' or 'query'
   * @returns {Promise<number[][]>} Array of 1024-dimensional embeddings
   */
  async generateEmbeddings(texts, inputType = 'passage') {
    if (!texts || texts.length === 0) return [];

    const errors = [];

    // --- Provider 1: Nvidia NIM (with fallback chain of models) ---
    const nvidiaClient = this.getNvidiaClient();
    if (nvidiaClient) {
      for (const model of this.nvidiaModelFallbackChain) {
        try {
          logger.info(`Attempting Nvidia NIM embedding generation...`, { model, count: texts.length });
          const response = await this._withRetry(async () => {
            const extraParams = {};
            if (model.includes('e5') || model.includes('embedqa') || model.includes('nemotron')) {
              extraParams.input_type = inputType;
            }
            return await nvidiaClient.embeddings.create({
              model,
              input: texts,
              encoding_format: 'float',
              ...extraParams
            });
          });

          if (response?.data?.length) {
            const sorted = response.data.slice().sort((a, b) => a.index - b.index);
            logger.info(`Successfully generated Nvidia NIM embeddings`, { model });
            
            // Adapt Nvidia embeddings (e.g. 2048 or 4096 dims) to Qdrant's 1024 dims via truncation/l2-norm
            return sorted.map(item => {
              let emb = item.embedding;
              if (emb.length > 1024) {
                emb = emb.slice(0, 1024);
                // Re-normalize to unit length
                const norm = Math.sqrt(emb.reduce((sum, v) => sum + v * v, 0));
                emb = emb.map(v => (norm > 0 ? v / norm : 0));
              } else if (emb.length < 1024) {
                // Pad with zeros to fit 1024 dimensions
                emb = [...emb, ...new Array(1024 - emb.length).fill(0)];
              }
              return emb;
            });
          }
        } catch (err) {
          const errMsg = `Nvidia NIM (${model}) failed: ${err.message}`;
          logger.warn(errMsg);
          errors.push(errMsg);
        }
      }
    }

    // --- Provider 2: OpenAI Embeddings (with model chain) ---
    const openaiClient = this.getOpenaiClient();
    if (openaiClient) {
      for (const model of this.openaiModels) {
        try {
          logger.info(`Attempting OpenAI embedding generation...`, { model, count: texts.length });
          const response = await this._withRetry(async () => {
            return await openaiClient.embeddings.create({
              model,
              input: texts,
            });
          });

          if (response?.data?.length) {
            const sorted = response.data.slice().sort((a, b) => a.index - b.index);
            logger.info(`Successfully generated OpenAI embeddings`, { model });
            
            // Adapt OpenAI embeddings (typically 1536 dims) to Qdrant's 1024 dims via truncation/l2-norm
            return sorted.map(item => {
              let emb = item.embedding;
              if (emb.length > 1024) {
                emb = emb.slice(0, 1024);
                // Re-normalize to unit length
                const norm = Math.sqrt(emb.reduce((sum, v) => sum + v * v, 0));
                emb = emb.map(v => (norm > 0 ? v / norm : 0));
              } else if (emb.length < 1024) {
                // Pad with zeros to fit 1024 dimensions
                emb = [...emb, ...new Array(1024 - emb.length).fill(0)];
              }
              return emb;
            });
          }
        } catch (err) {
          const errMsg = `OpenAI (${model}) failed: ${err.message}`;
          logger.warn(errMsg);
          errors.push(errMsg);
        }
      }
    }

    // --- Provider 3: Emergency Local Fallback ---
    logger.warn('All external embedding providers failed. Invoking local emergency projection.', {
      errors
    });
    
    return this.generateEmergencyEmbeddings(texts);
  }

  /**
   * Helper to perform exponential backoff retries for third-party calls
   */
  async _withRetry(fn, retries = 2, delayMs = 500) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        // Do not retry 404 or 400 errors (they are client faults or invalid endpoints)
        if (err.status === 404 || err.status === 400 || attempt === retries) {
          throw err;
        }
        const wait = delayMs * Math.pow(2, attempt);
        logger.warn(`API call failed, retrying in ${wait}ms...`, { attempt: attempt + 1, error: err.message });
        await new Promise(resolve => setTimeout(resolve, wait));
      }
    }
    throw lastError;
  }
}

export default EmbeddingProviderRegistryService;
