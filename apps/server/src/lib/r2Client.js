import { S3Client } from '@aws-sdk/client-s3';
import config from '../config/env.js';
import logger from '../loggers/logger.js';

let _r2Client = null;

/**
 * Returns a singleton S3-compatible client for Cloudflare R2.
 * Server-side only: uses an R2 API token's access key + secret.
 */
export function getR2Client() {
  if (_r2Client) return _r2Client;

  if (!config.r2AccountId || !config.r2AccessKeyId || !config.r2SecretAccessKey) {
    logger.warn('R2 credentials not configured — storage operations will fail if STORAGE_PROVIDER=r2');
    return null;
  }

  _r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.r2AccessKeyId,
      secretAccessKey: config.r2SecretAccessKey,
    },
  });

  logger.info('Cloudflare R2 client initialized', { bucket: config.r2Bucket });
  return _r2Client;
}

export default getR2Client;
