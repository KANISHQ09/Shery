import { QdrantClient } from '@qdrant/js-client-rest';
import dotenv from 'dotenv';

// Fail-safe env loading
dotenv.config();


if (!process.env.QDRANT_URL) {
  throw new Error('QDRANT_URL is missing. Production systems require QDRANT_URL to be set.');
}

export const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY || undefined,
  checkCompatibility: false,
});

export const COLLECTION_NAME = 'workspace_chunks';
export const VECTOR_SIZE = 1024;
export const WORKSPACE_COLLECTION = COLLECTION_NAME;
export const EMBEDDING_DIMENSIONS = VECTOR_SIZE;

export const getQdrantClient = () => qdrant;

let collectionReady = false;
let initPromise = null;

export const ensureQdrantCollection = async () => {
  if (collectionReady) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const maxRetries = 3;
    let delayMs = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[QDRANT] Validating collection existence (Attempt ${attempt}/${maxRetries})...`);
        const collectionsResult = await qdrant.getCollections();
        const exists = collectionsResult.collections.some((c) => c.name === COLLECTION_NAME);

        if (!exists) {
          console.log(`[QDRANT] Creating collection: "${COLLECTION_NAME}"...`);
          try {
            await qdrant.createCollection(COLLECTION_NAME, {
              vectors: {
                size: VECTOR_SIZE,
                distance: 'Cosine',
              },
              optimizers_config: {
                default_segment_number: 2,
              },
              replication_factor: 1,
            });
          } catch (createErr) {
            if (
              createErr.message?.includes('already exists') ||
              createErr.status === 409 ||
              createErr.message?.includes('409')
            ) {
              console.log(`[QDRANT] Collection "${COLLECTION_NAME}" already exists (concurrent creation ignored).`);
            } else {
              throw createErr;
            }
          }

          // Create payload indexes
          try {
            await qdrant.createPayloadIndex(COLLECTION_NAME, {
              field_name: 'workspaceId',
              field_schema: 'keyword',
            });
            await qdrant.createPayloadIndex(COLLECTION_NAME, {
              field_name: 'sourceId',
              field_schema: 'keyword',
            });
          } catch (indexErr) {
            console.warn('[QDRANT] Non-blocking index creation warning:', indexErr.message);
          }
        }

        collectionReady = true;
        initPromise = null;
        return;
      } catch (err) {
        console.warn(`[QDRANT] Collection setup attempt ${attempt} failed:`, err.message);
        if (attempt === maxRetries) {
          initPromise = null;
          throw new Error(`Qdrant collection initialization failed: ${err.message}`);
        }
        await new Promise((r) => setTimeout(r, delayMs));
        delayMs *= 2;
      }
    }
  })();

  return initPromise;
};

// Resilient Qdrant health check with retry/backoff & non-fatal grace handling
export const qdrantHealthCheck = async () => {
  let delay = 500;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // Execute health check
      const collections = await Promise.race([
        qdrant.getCollections(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
      ]);
      return { healthy: true, collections: collections.collections.length };
    } catch (err) {
      if (attempt === 3) {
        console.warn(`[QDRANT] Healthcheck failed after 3 attempts: ${err.message}`);
        return { healthy: false, error: err.message };
      }
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
};

const qdrantConfig = {
  getClient: getQdrantClient,
  ensureCollection: ensureQdrantCollection,
  healthCheck: qdrantHealthCheck,
};

export default qdrantConfig;
