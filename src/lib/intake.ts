import type { Persona } from './db';

export type IntakeProfile = {
  displayName?: string;
  namePreference?: string;
  ageRange?: string;
  lifeSituations?: string[];
  concerns?: string[];
  lifeContext?: string;
  responsePreference?: string;
  companionTone?: string;
  hardDayHelps?: string[];
  goals?: string;
  skipped?: boolean;
  completedAt: string;
};

export const INTAKE_CONCERNS = [
  'stress',
  'overthinking',
  'relationship',
  'work',
  'family',
  'money',
  'confidence',
  'loneliness',
  'motivation',
  'sleep',
  'difficult_decision',
  'grief',
  'future',
  'just_talk',
] as const;

export type IntakeConcern = (typeof INTAKE_CONCERNS)[number];

export const AGE_RANGES = [
  '18_24',
  '25_34',
  '35_44',
  '45_54',
  '55_plus',
  'prefer_not',
] as const;

export const LIFE_SITUATIONS = [
  'relationship',
  'family',
  'work',
  'money',
  'health',
  'living',
  'study',
  'retired',
] as const;

export const RESPONSE_PREFERENCES = [
  'listen',
  'ask_questions',
  'reframe',
  'practical_steps',
  'check_in',
] as const;

export const COMPANION_TONES = [
  'warm',
  'calm',
  'direct',
  'motivating',
  'adaptive',
] as const;

export const HARD_DAY_HELPS = [
  'talking',
  'exercise',
  'music',
  'nature',
  'quiet',
  'friends',
  'sleep',
  'distraction',
  'routine',
] as const;

const CONCERN_PHRASES: Record<IntakeConcern, string> = {
  stress: 'things have felt stressful',
  overthinking: "you've been overthinking",
  relationship: 'relationships have been on your mind',
  work: 'work has been weighing on you',
  family: 'family has been on your mind',
  money: 'money worries have come up',
  confidence: 'confidence has felt shaky',
  loneliness: "you've been feeling lonely",
  motivation: 'motivation has been hard to find',
  sleep: 'sleep has been difficult',
  difficult_decision: "you're facing a difficult decision",
  grief: "you're carrying grief or loss",
  future: 'your future has been on your mind',
  just_talk: 'you mainly need someone to talk to',
};

const NAME_PREFERENCE_LABELS: Record<string, string> = {
  friend: 'Friend',
  mate: 'Mate',
  champ: 'Champ',
  just_me: 'Just me',
  rather_not: "I'd rather not say",
};

const AGE_RANGE_LABELS: Record<string, string> = {
  '18_24': '18–24',
  '25_34': '25–34',
  '35_44': '35–44',
  '45_54': '45–54',
  '55_plus': '55+',
  prefer_not: 'prefer not to say',
};

const LIFE_SITUATION_LABELS: Record<string, string> = {
  relationship: 'relationship',
  family: 'family',
  work: 'work or career',
  money: 'money',
  health: 'health',
  living: 'where they live',
  study: 'study or training',
  retired: 'retirement',
};

const RESPONSE_PREFERENCE_LABELS: Record<string, string> = {
  listen: 'listen and let them talk',
  ask_questions: 'ask questions that help them understand',
  reframe: 'help them look at things differently',
  practical_steps: 'help them find practical next steps',
  check_in: 'check in when things feel heavy',
};

const COMPANION_TONE_LABELS: Record<string, string> = {
  warm: 'warm and reassuring',
  calm: 'calm and thoughtful',
  direct: 'straightforward and practical',
  motivating: 'motivating and positive',
  adaptive: 'adaptive — learning what works over time',
};

const HARD_DAY_HELP_LABELS: Record<string, string> = {
  talking: 'talking it through',
  exercise: 'exercise or movement',
  music: 'music',
  nature: 'time outside',
  quiet: 'quiet time alone',
  friends: 'friends or family',
  sleep: 'rest or sleep',
  distraction: 'a healthy distraction',
  routine: 'sticking to a routine',
};

export function companionToneToPersonality(
  tone: string,
): Persona['personality'] {
  switch (tone) {
    case 'calm':
      return 'calm';
    case 'direct':
      return 'direct';
    case 'motivating':
      return 'playful';
    case 'adaptive':
    case 'warm':
    default:
      return 'warm';
  }
}

