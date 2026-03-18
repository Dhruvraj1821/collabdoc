import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import authRouter from './routes/auth.js';
import docRouter from './routes/docs.js';
import { createWebSocketServer } from './ws/wsServer.js';

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors({ origin: env.CLIENT_URL }));
app.use(express.json());

// ── Rate limiting ─────────────────────────────────────────────────────────────

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

app.use('/api/auth', authLimiter, authRouter);
app.use('/api', apiLimiter);
app.use('/api/docs', docRouter);

// ── HTTP + WebSocket server ───────────────────────────────────────────────────

// We create an HTTP server manually instead of using app.listen()
// because the WebSocket server needs to attach to the same HTTP server
const httpServer = createServer(app);
createWebSocketServer(httpServer);

httpServer.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
});