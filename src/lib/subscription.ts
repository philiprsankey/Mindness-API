import type { UserRow } from './db';

export type SubscriptionTier = 'free' | 'companion' | 'companion_plus';

export type SubscriptionFeatures = {
  dailyMessageLimit: number | null;
  voice: boolean;
  premiumVoice: boolean;
  animatedAvatar: boolean;
  deepMemory: boolean;
  proactiveCheckIns: boolean;
  personalizedIntake: boolean;
};

const TIER_FEATURES: Record<SubscriptionTier, SubscriptionFeatures> = {
  free: {
    dailyMessageLimit: null, // filled from env in getTierFeatures
    voice: false,
    premiumVoice: false,
    animatedAvatar: false,
    deepMemory: false,
    proactiveCheckIns: false,
    personalizedIntake: false,
  },
  companion: {
    dailyMessageLimit: null,
    voice: true,
    premiumVoice: false,
    animatedAvatar: false,
    deepMemory: true,
    proactiveCheckIns: true,
    personalizedIntake: false,
  },
  companion_plus: {
    dailyMessageLimit: null,
    voice: true,
    premiumVoice: true,
    animatedAvatar: false,
    deepMemory: true,
    proactiveCheckIns: true,
    personalizedIntake: true,
  },
};

export function getFreeTierDailyLimit(): number {
  const parsed = Number(process.env.FREE_DAILY_MESSAGES ?? 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
}

export function parseSubscriptionTier(value: unknown): SubscriptionTier {
  if (value === 'companion' || value === 'companion_plus' || value === 'free') {
    return value;
  }
  return 'free';
}

export function resolveDevSubscriptionOverride(): SubscriptionTier | null {
  const raw = process.env.DEV_SUBSCRIPTION_TIER?.trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'companion' || raw === 'companion_plus' || raw === 'free') {
    return raw;
  }
  return null;
}

export const APPLE_SUBSCRIPTION_PRODUCTS = {
  companion: 'com.mindness.app.companion.monthly',
  companion_plus: 'com.mindness.app.companionplus.monthly',
} as const;

export function tierForAppleProductId(
  productId: string,
): Exclude<SubscriptionTier, 'free'> | null {
  if (productId === APPLE_SUBSCRIPTION_PRODUCTS.companion) return 'companion';
  if (productId === APPLE_SUBSCRIPTION_PRODUCTS.companion_plus) return 'companion_plus';
  return null;
}

export function tierRank(tier: SubscriptionTier): number {
  switch (tier) {
    case 'companion_plus':
      return 2;
    case 'companion':
      return 1;
    default:
      return 0;
  }
}

export function getStoredSubscriptionTier(user: UserRow): SubscriptionTier {
  return parseSubscriptionTier(user.subscriptionTier);
}

export function isStoreSubscriptionActive(user: UserRow): boolean {
  if (!user.subscriptionProductId || !user.subscriptionExpiresAt) return false;
  const expiresAt = Date.parse(user.subscriptionExpiresAt);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export function getEffectiveSubscriptionTier(user: UserRow): SubscriptionTier {
  if (isStoreSubscriptionActive(user)) {
    return getStoredSubscriptionTier(user);
  }

  const override = resolveDevSubscriptionOverride();
  if (override) return override;

  if (!user.subscriptionExpiresAt) {
    return getStoredSubscriptionTier(user);
  }

  return 'free';
}

export function getTierFeatures(tier: SubscriptionTier): SubscriptionFeatures {
  const base = TIER_FEATURES[tier];
  if (tier !== 'free') {
    return { ...base, dailyMessageLimit: null };
  }
  return { ...base, dailyMessageLimit: getFreeTierDailyLimit() };
}

export function getDailyMessageLimit(tier: SubscriptionTier): number | null {
  return getTierFeatures(tier).dailyMessageLimit;
}

export function isMessageLimitReached(tier: SubscriptionTier, usedToday: number): boolean {
  const limit = getDailyMessageLimit(tier);
  if (limit === null) return false;
  return usedToday >= limit;
}
