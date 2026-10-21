import pino from 'pino';

export function createLogger({ level, env }) {
  return pino({
    level,
    base: { service: 'atlo-backend' },
    redact: ['req.headers.authorization', 'req.headers.cookie'],
    transport:
      env === 'development' ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
  });
}
