import type { Request, Response } from 'express';
import { Router } from 'express';
import { getUser } from '../lib/db';
import { getProactiveCheckIn } from '../lib/proactiveCheckIn';
import {
  getEffectiveSubscriptionTier,
  getTierFeatures,
} from '../lib/subscription';
import { attachUserId, requireAuth } from '../middleware/requireAuth';

export const checkInRouter = Router();

checkInRouter.use(requireAuth, attachUserId);

function getUserId(req: Request): string {
  return req.userId!;
}

function checkInAccessDenied(res: Response, tier: string) {
  res.status(402).json({
    error: 'Proactive check-ins require a Companion plan',
    message: 'Upgrade to Companion so your companion can reach out with personalized check-ins.',
    tier,
  });
}

checkInRouter.get('/companion/check-in', (req, res) => {
  const userId = getUserId(req);
  const user = getUser(userId);
  const tier = user ? getEffectiveSubscriptionTier(user) : 'free';
  const features = getTierFeatures(tier);

  if (!features.proactiveCheckIns) {
    checkInAccessDenied(res, tier);
    return;
  }

  res.json(getProactiveCheckIn(userId));
});
