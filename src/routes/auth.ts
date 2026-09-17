import { Router } from 'express';
import crypto from 'crypto';
import {
  createEmailUser,
  createEmailVerificationCode,
  createGoogleUser,
  createPasswordResetCode,
  createRefreshToken,
  getUser,
  getUserByEmail,
  getUserByGoogleId,
  linkGoogleId,
  markEmailVerified,
  revokeAllRefreshTokens,
  revokeRefreshToken,
  updateUserPassword,
  verifyEmailCode,
  verifyPasswordResetCode,
  verifyRefreshToken,
  type UserRow,
} from '../lib/db';
import { sendPasswordResetEmail, sendVerificationEmail } from '../lib/email';
import { verifyGoogleIdToken } from '../lib/googleAuth';
import { signAccessToken } from '../lib/jwt';
import { hashPassword, verifyPassword } from '../lib/password';

export const authRouter = Router();

type AuthUserPayload = {
  id: string;
  email: string | null;
  firstName: string | null;
  onboarded: boolean;
  authProvider: UserRow['authProvider'];
  emailVerified: boolean;
};

function serializeUser(user: UserRow): AuthUserPayload {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    onboarded: user.onboarded,
    authProvider: user.authProvider,
    emailVerified: Boolean(user.emailVerifiedAt),
  };
}

function issueTokens(user: UserRow) {
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email ?? '',
  });
  const refreshToken = createRefreshToken(user.id);

  return {
    accessToken,
    refreshToken,
    user: serializeUser(user),
  };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

authRouter.post('/auth/register', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const firstName =
    typeof req.body?.firstName === 'string' ? req.body.firstName.trim() : null;

  if (!email || !isValidEmail(email)) {
    res.status(400).json({ error: 'Valid email is required' });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  const existing = getUserByEmail(email);
  if (existing) {
    if (existing.emailVerifiedAt) {
      res.status(409).json({ error: 'An account with this email already exists' });
      return;
    }

    const passwordHash = await hashPassword(password);
    updateUserPassword(existing.id, passwordHash);

    const code = createEmailVerificationCode(existing.id, email);
    try {
      await sendVerificationEmail(email, code);
    } catch {
      res.status(503).json({ error: 'Could not send verification email' });
      return;
    }

    res.json({ ok: true, email, needsVerification: true });
    return;
  }

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  createEmailUser(userId, email, passwordHash, firstName);

  const code = createEmailVerificationCode(userId, email);
  try {
    await sendVerificationEmail(email, code);
  } catch {
    res.status(503).json({ error: 'Could not send verification email' });
    return;
  }

  res.status(201).json({ ok: true, email, needsVerification: true });
});

authRouter.post('/auth/verify-email', (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';

  if (!email || !code) {
    res.status(400).json({ error: 'Email and verification code are required' });
    return;
  }

  const userId = verifyEmailCode(email, code);
  if (!userId) {
    res.status(400).json({ error: 'Invalid or expired verification code' });
    return;
  }

  markEmailVerified(userId);
  const user = getUser(userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json(issueTokens(user));
});

authRouter.post('/auth/resend-verification', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

  if (!email) {
    res.status(400).json({ error: 'Email is required' });
    return;
  }

  const user = getUserByEmail(email);
  if (!user) {
    res.json({ ok: true });
    return;
  }

  if (user.emailVerifiedAt) {
    res.status(400).json({ error: 'Email is already verified' });
    return;
  }

  const code = createEmailVerificationCode(user.id, email);
  try {
    await sendVerificationEmail(email, code);
  } catch {
    res.status(503).json({ error: 'Could not send verification email' });
    return;
  }

  res.json({ ok: true });
});

authRouter.post('/auth/forgot-password', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

  if (!email || !isValidEmail(email)) {
    res.status(400).json({ error: 'Valid email is required' });
    return;
  }

  const user = getUserByEmail(email);
  if (user?.passwordHash && user.emailVerifiedAt) {
    const code = createPasswordResetCode(user.id, email);
    try {
      await sendPasswordResetEmail(email, code);
    } catch {
      res.status(503).json({ error: 'Could not send password reset email' });
      return;
    }
  }

  res.json({ ok: true, email });
});

authRouter.post('/auth/reset-password', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

  if (!email || !code || !newPassword) {
    res.status(400).json({ error: 'Email, code, and new password are required' });
    return;
  }

  if (newPassword.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  const userId = verifyPasswordResetCode(email, code);
  if (!userId) {
    res.status(400).json({ error: 'Invalid or expired reset code' });
    return;
  }

  const passwordHash = await hashPassword(newPassword);
  updateUserPassword(userId, passwordHash);
  revokeAllRefreshTokens(userId);

  res.json({ ok: true });
});

authRouter.post('/auth/login', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const user = getUserByEmail(email);
  if (!user?.passwordHash) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  if (!user.emailVerifiedAt) {
    res.status(403).json({ error: 'email_not_verified', message: 'Please verify your email first' });
    return;
  }

  res.json(issueTokens(user));
});

authRouter.post('/auth/google', async (req, res) => {
  const idToken = typeof req.body?.idToken === 'string' ? req.body.idToken : '';

  if (!idToken) {
    res.status(400).json({ error: 'Google ID token is required' });
    return;
  }

  try {
    const profile = await verifyGoogleIdToken(idToken);
    let user = getUserByGoogleId(profile.googleId);

    if (!user) {
      user = getUserByEmail(profile.email);
      if (user) {
        linkGoogleId(user.id, profile.googleId);
        user = getUser(user.id)!;
      } else {
        user = createGoogleUser(crypto.randomUUID(), profile.email, profile.googleId, profile.firstName);
      }
    }

    res.json(issueTokens(user));
  } catch (err) {
    console.error('[auth/google]', err);
    res.status(401).json({ error: 'Google sign-in failed' });
  }
});

authRouter.post('/auth/refresh', (req, res) => {
  const refreshToken =
    typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : '';

  if (!refreshToken) {
    res.status(400).json({ error: 'Refresh token is required' });
    return;
  }

  const userId = verifyRefreshToken(refreshToken);
  if (!userId) {
    res.status(401).json({ error: 'Invalid refresh token' });
    return;
  }

  const user = getUser(userId);
  if (!user) {
    res.status(401).json({ error: 'Invalid refresh token' });
    return;
  }

  revokeRefreshToken(refreshToken);
  res.json(issueTokens(user));
});

authRouter.post('/auth/logout', (req, res) => {
  const refreshToken =
    typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : '';

  if (refreshToken) {
    revokeRefreshToken(refreshToken);
  }

  res.json({ ok: true });
});
