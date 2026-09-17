import cors from 'cors';
import express from 'express';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { meRouter } from './routes/me';
import { chatRouter } from './routes/chat';
import { moodsRouter } from './routes/moods';
import { goalsRouter } from './routes/goals';
import { gratitudeRouter } from './routes/gratitude';
import { journalRouter } from './routes/journal';
import { dashboardRouter } from './routes/dashboard';
import { voiceRouter } from './routes/voice';
import { checkInRouter } from './routes/checkIn';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '15mb' }));

  app.use('/api', healthRouter);
  app.use('/api', authRouter);
  app.use('/api', meRouter);
  app.use('/api', chatRouter);
  app.use('/api', moodsRouter);
  app.use('/api', goalsRouter);
  app.use('/api', gratitudeRouter);
  app.use('/api', journalRouter);
  app.use('/api', dashboardRouter);
  app.use('/api', voiceRouter);
  app.use('/api', checkInRouter);

  return app;
}
