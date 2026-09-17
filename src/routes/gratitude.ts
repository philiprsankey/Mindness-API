import type { Request } from 'express';
import { Router } from 'express';
import { createGratitudeEntry, listGratitudeEntries } from '../lib/db';
import { attachUserId, requireAuth } from '../middleware/requireAuth';

export const gratitudeRouter = Router();

gratitudeRouter.use(requireAuth, attachUserId);

function getUserId(req: Request): string {
  return req.userId!;
}

gratitudeRouter.get('/gratitude', (req, res) => {
  const userId = getUserId(req);
  res.json(listGratitudeEntries(userId, 30));
});

gratitudeRouter.post('/gratitude', (req, res) => {
  const userId = getUserId(req);
  const rawItems = req.body?.items;

  if (!Array.isArray(rawItems)) {
    res.status(400).json({ error: 'items must be an array of strings' });
    return;
  }

  const items = rawItems
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);

  if (items.length === 0) {
    res.status(400).json({ error: 'At least one gratitude item is required' });
    return;
  }

  for (const item of items) {
    if (item.length > 500) {
      res.status(400).json({ error: 'Each item must be 500 characters or fewer' });
      return;
    }
  }

  const entry = createGratitudeEntry(userId, items);
  res.status(201).json(entry);
});
