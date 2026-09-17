function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toIsoWeek(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${d.getUTCFullYear()}-W${weekNo}`;
}

export function computeGoalStats(
  completionDates: string[],
  frequency: string,
): { currentStreak: number; completedToday: boolean; totalCompletions: number } {
  const totalCompletions = completionDates.length;
  const todayKey = toDateOnly(new Date());
  const completedToday = completionDates.includes(todayKey);

  if (completionDates.length === 0) {
    return { currentStreak: 0, completedToday, totalCompletions };
  }

  if (frequency === 'weekly') {
    const weeks = new Set(
      completionDates.map((d) => toIsoWeek(new Date(`${d}T00:00:00Z`))),
    );
    let cursor = new Date();
    let streak = 0;
    let currentWeekKey = toIsoWeek(cursor);
    if (!weeks.has(currentWeekKey)) {
      cursor.setUTCDate(cursor.getUTCDate() - 7);
      currentWeekKey = toIsoWeek(cursor);
    }
    while (weeks.has(currentWeekKey)) {
      streak++;
      cursor.setUTCDate(cursor.getUTCDate() - 7);
      currentWeekKey = toIsoWeek(cursor);
    }
    return { currentStreak: streak, completedToday, totalCompletions };
  }

  const days = new Set(completionDates);
  const cursor = new Date();
  if (!completedToday) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  let streak = 0;
  let cursorKey = toDateOnly(cursor);
  while (days.has(cursorKey)) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    cursorKey = toDateOnly(cursor);
  }
  return { currentStreak: streak, completedToday, totalCompletions };
}

export function todayDateKey(): string {
  return toDateOnly(new Date());
}