export function parseIntakeJson(value: string | null): IntakeProfile | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as IntakeProfile;
    if (typeof parsed.completedAt !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function resolveIntakeDisplayName(
  intake: IntakeProfile | null,
  firstName?: string | null,
): string | null {
  const fromIntake = intake?.displayName?.trim();
  if (fromIntake) return fromIntake;

  const pref = intake?.namePreference?.trim();
  if (pref && pref !== 'rather_not') {
    return NAME_PREFERENCE_LABELS[pref] ?? pref;
  }

  const fromProfile = firstName?.trim();
  return fromProfile || null;
}

export function buildWelcomeSummary(
  intake: IntakeProfile | null,
  firstName?: string | null,
): string {
  if (!intake || intake.skipped) {
    return "I'm glad you're here. Whenever you're ready, we can talk about whatever's on your mind.";
  }

  const parts: string[] = [];
  const concerns = (intake.concerns ?? []).filter((item): item is IntakeConcern =>
    INTAKE_CONCERNS.includes(item as IntakeConcern),
  );

  if (concerns.length > 0) {
    const phrases = concerns.slice(0, 3).map((concern) => CONCERN_PHRASES[concern]);
    if (phrases.length === 1) {
      parts.push(`You mentioned that ${phrases[0]}.`);
    } else if (phrases.length === 2) {
      parts.push(`You mentioned that ${phrases[0]} and ${phrases[1]}.`);
    } else {
      parts.push(
        `You mentioned that ${phrases.slice(0, -1).join(', ')}, and ${phrases[phrases.length - 1]}.`,
      );
    }
  }

  const lifeContext = intake.lifeContext?.trim();
  if (lifeContext) {
    parts.push(lifeContext.endsWith('.') ? lifeContext : `${lifeContext}.`);
  }

  const goals = intake.goals?.trim();
  if (goals) {
    parts.push(
      goals.endsWith('.')
        ? `You're hoping to work towards: ${goals}`
        : `You're hoping to work towards: ${goals}.`,
    );
  }

  if (parts.length === 0) {
    const name = resolveIntakeDisplayName(intake, firstName);
    return name
      ? `${name}, I'm glad you're here. Whenever you're ready, we can talk about whatever's on your mind.`
      : "I'm glad you're here. Whenever you're ready, we can talk about whatever's on your mind.";
  }

  return parts.join(' ');
}

export function buildIntakeMemory(intake: IntakeProfile, firstName?: string | null): string {
  const dateLabel = new Date(intake.completedAt).toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const displayName = resolveIntakeDisplayName(intake, firstName);
  const lines: string[] = ['From intake questionnaire:'];

  if (displayName) {
    lines.push(`## Identity`, `- Prefers to be called ${displayName} (intake, ${dateLabel})`);
  }

  if (intake.ageRange && intake.ageRange !== 'prefer_not') {
    lines.push(
      `- Age range: ${AGE_RANGE_LABELS[intake.ageRange] ?? intake.ageRange} (intake, ${dateLabel})`,
    );
  }

  const lifeSituations = intake.lifeSituations ?? [];
  if (lifeSituations.length > 0) {
    const labels = lifeSituations.map((item) => LIFE_SITUATION_LABELS[item] ?? item);
    lines.push(`- Life right now: ${labels.join(', ')} (intake, ${dateLabel})`);
  }

  const concerns = intake.concerns ?? [];
  if (concerns.length > 0) {
    lines.push(
      `## Mental health & wellbeing`,
      `- What's been on their mind: ${concerns.join(', ')} (intake, ${dateLabel})`,
    );
  }

  if (intake.lifeContext?.trim()) {
    lines.push(`## Work & life stressors`, `- ${intake.lifeContext.trim()} (intake, ${dateLabel})`);
  }

  const preferenceLines: string[] = [];
  if (intake.responsePreference) {
    preferenceLines.push(
      `- When something is bothering them, they prefer you to ${RESPONSE_PREFERENCE_LABELS[intake.responsePreference] ?? intake.responsePreference} (intake, ${dateLabel})`,
    );
  }
  if (intake.companionTone) {
    preferenceLines.push(
      `- They want you to be ${COMPANION_TONE_LABELS[intake.companionTone] ?? intake.companionTone} (intake, ${dateLabel})`,
    );
  }
  const hardDayHelps = intake.hardDayHelps ?? [];
  if (hardDayHelps.length > 0) {
    const labels = hardDayHelps.map((item) => HARD_DAY_HELP_LABELS[item] ?? item);
    preferenceLines.push(
      `- On difficult days, what usually helps: ${labels.join(', ')} (intake, ${dateLabel})`,
    );
  }
  if (intake.goals?.trim()) {
    preferenceLines.push(`- Goals: ${intake.goals.trim()} (intake, ${dateLabel})`);
  }
  if (preferenceLines.length > 0) {
    lines.push(`## Patterns & preferences`, ...preferenceLines);
  }

  return lines.join('\n');
}

export function stripIntakeBlock(memory: string): string {
  const marker = 'From intake questionnaire:';
  const index = memory.indexOf(marker);
  if (index === -1) return memory.trim();

  const before = memory.slice(0, index).trim();
  const tail = memory.slice(index);
  const chunks = tail.split('\n\n');
  const remaining: string[] = [];

  for (const chunk of chunks) {
    if (chunk.includes(marker)) continue;
    if (chunk.includes('(intake,') || chunk.startsWith('##') || chunk.startsWith('-')) {
      continue;
    }
    remaining.push(chunk);
  }

  const after = remaining.join('\n\n').trim();
  return [before, after].filter(Boolean).join('\n\n');
}

export function resolveIntakeFirstName(intake: IntakeProfile): string | null {
  const displayName = intake.displayName?.trim();
  if (displayName) return displayName;

  const pref = intake.namePreference?.trim();
  if (!pref || pref === 'rather_not' || pref === 'just_me') return null;

  return NAME_PREFERENCE_LABELS[pref] ?? null;
}

function filterEnumValues<T extends readonly string[]>(
  values: unknown,
  allowed: T,
  max: number,
): T[number][] {
  if (!Array.isArray(values)) return [];
  return values
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item): item is T[number] => allowed.includes(item as T[number]))
    .slice(0, max);
}

