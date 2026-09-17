import {
  getCompanionMemory,
  getUser,
  listGoals,
  listMoods,
  parsePersonaJson,
  saveCachedCheckIn,
  serializeGoals,
  type CheckInAction,
} from './db';
import { readMemoryForUser } from './companionMemory';

export type ProactiveCheckIn = {
  message: string;
  action: CheckInAction;
  companionName: string;
  dateKey: string;
};

function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function isToday(isoDate: string): boolean {
  return isoDate.slice(0, 10) === todayDateKey();
}

const INTAKE_META_SUFFIX = /\s*\(intake,\s*[^)]+\)\s*$/i;

function stripIntakeMeta(text: string): string {
  return text.replace(INTAKE_META_SUFFIX, '').trim();
}

function truncateHook(text: string): string {
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

function isLowValueHook(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.startsWith('prefers to be called') ||
    lower.startsWith('age range:') ||
    lower.startsWith('they want you to be') ||
    lower.startsWith('when something is bothering them, they prefer you to')
  );
}

function formatMemoryHook(raw: string): string | null {
  const cleaned = stripIntakeMeta(raw);
  if (!cleaned || isLowValueHook(cleaned)) return null;

  const onMind = /^what's been on their mind:\s*(.+)$/i.exec(cleaned);
  if (onMind) {
    const topics = onMind[1]
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (topics.length === 1) return truncateHook(topics[0]);
    if (topics.length === 2) return truncateHook(`${topics[0]} and ${topics[1]}`);
    if (topics.length > 2) {
      return truncateHook(
        `${topics.slice(0, -1).join(', ')}, and ${topics[topics.length - 1]}`,
      );
    }
  }

  const lifeNow = /^life right now:\s*(.+)$/i.exec(cleaned);
  if (lifeNow) return truncateHook(lifeNow[1]);

  const goals = /^goals:\s*(.+)$/i.exec(cleaned);
  if (goals) return truncateHook(goals[1]);

  const difficultDays = /^on difficult days, what usually helps:\s*(.+)$/i.exec(cleaned);
  if (difficultDays) return truncateHook(difficultDays[1]);

  return truncateHook(cleaned);
}

function extractMemoryHook(memory: string): string | null {
  const bullets = memory
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim());

  for (const bullet of bullets) {
    const hook = formatMemoryHook(bullet);
    if (hook) return hook;
  }

  return null;
}

type CheckInContext = {
  firstName: string | null;
  companionName: string;
  todayMood: { moodScore: number; note: string | null } | null;
  incompleteDailyGoals: number;
  memory: string;
};

function gatherContext(userId: string): CheckInContext {
  const user = getUser(userId);
  const persona = parsePersonaJson(user?.personaJson ?? null);
  const moods = listMoods(userId, 7);
  const todayMood = moods.find((mood) => isToday(mood.createdAt)) ?? null;
  const goals = serializeGoals(listGoals(userId, false));
  const dailyGoals = goals.filter((goal) => goal.frequency === 'daily' && !goal.archived);
  const incompleteDailyGoals = dailyGoals.filter((goal) => !goal.completedToday).length;
  const memory = getCompanionMemory(userId)?.memory ?? readMemoryForUser(userId).memory;

  return {
    firstName: user?.firstName ?? null,
    companionName: persona?.name?.trim() || 'Your companion',
    todayMood: todayMood
      ? { moodScore: todayMood.moodScore, note: todayMood.note }
      : null,
    incompleteDailyGoals,
    memory,
  };
}

function buildProactiveCheckIn(context: CheckInContext): Omit<ProactiveCheckIn, 'dateKey'> {
  const name = context.firstName?.trim() || 'there';
  const { companionName, todayMood, incompleteDailyGoals, memory } = context;

  if (!todayMood) {
    return {
      companionName,
      action: 'mood',
      message: `Hey ${name}, I haven't heard how you're feeling today. Want to check in together?`,
    };
  }

  if (incompleteDailyGoals > 0) {
    const left = incompleteDailyGoals;
    return {
      companionName,
      action: 'goals',
      message: `${name}, you still have ${left} daily habit${left === 1 ? '' : 's'} left today. I'm here if you want to talk it through.`,
    };
  }

  const memoryHook = extractMemoryHook(memory);
  if (memoryHook) {
    return {
      companionName,
      action: 'chat',
      message: `Hey ${name}, I've been thinking about what you shared — ${memoryHook}. How are things going?`,
    };
  }

  if (todayMood.moodScore <= 2) {
    return {
      companionName,
      action: 'chat',
      message: `${name}, I'm thinking of you after your check-in today. Want to talk for a minute?`,
    };
  }

  if (todayMood.note?.trim()) {
    return {
      companionName,
      action: 'chat',
      message: `${name}, I've been holding what you shared today. Want to pick that up together?`,
    };
  }

  return {
    companionName,
    action: 'chat',
    message: `${name}, just checking in. I'm here whenever you want to talk.`,
  };
}

export function getProactiveCheckIn(userId: string): ProactiveCheckIn {
  const dateKey = todayDateKey();
  const built = buildProactiveCheckIn(gatherContext(userId));
  saveCachedCheckIn(userId, dateKey, built.message, built.action);
  return { ...built, dateKey };
}
