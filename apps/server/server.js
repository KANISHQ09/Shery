import './src/config/env.js'; // Immediately bootstrap environment configuration first!
import app from './src/app.js';
import config from './src/config/env.js';
import { initializeFirebase } from './src/config/firebase.js';
import logger from './src/loggers/logger.js';
import { runStartupHealthChecks } from './src/config/startupHealthCheck.js';

// Dynamically register background queue workers based on configuration
const runWorkers = process.env.RUN_WORKERS !== 'false';
const runApi = process.env.RUN_API !== 'false';

let ingestionWorker = null;
if (runWorkers) {
  logger.info('Initializing background queue workers...');
  ({ ingestionWorker } = await import('./src/worker/ingestion.worker.js'));
  logger.info('Background queue workers initialized successfully.');
}

process.on('uncaughtException', (err) => {
  logger.error(`uncaughtException: ${err.message}`, { stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', { reason });
  process.exit(1);
});

initializeFirebase();

let server = null;

if (runApi) {
  runStartupHealthChecks().catch((err) => {
    logger.error('[STARTUP HEALTH CHECK] Uncaught exception during checks. Refusing READY state.', { error: err.message });
    process.exit(1);
  });

  server = app.listen(config.port, () => {
    logger.info(`SheryAI Backend running on port ${config.port}`);
    logger.info(`Environment: ${config.nodeEnv}`);
    logger.info(`Health check: http://localhost:${config.port}/api/health`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(`Port ${config.port} is already in use`);
    } else {
      logger.error(`Server error: ${err.message}`);
    }
    process.exit(1);
  });
} else {
  logger.info('SheryAI running in Worker-Only mode (Express server disabled).');
}

// Graceful shutdown: hosts send SIGTERM on redeploy. Stop taking requests, let an in-flight
// lesson ingestion job finish (BullMQ worker.close waits for it), then exit.
const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS || 25000);
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received: shutting down gracefully...`);

  const forceExit = setTimeout(() => {
    logger.warn('Graceful shutdown timed out; forcing exit.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      logger.info('HTTP server closed.');
    }
    if (ingestionWorker) {
      await ingestionWorker.close();
      logger.info('Ingestion worker closed.');
    }
  } catch (err) {
    logger.error('Error during graceful shutdown', { error: err.message });
  } finally {
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
