import type { Request } from 'express';
import { Router } from 'express';
import {
  listGoals,
  listJournalEntries,
  listMoods,
  serializeGoals,
} from '../lib/db';
import { attachUserId, requireAuth } from '../middleware/requireAuth';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth, attachUserId);

function getUserId(req: Request): string {
  return req.userId!;
}

dashboardRouter.get('/dashboard/summary', (req, res) => {
  const userId = getUserId(req);
  const moods = listMoods(userId, 7);
  const goals = serializeGoals(listGoals(userId, false));
  const journalEntries = listJournalEntries(userId);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const journalEntryCountLast7Days = journalEntries.filter(
    (entry) => new Date(entry.createdAt) >= sevenDaysAgo,
  ).length;

  const averageMoodLast7Days =
    moods.length > 0
      ? moods.reduce((sum, mood) => sum + mood.moodScore, 0) / moods.length
      : null;

  const longestCurrentStreak =
    goals.length > 0 ? Math.max(...goals.map((goal) => goal.currentStreak)) : 0;

  const goalsCompletedToday = goals.filter((goal) => goal.completedToday).length;

  res.json({
    averageMoodLast7Days,
    moodTrend: moods,
    activeGoalCount: goals.length,
    goalsCompletedToday,
    longestCurrentStreak,
    journalEntryCountLast7Days,
    latestJournalEntry: journalEntries[0] ?? null,
  });
});
