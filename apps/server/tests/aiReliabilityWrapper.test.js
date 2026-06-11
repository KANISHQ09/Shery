import { vi, describe, it, expect, beforeEach } from 'vitest';
import { CircuitBreaker, translateError, wrapCall } from '../src/utils/aiReliabilityWrapper.js';

describe('AI Reliability safeguards', () => {
  describe('CircuitBreaker', () => {
    let breaker;
    beforeEach(() => {
      // Cooldown of 50ms for testing
      breaker = new CircuitBreaker(50, 3);
    });

    it('should start closed', () => {
      expect(breaker.isOpen()).toBe(false);
      expect(breaker.getStatus().state).toBe('closed');
    });

    it('should open after max failures', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.isOpen()).toBe(false);
      
      breaker.recordFailure();
      expect(breaker.isOpen()).toBe(true);
      expect(breaker.getStatus().state).toBe('open');
    });

    it('should close on success', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.isOpen()).toBe(true);

      breaker.recordSuccess();
      expect(breaker.isOpen()).toBe(false);
      expect(breaker.getStatus().failuresCount).toBe(0);
    });

    it('should recover after cooldown expires', async () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.isOpen()).toBe(true);

      // Wait for 60ms for cooldown to expire
      await new Promise(resolve => setTimeout(resolve, 60));
      expect(breaker.isOpen()).toBe(false);
    });
  });

  describe('translateError', () => {
    it('should map 429 quota errors', () => {
      const error = new Error('You exceeded your current quota. Rate limit exceeded.');
      const friendly = translateError(error);
      expect(friendly.message).toBe('The AI provider is temporarily rate-limited. Please try again later.');
      expect(friendly.statusCode).toBe(429);
    });

    it('should map 404 model errors', () => {
      const error = new Error('models/gemini-2.0-flash is not found or model not supported.');
      const friendly = translateError(error);
      expect(friendly.message).toBe('The configured AI model is unavailable.');
      expect(friendly.statusCode).toBe(404);
    });

    it('should fallback to provider unavailable', () => {
      const error = new Error('Random socket hangup');
      const friendly = translateError(error);
      expect(friendly.message).toBe('The AI service is currently unavailable.');
      expect(friendly.statusCode).toBe(503);
    });
  });
});
