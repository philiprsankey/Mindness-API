import type { Request } from 'express';
import { Router } from 'express';
import {
  deleteUserAccount,
  ensureUser,
  getUser,
  markCompanionWelcomeSeen,
  markUserOnboarded,
  normalizePersonaAvatar,
  parsePersonaJson,
  revokeAllRefreshTokens,
  saveUserIntake,
  saveUserPersona,
  updateUserPassword,
  type Persona,
} from '../lib/db';
import {
  buildIntakeMemory,
  buildWelcomeSummary,
  companionToneToPersonality,
  parseIntakeBody,
  parseIntakeJson,
  resolveIntakeDisplayName,
  resolveIntakeFirstName,
  stripIntakeBlock,
} from '../lib/intake';
import { hashPassword, verifyPassword } from '../lib/password';
import {
  getEffectiveSubscriptionTier,
  getTierFeatures,
  resolveDevSubscriptionOverride,
} from '../lib/subscription';
import { attachUserId, requireAuth } from '../middleware/requireAuth';
import {
  eraseMemory,
  readMemoryForUser,
  replaceMemory,
} from '../lib/companionMemory';

export const meRouter = Router();

meRouter.use(requireAuth, attachUserId);

function getUserId(req: Request): string {
  return req.userId!;
}

meRouter.get('/me', (req, res) => {
  res.set('Cache-Control', 'private, no-store');

  const userId = getUserId(req);
  const user = ensureUser(userId);
  const persona = parsePersonaJson(user.personaJson);
  const intakeProfile = parseIntakeJson(user.intakeJson);
  const subscriptionTier = getEffectiveSubscriptionTier(user);
  const devOverride = resolveDevSubscriptionOverride();
  const intakeCompleted = Boolean(intakeProfile?.completedAt);

  res.json({
    id: userId,
    email: user.email,
    firstName: user.firstName,
    onboarded: user.onboarded || Boolean(persona),
    authProvider: user.authProvider,
    emailVerified: Boolean(user.emailVerifiedAt),
    hasPassword: Boolean(user.passwordHash),
    subscriptionTier,
    subscriptionFeatures: getTierFeatures(subscriptionTier),
    subscriptionDevOverride: devOverride ?? undefined,
    persona,
    intakeProfile,
    intakeCompleted,
    companionWelcomeSeen: user.companionWelcomeSeen,
    welcomeSummary: intakeCompleted
      ? buildWelcomeSummary(intakeProfile, user.firstName)
      : null,
    displayName: resolveIntakeDisplayName(intakeProfile, user.firstName),
  });
});

meRouter.put('/me/persona', (req, res) => {
  const userId = getUserId(req);
  const { name, gender, origin, personality, avatarId, userName } =
    req.body as Record<string, unknown>;

  if (
    typeof name !== 'string' ||
    !name.trim() ||
    !['female', 'male', 'neutral'].includes(gender as string) ||
    typeof origin !== 'string' ||
    !origin ||
    typeof personality !== 'string' ||
    !personality ||
    typeof avatarId !== 'string' ||
    !avatarId ||
    (userName !== undefined &&
      (typeof userName !== 'string' || userName.trim().length > 100))
  ) {
    res.status(400).json({ error: 'Invalid persona data' });
    return;
  }

  if (avatarId === 'custom') {
    res.status(400).json({
      error: 'Custom photo avatars are no longer supported. Please choose a preset companion.',
    });
    return;
  }

  const persona = normalizePersonaAvatar({
    name: name.trim(),
    gender: gender as Persona['gender'],
    origin,
    personality,
    avatarId,
  });

  const nextFirstName =
    typeof userName === 'string' && userName.trim()
      ? userName.trim()
      : undefined;

  saveUserPersona(userId, persona, nextFirstName);
  res.json({ ok: true, persona });
});

meRouter.put('/me/onboarded', (req, res) => {
  markUserOnboarded(getUserId(req));
  res.json({ ok: true });
});

function intakeAccessDenied(res: import('express').Response, tier: string) {
  res.status(402).json({
    error: 'Personal intake requires Companion+',
    message: 'Upgrade to Companion+ to unlock the personalized onboarding questionnaire.',
    tier,
  });
}

