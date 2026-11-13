import dotenv from 'dotenv';

dotenv.config();

function splitCsv(value = '') {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

class EnvConfig {
  constructor(source = process.env) {
    this.nodeEnv = source.NODE_ENV || 'development';
    this.port = Number(source.PORT || 5001);
    this.frontendUrl = source.FRONTEND_URL || 'http://localhost:5173';
    this.allowVercelPreviews = source.ALLOW_VERCEL_PREVIEWS === 'true';
    this.firebaseServiceAccount = source.FIREBASE_SERVICE_ACCOUNT || '';
    this.firebaseProjectId = source.FIREBASE_PROJECT_ID || '';
    this.firebaseClientEmail = source.FIREBASE_CLIENT_EMAIL || '';
    this.firebasePrivateKey = source.FIREBASE_PRIVATE_KEY || '';
    this.firebaseStorageBucket = source.FIREBASE_STORAGE_BUCKET || '';
    // Storage provider: 'local' (dev) | 'supabase' (production free-tier)
    this.storageProvider = source.STORAGE_PROVIDER || (source.SUPABASE_URL ? 'supabase' : 'local');
    this.supabaseUrl = source.SUPABASE_URL || '';
    this.supabaseServiceRoleKey = source.SUPABASE_SERVICE_ROLE_KEY || '';
    this.supabaseStorageBucket = source.SUPABASE_STORAGE_BUCKET || 'workspace-assets';
    this.supabaseSignedUrlTtlSeconds = Number(source.SUPABASE_SIGNED_URL_TTL_SECONDS || 3600);
    // Cloudflare R2 (STORAGE_PROVIDER=r2) — S3-compatible, free egress
    this.r2AccountId = source.R2_ACCOUNT_ID || '';
    this.r2AccessKeyId = source.R2_ACCESS_KEY_ID || '';
    this.r2SecretAccessKey = source.R2_SECRET_ACCESS_KEY || '';
    this.r2Bucket = source.R2_BUCKET || '';
    this.maxVideoUploadMb = Number(source.MAX_VIDEO_UPLOAD_MB || 100);
    this.assemblyAiApiKey = source.ASSEMBLYAI_API_KEY || '';
    this.assemblyAiSpeechModels = splitCsv(source.ASSEMBLYAI_SPEECH_MODELS || 'universal-3-pro, universal-2');
    this.transcriptionProvider = source.TRANSCRIPTION_PROVIDER || 'assemblyai';
    this.nvidiaApiKey = source.NVIDIA_API_KEY || '';
    this.nvidiaModel = source.NVIDIA_MODEL || 'nvidia/nemotron-3.5-lightning-30b-a3b';
    this.allowedOrigins = splitCsv(source.CORS_ORIGINS);
    this.geminiApiKey = source.GEMINI_API_KEY || ''; // optional: lesson metadata + query rewrite; falls back to NVIDIA
    this.geminiModel = source.GEMINI_MODEL || 'gemini-3.5-flash-lite';
    this.chatProvider = source.CHAT_PROVIDER || 'nvidia';
    this.chatModel = source.CHAT_MODEL || 'nvidia/nemotron-3.5-lightning-30b-a3b';

    // Qdrant vector DB (lesson transcript retrieval)
    this.qdrantUrl = source.QDRANT_URL || 'http://127.0.0.1:6333';
    this.qdrantApiKey = source.QDRANT_API_KEY || '';

    // NVIDIA embedding model
    this.nvidiaEmbeddingModel = source.NVIDIA_EMBEDDING_MODEL || 'nvidia/nemotron-3.5-embed-8b';

    if (this.frontendUrl && !this.allowedOrigins.includes(this.frontendUrl)) {
      this.allowedOrigins.push(this.frontendUrl);
    }

    if (!this.isProduction() && this.allowedOrigins.length === 0) {
      this.allowedOrigins = [
        this.frontendUrl,
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:3000',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:5174',
        'http://127.0.0.1:3000',
      ];
    }

    // Startup validation for required variables (except during testing)
    if (this.nodeEnv !== 'test' && !process.env.VITEST) {
      const missingVars = [];
      if (!this.nvidiaApiKey) {
        missingVars.push('NVIDIA_API_KEY');
      }

      if (missingVars.length > 0) {
        console.error('\x1b[31m%s\x1b[0m', '======================================================================');
        console.error('\x1b[31m%s\x1b[0m', ' CRITICAL STARTUP ERROR: Missing Required Environment Variables');
        console.error('\x1b[31m%s\x1b[0m', '----------------------------------------------------------------------');
        missingVars.forEach(v => {
          console.error('\x1b[31m%s\x1b[0m', `  - ${v}`);
        });
        console.error('\x1b[31m%s\x1b[0m', '======================================================================');
        throw new Error(`Startup failed: Missing required environment variables: ${missingVars.join(', ')}`);
      }
    }
  }

  isProduction() {
    return this.nodeEnv === 'production';
  }
}

const config = new EnvConfig();

export default config;
