import type { Request } from 'express';
import { Router } from 'express';
import {
  createJournalEntry,
  deleteJournalEntry,
  getJournalEntry,
  listJournalEntries,
  updateJournalEntry,
} from '../lib/db';
import { attachUserId, requireAuth } from '../middleware/requireAuth';

export const journalRouter = Router();

journalRouter.use(requireAuth, attachUserId);

function getUserId(req: Request): string {
  return req.userId!;
}

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

journalRouter.get('/journal-entries', (req, res) => {
  const userId = getUserId(req);
  res.json(listJournalEntries(userId));
});

journalRouter.post('/journal-entries', (req, res) => {
  const userId = getUserId(req);
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const content = typeof req.body?.content === 'string' ? req.body.content : '';
  const prompt =
    typeof req.body?.prompt === 'string' ? req.body.prompt.trim() || null : null;

  if (!title) {
    res.status(400).json({ error: 'Title is required' });
    return;
  }

  if (title.length > 200) {
    res.status(400).json({ error: 'Title must be 200 characters or fewer' });
    return;
  }

  if (content.length > 20000) {
    res.status(400).json({ error: 'Content must be 20,000 characters or fewer' });
    return;
  }

  const entry = createJournalEntry(userId, title, content, prompt);
  res.status(201).json(entry);
});

journalRouter.get('/journal-entries/:id', (req, res) => {
  const userId = getUserId(req);
  const id = parseId(req.params.id);

  if (!id) {
    res.status(400).json({ error: 'Invalid journal entry id' });
    return;
  }

  const entry = getJournalEntry(userId, id);
  if (!entry) {
    res.status(404).json({ error: 'Journal entry not found' });
    return;
  }

  res.json(entry);
});

journalRouter.patch('/journal-entries/:id', (req, res) => {
  const userId = getUserId(req);
  const id = parseId(req.params.id);

  if (!id) {
    res.status(400).json({ error: 'Invalid journal entry id' });
    return;
  }

  const patch: Parameters<typeof updateJournalEntry>[2] = {};

  if (req.body?.title != null) {
    const title = String(req.body.title).trim();
    if (!title) {
      res.status(400).json({ error: 'Title cannot be empty' });
      return;
    }
    patch.title = title;
  }

  if (req.body?.content != null) {
    const content = String(req.body.content);
    if (content.length > 20000) {
      res.status(400).json({ error: 'Content must be 20,000 characters or fewer' });
      return;
    }
    patch.content = content;
  }

  const entry = updateJournalEntry(userId, id, patch);
  if (!entry) {
    res.status(404).json({ error: 'Journal entry not found' });
    return;
  }

  res.json(entry);
});

journalRouter.delete('/journal-entries/:id', (req, res) => {
  const userId = getUserId(req);
  const id = parseId(req.params.id);

  if (!id) {
    res.status(400).json({ error: 'Invalid journal entry id' });
    return;
  }

  const deleted = deleteJournalEntry(userId, id);
  if (!deleted) {
    res.status(404).json({ error: 'Journal entry not found' });
    return;
  }

  res.sendStatus(204);
});
