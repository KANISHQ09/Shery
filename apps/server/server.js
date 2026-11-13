import './src/config/env.js'; // Immediately bootstrap environment configuration first!
import app from './src/app.js';
import config from './src/config/env.js';
import { initializeFirebase } from './src/config/firebase.js';
import logger from './src/loggers/logger.js';
import { runStartupHealthChecks } from './src/config/startupHealthCheck.js';

// Dynamically register background queue workers based on configuration
const runWorkers = process.env.RUN_WORKERS !== 'false';
const runApi = process.env.RUN_API !== 'false';

if (runWorkers) {
  logger.info('Initializing background queue workers...');
  await import('./src/worker/ingestion.worker.js');
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

if (runApi) {
  runStartupHealthChecks().catch((err) => {
    logger.error('[STARTUP HEALTH CHECK] Uncaught exception during checks. Refusing READY state.', { error: err.message });
    process.exit(1);
  });

  const server = app.listen(config.port, () => {
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

