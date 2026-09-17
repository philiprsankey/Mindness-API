import type { Request } from 'express';
import { Router } from 'express';
import { createMood, deleteMood, listMoods } from '../lib/db';
import { attachUserId, requireAuth } from '../middleware/requireAuth';

export const moodsRouter = Router();

moodsRouter.use(requireAuth, attachUserId);

function getUserId(req: Request): string {
  return req.userId!;
}

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

moodsRouter.get('/moods', (req, res) => {
  const userId = getUserId(req);
  const daysRaw = req.query.days;
  let days: number | undefined;

  if (daysRaw != null && daysRaw !== '') {
    const parsed = Number(daysRaw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      res.status(400).json({ error: 'Invalid days parameter' });
      return;
    }
    days = parsed;
  }

  res.json(listMoods(userId, days));
});

moodsRouter.post('/moods', (req, res) => {
  const userId = getUserId(req);
  const moodScore = Number(req.body?.moodScore);
  const note = typeof req.body?.note === 'string' ? req.body.note : undefined;

  if (!Number.isInteger(moodScore) || moodScore < 1 || moodScore > 5) {
    res.status(400).json({ error: 'moodScore must be an integer from 1 to 5' });
    return;
  }

  if (note && note.trim().length > 500) {
    res.status(400).json({ error: 'Note must be 500 characters or fewer' });
    return;
  }

  const mood = createMood(userId, moodScore, note);
  res.status(201).json(mood);
});

moodsRouter.delete('/moods/:id', (req, res) => {
  const userId = getUserId(req);
  const id = parseId(req.params.id);

  if (!id) {
    res.status(400).json({ error: 'Invalid mood id' });
    return;
  }

  const deleted = deleteMood(userId, id);
  if (!deleted) {
    res.status(404).json({ error: 'Mood not found' });
    return;
  }

  res.sendStatus(204);
});
