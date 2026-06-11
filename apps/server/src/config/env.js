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
    this.maxVideoUploadMb = Number(source.MAX_VIDEO_UPLOAD_MB || 100);
    this.assemblyAiApiKey = source.ASSEMBLYAI_API_KEY || '';
    this.assemblyAiSpeechModels = splitCsv(source.ASSEMBLYAI_SPEECH_MODELS || 'universal-3-pro, universal-2');
    this.transcriptionProvider = source.TRANSCRIPTION_PROVIDER || 'assemblyai';
    this.nvidiaApiKey = source.NVIDIA_API_KEY || '';
    this.nvidiaModel = source.NVIDIA_MODEL || 'nvidia/nemotron-3-nano-30b-a3b';
    this.allowedOrigins = splitCsv(source.CORS_ORIGINS);
    this.falApiKey = source.FAL_KEY || source.FAL_API_KEY || '';
    this.geminiApiKey = source.GEMINI_API_KEY || '';
    this.openaiApiKey = source.OPENAI_API_KEY || '';
    this.elevenlabsApiKey = source.ELEVENLABS_API_KEY || '';
    this.defaultImageProvider = source.DEFAULT_IMAGE_PROVIDER || 'fal';
    this.defaultAudioProvider = source.DEFAULT_AUDIO_PROVIDER || 'openai';
    this.chatProvider = source.CHAT_PROVIDER || 'nvidia';
    this.chatModel = source.CHAT_MODEL || 'nvidia/nemotron-3-nano-30b-a3b';
    this.imageProvider = source.IMAGE_PROVIDER || 'gemini';
    this.imageModel = source.IMAGE_MODEL || 'gemini-2.5-flash-image-preview';
    this.imageModelDefault = source.IMAGE_MODEL_DEFAULT || 'flux-1-schnell';
    this.imageModelText = source.IMAGE_MODEL_TEXT || 'qwen-image';
    this.presentationProvider = source.PRESENTATION_PROVIDER || 'gemini';
    this.presentationModel = source.PRESENTATION_MODEL || 'gemini-2.5-flash';
    this.audioProvider = source.AUDIO_PROVIDER || 'gemini';
    this.audioModel = source.AUDIO_MODEL || 'gemini-2.5-flash';
    this.geminiModel = this.chatModel; // For backward compatibility

    // Knowledge Workspace — Qdrant vector DB
    this.qdrantUrl = source.QDRANT_URL || 'http://127.0.0.1:6333';
    this.qdrantApiKey = source.QDRANT_API_KEY || '';

    // Knowledge Workspace — NVIDIA embedding model
    this.nvidiaEmbeddingModel = source.NVIDIA_EMBEDDING_MODEL || 'nvidia/nv-embedqa-mistral-7b-v2';

    // Knowledge Workspace — limits
    this.workspaceFreeLimit = Math.max(Number(source.WORKSPACE_FREE_LIMIT || 50), 50);
    this.workspaceSourceLimit = Number(source.WORKSPACE_SOURCE_LIMIT || 20);
    this.workspaceMaxPdfMb = Number(source.WORKSPACE_MAX_PDF_MB || 20);
    this.workspaceChunkSizeTokens = Number(source.WORKSPACE_CHUNK_SIZE_TOKENS || 384);
    this.workspaceChunkOverlapTokens = Number(source.WORKSPACE_CHUNK_OVERLAP_TOKENS || 48);

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
      if (!this.geminiApiKey) {
        missingVars.push('GEMINI_API_KEY');
      }
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
