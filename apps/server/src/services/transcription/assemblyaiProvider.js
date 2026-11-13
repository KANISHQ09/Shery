import { Readable } from 'stream';
import * as assemblyPkg from 'assemblyai';
import BaseTranscriptionProvider from './baseProvider.js';
import config from '../../config/env.js';
import logger from '../../loggers/logger.js';
import { msToSeconds } from '../../utils/timeFormatter.js';
import AppError from '../../utils/AppError.js';

const { AssemblyAI } = assemblyPkg;

// Signed media URLs carry access tokens; only ever log the host.
const safeHost = (url) => {
  if (typeof url !== 'string') return null;
  if (url.startsWith('data:')) return 'data-uri';
  try { return new URL(url).host; } catch { return 'invalid-url'; }
};

class AssemblyAiProvider extends BaseTranscriptionProvider {
  constructor() {
    super();
    this.assemblyClient = null;
  }

  getAssemblyClient() {
    if (!config.assemblyAiApiKey) {
      throw new AppError('ASSEMBLYAI_API_KEY is missing from environment variables.', 500);
    }

    if (!this.assemblyClient) {
      this.assemblyClient = new AssemblyAI({ apiKey: config.assemblyAiApiKey });
    }

    return this.assemblyClient;
  }

  async uploadBuffer(fileBuffer) {
    try {
      logger.info('AssemblyAI: Uploading buffer to AssemblyAI staging storage...');
      const uploadUrl = await this.getAssemblyClient().files.upload(Readable.from(fileBuffer));
      if (!uploadUrl || typeof uploadUrl !== 'string') {
        throw new Error(`AssemblyAI files.upload() returned unexpected value: ${JSON.stringify(uploadUrl)}`);
      }
      logger.info('AssemblyAI: Upload completed successfully.', { uploadHost: safeHost(uploadUrl) });
      return uploadUrl;
    } catch (err) {
      logger.error('AssemblyAI: Buffer upload failed', { error: err.message, stack: err.stack });
      throw new AppError(`AssemblyAI upload failed: ${err.message}`, 500);
    }
  }

  async submitTranscript(audioUrl, language = 'auto') {
    // Configurable speech model selection with fallback support
    const models = config.assemblyAiSpeechModels && config.assemblyAiSpeechModels.length
      ? config.assemblyAiSpeechModels
      : ['universal-3-pro', 'universal-2'];

    const requestConfig = {
      audio_url: audioUrl,
      speech_models: models, // Replaced deprecated speech_model
      punctuate: true,
      format_text: true,
      language_detection: language === 'auto',
    };

    if (language !== 'auto') {
      requestConfig.language_code = language;
      requestConfig.language_detection = false;
    }

    logger.info('AssemblyAI: Submitting transcription request...', {
      audioHost: safeHost(audioUrl),
      language,
      speechModels: requestConfig.speech_models,
    });

    try {
      const submitted = await this.getAssemblyClient().transcripts.submit(requestConfig);
      logger.info('AssemblyAI: Transcription request submitted successfully.', { transcriptId: submitted.id });
      return submitted.id;
    } catch (err) {
      logger.error('AssemblyAI: Ingestion submission failed', { error: err.message, audioHost: safeHost(audioUrl), speechModels: requestConfig.speech_models, language });
      
      // Failure categorization
      if (err.message.includes('deprecated') || err.message.includes('Use "speech_models" instead')) {
        throw new AppError(`SDK Deprecation Error: ${err.message}`, 500, { type: 'sdk_deprecation' });
      }
      throw new AppError(`AssemblyAI submission failed: ${err.message}`, 400, { type: 'provider_error' });
    }
  }

  async pollTranscript(transcriptId, onProgress) {
    const maxPolls = 150; // ~10 minutes max
    let pct = 20;
    let polls = 0;

    logger.info('AssemblyAI: Polling transcription status...', { transcriptId });

    while (polls < maxPolls) {
      // Adaptive polling interval: fast at first, backs off as time passes
      // Segment 0 (fast-path) is typically 60s audio → ready in ~15-20s
      let pollIntervalMs;
      if (polls < 5) {
        pollIntervalMs = 2000; // First 10s: poll every 2s
      } else if (polls < 20) {
        pollIntervalMs = 3000; // Next 45s: poll every 3s
      } else {
        pollIntervalMs = 5000; // After that: poll every 5s
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      polls += 1;

      try {
        const result = await this.getAssemblyClient().transcripts.get(transcriptId);
        logger.debug('AssemblyAI: Polled status', { transcriptId, status: result.status, polls });

        if (result.status === 'error') {
          logger.error('AssemblyAI: Transcription failed during processing', { transcriptId, error: result.error });
          throw new AppError(`AssemblyAI transcription failed: ${result.error || 'Unknown error'}`, 422, {
            type: 'transcription_failed',
            transcriptId,
          });
        }

        if (result.status === 'completed') {
          const modelUsed = result.speech_model_used || 'unknown';
          logger.info('AssemblyAI: Transcription completed.', { transcriptId, modelUsed, polls });
          return result;
        }

        // Progressive UI tracking
        if (onProgress && pct < 78) {
          pct = Math.min(pct + 1, 78);
          await onProgress(pct);
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
        logger.warn('AssemblyAI: Status polling error (retrying)...', { error: err.message });
      }
    }

    throw new AppError(
      'Transcription timed out after 10 minutes. The file may be too large or AssemblyAI is overloaded.',
      408,
      { type: 'transcription_timeout', transcriptId }
    );
  }

  normalizeResult(transcript) {
    if (!transcript.words?.length) {
      return [{
        text: transcript.text || '',
        start: 0,
        end: transcript.audio_duration || 0,
      }];
    }

    const segments = [];
    const groupSize = 10;

    for (let index = 0; index < transcript.words.length; index += groupSize) {
      const group = transcript.words.slice(index, index + groupSize);
      segments.push({
        text: group.map((word) => word.text).join(' '),
        start: msToSeconds(group[0].start),
        end: msToSeconds(group[group.length - 1].end),
      });
    }

    return segments;
  }
}

export default AssemblyAiProvider;
