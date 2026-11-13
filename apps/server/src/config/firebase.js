import admin from 'firebase-admin';
import config from './env.js';
import logger from '../loggers/logger.js';

class FirebaseConfig {
  constructor() {
    this.initialized = false;
  }

  normalizePrivateKey(rawKey) {
    if (!rawKey || typeof rawKey !== 'string') return rawKey;

    let privateKey = rawKey.trim();

    // 1. Resolve escaped newline characters
    if (privateKey.includes('\\n')) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    // 2. Resolve quote wrappers if accidentally injected
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = privateKey.slice(1, -1);
    }
    if (privateKey.startsWith("'") && privateKey.endsWith("'")) {
      privateKey = privateKey.slice(1, -1);
    }

    privateKey = privateKey.trim();

    // 3. Railway/Docker fallback: If BEGIN/END markers exist but real PEM newlines are missing
    if (
      privateKey.includes('-----BEGIN PRIVATE KEY-----') &&
      !privateKey.includes('\nMII')
    ) {
      privateKey = privateKey
        .replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\n')
        .replace('-----END PRIVATE KEY-----', '\n-----END PRIVATE KEY-----');
    }

    // 4. Strict validation (never log any part of the key)
    if (!privateKey.includes('\n')) {
      throw new Error(
        'Firebase PEM normalization failed — missing multiline formatting'
      );
    }

    return privateKey;
  }

  parseServiceAccount() {
    if (config.firebaseServiceAccount) {
      try {
        const serviceAccount = JSON.parse(config.firebaseServiceAccount);
        if (typeof serviceAccount.private_key === 'string') {
          serviceAccount.private_key = this.normalizePrivateKey(serviceAccount.private_key);
        }
        return serviceAccount;
      } catch (err) {
        throw new Error(`FIREBASE_SERVICE_ACCOUNT must be valid JSON: ${err.message}`);
      }
    }

    if (config.firebaseProjectId && config.firebaseClientEmail && config.firebasePrivateKey) {
      return {
        project_id: config.firebaseProjectId,
        client_email: config.firebaseClientEmail,
        private_key: this.normalizePrivateKey(config.firebasePrivateKey),
      };
    }

    throw new Error(
      'Firebase credentials are missing. Set FIREBASE_SERVICE_ACCOUNT or FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.',
    );
  }

  initialize() {
    if (this.initialized || admin.apps.length) {
      this.initialized = true;
      return admin.app();
    }

    const serviceAccount = this.parseServiceAccount();
    logger.info('Initializing Firebase Admin', { projectId: serviceAccount.project_id || 'unknown' });
    const appConfig = {
      credential: admin.credential.cert(serviceAccount),
    };

    if (config.firebaseStorageBucket) {
      appConfig.storageBucket = config.firebaseStorageBucket;
    }

    admin.initializeApp(appConfig);

    admin.firestore().settings({ ignoreUndefinedProperties: true });
    this.initialized = true;
    logger.info('Firebase Admin initialized');
    return admin.app();
  }

  getDb() {
    this.initialize();
    return admin.firestore();
  }
}

const firebaseConfig = new FirebaseConfig();

export const initializeFirebase = () => firebaseConfig.initialize();
export const getDb = () => firebaseConfig.getDb();
export { admin };
export default firebaseConfig;
