import 'dotenv/config';
import { createApp } from './app.js';
import { loadConfig } from './src/config/env.js';
import { createContainer } from './src/container.js';
import { createLogger } from './src/lib/logger.js';

const config = loadConfig();
const logger = createLogger({ level: config.logLevel, env: config.env });
const container = createContainer({ config, logger });
const app = createApp({ config, logger, container });

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.env }, 'Atlo server listening');
});

function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => logger.error({ reason }, 'unhandled rejection'));