export function parseIntakeBody(body: Record<string, unknown>): IntakeProfile {
  const skipped = body.skipped === true;
  const displayName =
    typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 100) : '';
  const namePreference =
    typeof body.namePreference === 'string'
      ? body.namePreference.trim().slice(0, 40)
      : undefined;
  const lifeContext =
    typeof body.lifeContext === 'string' ? body.lifeContext.trim().slice(0, 500) : '';
  const goals = typeof body.goals === 'string' ? body.goals.trim().slice(0, 500) : '';
  const ageRange =
    typeof body.ageRange === 'string' &&
    AGE_RANGES.includes(body.ageRange as (typeof AGE_RANGES)[number])
      ? body.ageRange
      : undefined;
  const responsePreference =
    typeof body.responsePreference === 'string' &&
    RESPONSE_PREFERENCES.includes(
      body.responsePreference as (typeof RESPONSE_PREFERENCES)[number],
    )
      ? body.responsePreference
      : undefined;
  const companionTone =
    typeof body.companionTone === 'string' &&
    COMPANION_TONES.includes(body.companionTone as (typeof COMPANION_TONES)[number])
      ? body.companionTone
      : undefined;

  return {
    ...(displayName ? { displayName } : {}),
    ...(namePreference ? { namePreference } : {}),
    ...(ageRange ? { ageRange } : {}),
    ...(filterEnumValues(body.lifeSituations, LIFE_SITUATIONS, 8).length
      ? { lifeSituations: filterEnumValues(body.lifeSituations, LIFE_SITUATIONS, 8) }
      : {}),
    ...(filterEnumValues(body.concerns, INTAKE_CONCERNS, 14).length
      ? { concerns: filterEnumValues(body.concerns, INTAKE_CONCERNS, 14) }
      : {}),
    ...(lifeContext ? { lifeContext } : {}),
    ...(responsePreference ? { responsePreference } : {}),
    ...(companionTone ? { companionTone } : {}),
    ...(filterEnumValues(body.hardDayHelps, HARD_DAY_HELPS, 9).length
      ? { hardDayHelps: filterEnumValues(body.hardDayHelps, HARD_DAY_HELPS, 9) }
      : {}),
    ...(goals ? { goals } : {}),
    ...(skipped ? { skipped: true } : {}),
    completedAt: new Date().toISOString(),
  };
}
