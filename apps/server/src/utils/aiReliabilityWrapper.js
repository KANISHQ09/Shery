import logger from '../loggers/logger.js';
import { providerHealthStatus } from '../config/providerStatusState.js';

export class CircuitBreaker {
  constructor(cooldownMs = 60000, maxFailures = 3) {
    this.cooldownMs = cooldownMs;
    this.maxFailures = maxFailures;
    this.failures = 0;
    this.disabledUntil = 0;
  }
  
  isOpen() {
    if (this.disabledUntil > 0) {
      if (Date.now() < this.disabledUntil) {
        return true;
      }
      // Cooldown expired, move to half-open state
      this.disabledUntil = 0;
    }
    return false;
  }
  
  recordSuccess() {
    this.failures = 0;
    this.disabledUntil = 0;
    providerHealthStatus.providerStatus = 'healthy';
    providerHealthStatus.quotaStatus = 'active';
  }
  
  recordFailure() {
    this.failures++;
    if (this.failures >= this.maxFailures) {
      this.disabledUntil = Date.now() + this.cooldownMs;
      logger.error(`[CIRCUIT BREAKER] AI provider has failed ${this.failures} times. Tripping circuit! Blocking requests for 60 seconds.`);
    }
    providerHealthStatus.providerStatus = 'unhealthy';
  }

  getStatus() {
    if (this.isOpen()) {
      return { state: 'open', disabledUntil: new Date(this.disabledUntil).toISOString() };
    }
    return { state: 'closed', failuresCount: this.failures };
  }
}

// Single global circuit breaker for the primary Gemini provider
export const globalGeminiBreaker = new CircuitBreaker();

export function translateError(error) {
  const errMsg = (error?.message || String(error)).toLowerCase();
  
  if (
    errMsg.includes('429') ||
    errMsg.includes('quota') ||
    errMsg.includes('rate limit') ||
    errMsg.includes('rate_limit') ||
    errMsg.includes('limit exceeded') ||
    errMsg.includes('resource_exhausted')
  ) {
    providerHealthStatus.quotaStatus = 'exhausted';
    const rateLimitErr = new Error('The AI provider is temporarily rate-limited. Please try again later.');
    rateLimitErr.statusCode = 429;
    return rateLimitErr;
  }
  
  if (
    errMsg.includes('404') ||
    errMsg.includes('not found') ||
    errMsg.includes('model') ||
    errMsg.includes('does not exist') ||
    errMsg.includes('not supported')
  ) {
    const modelErr = new Error('The configured AI model is unavailable.');
    modelErr.statusCode = 404;
    return modelErr;
  }
  
  const providerErr = new Error('The AI service is currently unavailable.');
  providerErr.statusCode = 503;
  return providerErr;
}

export function logTelemetry({ provider, model, statusCode, latencyMs, tokenCount, error, fallbackActivated = false }) {
  const meta = {
    provider,
    model,
    statusCode,
    latencyMs,
    tokenCount: tokenCount || { input: 0, output: 0, total: 0 },
    fallbackActivated,
  };
  if (error) {
    meta.error = error.message || String(error);
  }
  logger.info('[TELEMETRY] Provider call completed', meta);
}

export async function wrapCall(provider, model, fn, promptText = '', options = {}) {
  const fallbackActivated = options.fallbackActivated || false;
  if (globalGeminiBreaker.isOpen()) {
    const error = new Error('The AI service is currently unavailable.');
    error.statusCode = 503;
    logTelemetry({
      provider,
      model,
      statusCode: 503,
      latencyMs: 0,
      tokenCount: { input: 0, output: 0, total: 0 },
      error,
      fallbackActivated
    });
    throw error;
  }

  const startTime = Date.now();
  try {
    const result = await fn();
    const latencyMs = Date.now() - startTime;
    globalGeminiBreaker.recordSuccess();

    // Extract token counts from response if possible
    let tokenCount = { input: 0, output: 0, total: 0 };
    const completion = result?.choices?.[0]?.message?.content || result?.response?.text?.() || result?.text || '';
    
    if (result?.usage) {
      tokenCount = {
        input: result.usage.prompt_tokens || 0,
        output: result.usage.completion_tokens || 0,
        total: result.usage.total_tokens || 0,
      };
    } else {
      const input = Math.ceil((promptText?.length || 0) / 4);
      const output = Math.ceil(completion.length / 4);
      tokenCount = { input, output, total: input + output };
    }

    logTelemetry({ provider, model, statusCode: 200, latencyMs, tokenCount, fallbackActivated });
    return result;
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    globalGeminiBreaker.recordFailure();

    const friendlyErr = translateError(err);
    logTelemetry({
      provider,
      model,
      statusCode: err.status || err.statusCode || 500,
      latencyMs,
      tokenCount: { input: 0, output: 0, total: 0 },
      error: friendlyErr,
      fallbackActivated
    });

    throw friendlyErr;
  }
}

export async function wrapStreamCall(provider, model, fn, promptText = '', options = {}) {
  const fallbackActivated = options.fallbackActivated || false;
  if (globalGeminiBreaker.isOpen()) {
    const error = new Error('The AI service is currently unavailable.');
    error.statusCode = 503;
    logTelemetry({
      provider,
      model,
      statusCode: 503,
      latencyMs: 0,
      tokenCount: { input: 0, output: 0, total: 0 },
      error,
      fallbackActivated
    });
    throw error;
  }

  const startTime = Date.now();
  try {
    const result = await fn();
    const originalStream = result.stream;

    return {
      stream: (async function* wrappedStream() {
        globalGeminiBreaker.recordSuccess();
        let totalOutputChars = 0;
        
        try {
          for await (const chunk of originalStream) {
            const text = chunk.text?.() || chunk.choices?.[0]?.delta?.content || '';
            totalOutputChars += text.length;
            yield chunk;
          }
          const latencyMs = Date.now() - startTime;
          const input = Math.ceil((promptText?.length || 0) / 4);
          const output = Math.ceil(totalOutputChars / 4);
          logTelemetry({
            provider,
            model,
            statusCode: 200,
            latencyMs,
            tokenCount: { input, output, total: input + output },
            fallbackActivated
          });
        } catch (streamErr) {
          const latencyMs = Date.now() - startTime;
          globalGeminiBreaker.recordFailure();
          const friendlyErr = translateError(streamErr);
          logTelemetry({
            provider,
            model,
            statusCode: streamErr.status || 500,
            latencyMs,
            tokenCount: { input: 0, output: 0, total: 0 },
            error: friendlyErr,
            fallbackActivated
          });
          throw friendlyErr;
        }
      })()
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    globalGeminiBreaker.recordFailure();
    const friendlyErr = translateError(err);
    logTelemetry({
      provider,
      model,
      statusCode: err.status || 500,
      latencyMs,
      tokenCount: { input: 0, output: 0, total: 0 },
      error: friendlyErr,
      fallbackActivated
    });
    throw friendlyErr;
  }
}

/**
 * Helper to perform exponential backoff retries for third-party calls
 */
export async function withExponentialBackoff(fn, retries = 2, delayMs = 500) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === retries) {
        throw err;
      }
      const wait = delayMs * Math.pow(2, attempt);
      logger.warn(`API call failed, retrying in ${wait}ms...`, { attempt: attempt + 1, error: err.message });
      await new Promise(resolve => setTimeout(resolve, wait));
    }
  }
  throw lastError;
}