meRouter.put('/me/intake', (req, res) => {
  const userId = getUserId(req);
  const user = ensureUser(userId);
  const tier = getEffectiveSubscriptionTier(user);

  if (tier !== 'companion_plus') {
    intakeAccessDenied(res, tier);
    return;
  }

  const intake = parseIntakeBody(req.body as Record<string, unknown>);
  const skipped = intake.skipped === true;

  const nextFirstName = resolveIntakeFirstName(intake) ?? undefined;
  saveUserIntake(userId, JSON.stringify(intake), nextFirstName);

  if (intake.companionTone) {
    const existingPersona = parsePersonaJson(user.personaJson);
    if (existingPersona) {
      saveUserPersona(userId, {
        ...existingPersona,
        personality: companionToneToPersonality(intake.companionTone),
      });
    }
  }

  if (!skipped) {
    const memoryText = buildIntakeMemory(intake, nextFirstName ?? user.firstName);
    const existing = readMemoryForUser(userId).memory.trim();
    if (!existing) {
      replaceMemory(userId, memoryText);
    } else {
      const withoutIntake = stripIntakeBlock(existing);
      replaceMemory(
        userId,
        withoutIntake ? `${memoryText}\n\n${withoutIntake}` : memoryText,
      );
    }
  }

  res.json({
    ok: true,
    intakeProfile: intake,
    welcomeSummary: buildWelcomeSummary(intake, nextFirstName ?? user.firstName),
    displayName: resolveIntakeDisplayName(intake, nextFirstName ?? user.firstName),
  });
});

meRouter.put('/me/companion-welcome-seen', (req, res) => {
  const userId = getUserId(req);
  const user = ensureUser(userId);
  const tier = getEffectiveSubscriptionTier(user);

  if (tier !== 'companion_plus') {
    intakeAccessDenied(res, tier);
    return;
  }

  markCompanionWelcomeSeen(userId);
  res.json({ ok: true });
});

meRouter.put('/me/password', async (req, res) => {
  const userId = getUserId(req);
  const user = getUser(userId);

  if (!user?.passwordHash) {
    res.status(400).json({ error: 'Password change is not available for this account' });
    return;
  }

  const currentPassword =
    typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

  if (newPassword.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Current password is incorrect' });
    return;
  }

  const passwordHash = await hashPassword(newPassword);
  updateUserPassword(userId, passwordHash);
  revokeAllRefreshTokens(userId);
  res.json({ ok: true });
});

function memoryAccessDenied(res: import('express').Response, tier: string) {
  res.status(402).json({
    error: 'Companion memory requires a Companion plan',
    message: 'Upgrade to Companion so your companion can remember you across sessions.',
    tier,
  });
}

meRouter.get('/me/memory', (req, res) => {
  const userId = getUserId(req);
  const user = getUser(userId);
  const tier = user ? getEffectiveSubscriptionTier(user) : 'free';
  const features = getTierFeatures(tier);

  if (!features.deepMemory) {
    memoryAccessDenied(res, tier);
    return;
  }

  res.json(readMemoryForUser(userId));
});

meRouter.put('/me/memory', (req, res) => {
  const userId = getUserId(req);
  const user = getUser(userId);
  const tier = user ? getEffectiveSubscriptionTier(user) : 'free';
  const features = getTierFeatures(tier);

  if (!features.deepMemory) {
    memoryAccessDenied(res, tier);
    return;
  }

  const memory = typeof req.body?.memory === 'string' ? req.body.memory : null;
  if (memory === null) {
    res.status(400).json({ error: 'memory must be a string' });
    return;
  }

  const snapshot = replaceMemory(userId, memory.slice(0, 20_000));
  res.json({ memory: snapshot.memory, updatedAt: readMemoryForUser(userId).updatedAt });
});

meRouter.delete('/me/memory', (req, res) => {
  const userId = getUserId(req);
  const user = getUser(userId);
  const tier = user ? getEffectiveSubscriptionTier(user) : 'free';
  const features = getTierFeatures(tier);

  if (!features.deepMemory) {
    memoryAccessDenied(res, tier);
    return;
  }

  eraseMemory(userId);
  res.sendStatus(204);
});

meRouter.delete('/me', async (req, res) => {
  const userId = getUserId(req);
  const user = getUser(userId);

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  if (user.passwordHash) {
    const currentPassword =
      typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    if (!currentPassword) {
      res.status(400).json({ error: 'Current password is required to delete your account' });
      return;
    }
    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }
  } else {
    const confirmed = req.body?.confirm === true;
    if (!confirmed) {
      res.status(400).json({ error: 'Account deletion must be confirmed' });
      return;
    }
  }

  const deleted = deleteUserAccount(userId);
  if (!deleted) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.sendStatus(204);
});
