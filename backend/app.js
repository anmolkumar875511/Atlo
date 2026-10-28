
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { API_PREFIX } from './src/constants/api.js';
import { loadConfig } from './src/config/env.js';
import { errorHandler } from './src/middleware/errorHandler.js';
import { notFound } from './src/middleware/notFound.js';
import { createContainer } from './src/container.js';
import { createApiRouter } from './src/routes/index.js';

export function createApp({ config, logger, container }) {
    const app = express();
    app.disable('x-powered-by');

    app.use(
        pinoHttp({
            logger,
            genReqId: (req, res) => {
                const incoming = req.headers['x-request-id'];
                const id =
                    typeof incoming === 'string' && incoming.length <= 100
                        ? incoming
                        : randomUUID();
                res.setHeader('x-request-id', id);
                return id;
            },
            autoLogging: {
                ignore: (req) => req.url === `${API_PREFIX}/health`,
            },
        })
    );

    app.use(helmet());
    app.use(cors({ origin: config.corsOrigins, methods: ['GET', 'POST'] }));
    app.use(compression());
    app.use(express.json({ limit: '10kb' }));

    app.use(
        API_PREFIX,
        createApiRouter({
            controllers: container.controllers,
            rateLimitPerMinute: config.rateLimitPerMinute,
            readRateLimitPerMinute: config.readRateLimitPerMinute,
        })
    );

    app.use(notFound);
    app.use(errorHandler(logger));

    return app;
}

const config = loadConfig();
const logger = pino({ level: config.logLevel });
const container = createContainer({ config, logger });

const app = createApp({ config, logger, container });

export default app;
