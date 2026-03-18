import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import authRouter from './routes/auth.js';
import docRouter from './routes/docs.js';

const app = express();

app.use(cors({ origin: env.CLIENT_URL }));
app.use(express.json());

//  Rate limiting

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
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

//Routes

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Auth limiter applied only to auth routes
app.use('/api/auth', authLimiter, authRouter);

// API limiter applied to all other API routes
app.use('/api', apiLimiter);
app.use('/api/docs', docRouter);

app.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
});