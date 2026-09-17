import type { Request } from 'express';
import { Router } from 'express';
import {
  createGoal,
  deleteGoal,
  getGoal,
  listGoals,
  serializeGoals,
  toggleGoalCompletion,
  updateGoal,
  type GoalFrequency,
} from '../lib/db';
import { todayDateKey } from '../lib/goalStats';
import { attachUserId, requireAuth } from '../middleware/requireAuth';

export const goalsRouter = Router();

goalsRouter.use(requireAuth, attachUserId);

function getUserId(req: Request): string {
  return req.userId!;
}

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseFrequency(value: unknown): GoalFrequency | null {
  if (value === 'daily' || value === 'weekly') return value;
  return null;
}

goalsRouter.get('/goals', (req, res) => {
  const userId = getUserId(req);
  const rawArchived = req.query.archived;
  const archived =
    typeof rawArchived === 'string'
      ? rawArchived === 'true'
      : undefined;

  const goals = listGoals(userId, archived);
  res.json(serializeGoals(goals));
});

goalsRouter.post('/goals', (req, res) => {
  const userId = getUserId(req);
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const description =
    typeof req.body?.description === 'string' ? req.body.description.trim() : null;
  const frequency = parseFrequency(req.body?.frequency) ?? 'daily';

  if (!title) {
    res.status(400).json({ error: 'Title is required' });
    return;
  }

  if (title.length > 200) {
    res.status(400).json({ error: 'Title must be 200 characters or fewer' });
    return;
  }

  if (description && description.length > 500) {
    res.status(400).json({ error: 'Description must be 500 characters or fewer' });
    return;
  }

  const goal = createGoal(userId, title, description || null, frequency);
  const [serialized] = serializeGoals([goal]);
  res.status(201).json(serialized);
});

goalsRouter.patch('/goals/:id', (req, res) => {
  const userId = getUserId(req);
  const id = parseId(req.params.id);

  if (!id) {
    res.status(400).json({ error: 'Invalid goal id' });
    return;
  }

  const patch: Parameters<typeof updateGoal>[2] = {};

  if (req.body?.title != null) {
    const title = String(req.body.title).trim();
    if (!title) {
      res.status(400).json({ error: 'Title cannot be empty' });
      return;
    }
    patch.title = title;
  }

  if (req.body?.description != null) {
    patch.description =
      typeof req.body.description === 'string' ? req.body.description.trim() : null;
  }

  if (req.body?.frequency != null) {
    const frequency = parseFrequency(req.body.frequency);
    if (!frequency) {
      res.status(400).json({ error: 'frequency must be daily or weekly' });
      return;
    }
    patch.frequency = frequency;
  }

  if (req.body?.archived != null) {
    patch.archived = Boolean(req.body.archived);
  }

  const goal = updateGoal(userId, id, patch);
  if (!goal) {
    res.status(404).json({ error: 'Goal not found' });
    return;
  }

  const [serialized] = serializeGoals([goal]);
  res.json(serialized);
});

goalsRouter.delete('/goals/:id', (req, res) => {
  const userId = getUserId(req);
  const id = parseId(req.params.id);

  if (!id) {
    res.status(400).json({ error: 'Invalid goal id' });
    return;
  }

  const deleted = deleteGoal(userId, id);
  if (!deleted) {
    res.status(404).json({ error: 'Goal not found' });
    return;
  }

  res.sendStatus(204);
});

goalsRouter.post('/goals/:id/complete', (req, res) => {
  const userId = getUserId(req);
  const id = parseId(req.params.id);

  if (!id) {
    res.status(400).json({ error: 'Invalid goal id' });
    return;
  }

  const goal = toggleGoalCompletion(userId, id, todayDateKey());
  if (!goal) {
    res.status(404).json({ error: 'Goal not found' });
    return;
  }

  const [serialized] = serializeGoals([goal]);
  res.json(serialized);
});
