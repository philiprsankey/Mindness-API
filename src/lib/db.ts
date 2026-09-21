import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';
import { computeGoalStats } from './goalStats';
import { parseSubscriptionTier, type SubscriptionTier } from './subscription';

export type ConversationRow = {
  id: number;
  userId: string;
  title: string;
  createdAt: string;
};

export type MessageRow = {
  id: number;
  conversationId: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
};

export type Persona = {
  name: string;
  gender: 'male' | 'female' | 'neutral';
  origin: string;
  personality: string;
  avatarId: string;
};

export type UserRow = {
  id: string;
  email: string | null;
  firstName: string | null;
  personaJson: string | null;
  intakeJson: string | null;
  companionWelcomeSeen: boolean;
  onboarded: boolean;
  passwordHash: string | null;
  emailVerifiedAt: string | null;
  googleId: string | null;
  authProvider: 'email' | 'google';
  subscriptionTier: SubscriptionTier;
  createdAt: string;
  updatedAt: string;
};

export type MoodRow = {
  id: number;
  userId: string;
  moodScore: number;
  note: string | null;
  createdAt: string;
};

export type GoalFrequency = 'daily' | 'weekly';

export type GoalRow = {
  id: number;
  userId: string;
  title: string;
  description: string | null;
  frequency: GoalFrequency;
  archived: boolean;
  createdAt: string;
};

export type SerializedGoal = GoalRow & {
  currentStreak: number;
  completedToday: boolean;
  totalCompletions: number;
};

export type GratitudeRow = {
  id: number;
  userId: string;
  items: string[];
  createdAt: string;
};

export type JournalRow = {
  id: number;
  userId: string;
  title: string;
  content: string;
  prompt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CompanionMemoryRow = {
  id: number;
  userId: string;
  memory: string;
  version: number;
  updatedAt: string;
};

export type CheckInAction = 'chat' | 'mood' | 'goals';

export type CompanionCheckInCacheRow = {
  id: number;
  userId: string;
  dateKey: string;
  message: string;
  action: CheckInAction;
  createdAt: string;
};

const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'mindness.db');

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT,
    first_name TEXT,
    persona_json TEXT,
    onboarded INTEGER NOT NULL DEFAULT 0,
    password_hash TEXT,
    email_verified_at TEXT,
    google_id TEXT,
    auth_provider TEXT NOT NULL DEFAULT 'email',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS moods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    mood_score INTEGER NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_moods_user_id ON moods(user_id);

  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    frequency TEXT NOT NULL DEFAULT 'daily',
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS goal_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER NOT NULL,
    completed_date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE,
    UNIQUE(goal_id, completed_date)
  );

  CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
  CREATE INDEX IF NOT EXISTS idx_goal_completions_goal_id ON goal_completions(goal_id);

  CREATE TABLE IF NOT EXISTS gratitude_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    items_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_gratitude_user_id ON gratitude_entries(user_id);

  CREATE TABLE IF NOT EXISTS journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    prompt TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_journal_entries_user_id ON journal_entries(user_id);
`);

function columnExists(table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((col) => col.name === column);
}

function runMigrations(): void {
  if (columnExists('users', 'clerk_user_id') && !columnExists('users', 'id')) {
    db.exec(`ALTER TABLE users RENAME COLUMN clerk_user_id TO id`);
  }

  if (!columnExists('users', 'password_hash')) {
    db.exec(`ALTER TABLE users ADD COLUMN password_hash TEXT`);
  }
  if (!columnExists('users', 'email_verified_at')) {
    db.exec(`ALTER TABLE users ADD COLUMN email_verified_at TEXT`);
  }
  if (!columnExists('users', 'google_id')) {
    db.exec(`ALTER TABLE users ADD COLUMN google_id TEXT`);
  }
  if (!columnExists('users', 'auth_provider')) {
    db.exec(`ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'email'`);
  }
  if (!columnExists('users', 'subscription_tier')) {
    db.exec(`ALTER TABLE users ADD COLUMN subscription_tier TEXT NOT NULL DEFAULT 'free'`);
  }
  if (!columnExists('users', 'intake_json')) {
    db.exec(`ALTER TABLE users ADD COLUMN intake_json TEXT`);
  }
  if (!columnExists('users', 'companion_welcome_seen')) {
    db.exec(`ALTER TABLE users ADD COLUMN companion_welcome_seen INTEGER NOT NULL DEFAULT 0`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      email TEXT,
      token_hash TEXT NOT NULL,
      type TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_id ON auth_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_email ON auth_tokens(email);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS companion_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL UNIQUE,
      memory TEXT NOT NULL DEFAULT '',
      version INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_companion_memory_user_id ON companion_memory(user_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS companion_check_in_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      date_key TEXT NOT NULL,
      message TEXT NOT NULL,
      action TEXT NOT NULL DEFAULT 'chat',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, date_key)
    );

    CREATE INDEX IF NOT EXISTS idx_companion_check_in_user_date
      ON companion_check_in_cache(user_id, date_key);
  `);
}

runMigrations();

function mapUserRow(row: Record<string, unknown>): UserRow {
  return {
    id: String(row.id ?? row.clerk_user_id),
    email: (row.email as string | null) ?? null,
    firstName: (row.first_name as string | null) ?? null,
    personaJson: (row.persona_json as string | null) ?? null,
    intakeJson: (row.intake_json as string | null) ?? null,
    companionWelcomeSeen: Boolean(row.companion_welcome_seen),
    onboarded: Boolean(row.onboarded),
    passwordHash: (row.password_hash as string | null) ?? null,
    emailVerifiedAt: (row.email_verified_at as string | null) ?? null,
    googleId: (row.google_id as string | null) ?? null,
    authProvider: ((row.auth_provider as string | undefined) ?? 'email') as 'email' | 'google',
    subscriptionTier: parseSubscriptionTier(row.subscription_tier),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function defaultAvatarIdForGender(gender: Persona['gender']): string {
  return gender === 'male' ? 'm1' : 'f1';
}

export function normalizePersonaAvatar(persona: Persona): Persona {
  if (persona.avatarId === 'custom') {
    return {
      ...persona,
      avatarId: defaultAvatarIdForGender(persona.gender),
    };
  }

  return persona;
}

export function parsePersonaJson(value: string | null): Persona | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Persona;
    if (
      typeof parsed.name === 'string' &&
      typeof parsed.gender === 'string' &&
      typeof parsed.origin === 'string' &&
      typeof parsed.personality === 'string' &&
      typeof parsed.avatarId === 'string'
    ) {
      return normalizePersonaAvatar(parsed);
    }
    return null;
  } catch {
    return null;
  }
}

export function ensureUser(
  userId: string,
  email?: string | null,
  firstName?: string | null,
): UserRow {
  const existing = getUser(userId);
  if (existing) {
    if (email || firstName) {
      db.prepare(
        `UPDATE users
         SET email = COALESCE(?, email),
             first_name = COALESCE(?, first_name),
             updated_at = datetime('now')
         WHERE id = ?`,
      ).run(email ?? null, firstName ?? null, userId);
      return getUser(userId)!;
    }
    return existing;
  }

  db.prepare(
    `INSERT INTO users (id, email, first_name, auth_provider)
     VALUES (?, ?, ?, 'email')`,
  ).run(userId, email ?? null, firstName ?? null);

  return getUser(userId)!;
}

export function getUser(userId: string): UserRow | null {
  const row = db
    .prepare(
      `SELECT id, email, first_name, persona_json, intake_json, companion_welcome_seen,
              onboarded, password_hash, email_verified_at, google_id, auth_provider,
              subscription_tier, created_at, updated_at
       FROM users WHERE id = ?`,
    )
    .get(userId) as Record<string, unknown> | undefined;
  return row ? mapUserRow(row) : null;
}

export function getUserByEmail(email: string): UserRow | null {
  const row = db
    .prepare(
      `SELECT id, email, first_name, persona_json, intake_json, companion_welcome_seen,
              onboarded, password_hash, email_verified_at, google_id, auth_provider,
              subscription_tier, created_at, updated_at
       FROM users WHERE lower(email) = lower(?)`,
    )
    .get(email.trim()) as Record<string, unknown> | undefined;
  return row ? mapUserRow(row) : null;
}

export function getUserByGoogleId(googleId: string): UserRow | null {
  const row = db
    .prepare(
      `SELECT id, email, first_name, persona_json, intake_json, companion_welcome_seen,
              onboarded, password_hash, email_verified_at, google_id, auth_provider,
              subscription_tier, created_at, updated_at
       FROM users WHERE google_id = ?`,
    )
    .get(googleId) as Record<string, unknown> | undefined;
  return row ? mapUserRow(row) : null;
}

export function createEmailUser(
  userId: string,
  email: string,
  passwordHash: string,
  firstName?: string | null,
): UserRow {
  db.prepare(
    `INSERT INTO users (id, email, first_name, password_hash, auth_provider)
     VALUES (?, ?, ?, ?, 'email')`,
  ).run(userId, email.toLowerCase(), firstName ?? null, passwordHash);
  return getUser(userId)!;
}

export function createGoogleUser(
  userId: string,
  email: string,
  googleId: string,
  firstName?: string | null,
): UserRow {
  db.prepare(
    `INSERT INTO users (id, email, first_name, google_id, auth_provider, email_verified_at)
     VALUES (?, ?, ?, ?, 'google', datetime('now'))`,
  ).run(userId, email.toLowerCase(), firstName ?? null, googleId);
  return getUser(userId)!;
}

export function markEmailVerified(userId: string): void {
  db.prepare(
    `UPDATE users SET email_verified_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
  ).run(userId);
}

export function updateUserPassword(userId: string, passwordHash: string): void {
  db.prepare(
    `UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(passwordHash, userId);
}

export function saveUserPersona(
  userId: string,
  persona: Persona,
  firstName?: string | null,
): UserRow {
  ensureUser(userId);
  db.prepare(
    `UPDATE users
     SET persona_json = ?,
         onboarded = 1,
         first_name = COALESCE(?, first_name),
         updated_at = datetime('now')
     WHERE id = ?`,
  ).run(JSON.stringify(persona), firstName ?? null, userId);
  return getUser(userId)!;
}

export function markUserOnboarded(userId: string): void {
  ensureUser(userId);
  db.prepare(
    `UPDATE users SET onboarded = 1, updated_at = datetime('now') WHERE id = ?`,
  ).run(userId);
}

export function saveUserIntake(
  userId: string,
  intakeJson: string,
  firstName?: string | null,
): UserRow {
  ensureUser(userId);
  db.prepare(
    `UPDATE users
     SET intake_json = ?,
         first_name = COALESCE(?, first_name),
         updated_at = datetime('now')
     WHERE id = ?`,
  ).run(intakeJson, firstName ?? null, userId);
  return getUser(userId)!;
}

export function markCompanionWelcomeSeen(userId: string): UserRow {
  ensureUser(userId);
  db.prepare(
    `UPDATE users
     SET companion_welcome_seen = 1,
         updated_at = datetime('now')
     WHERE id = ?`,
  ).run(userId);
  return getUser(userId)!;
}

export function listConversations(userId: string): ConversationRow[] {
  return db
    .prepare(
      `SELECT id, user_id as userId, title, created_at as createdAt
       FROM conversations
       WHERE user_id = ?
       ORDER BY datetime(created_at) DESC`,
    )
    .all(userId) as ConversationRow[];
}

export function createConversation(userId: string, title: string): ConversationRow {
  const result = db
    .prepare(`INSERT INTO conversations (user_id, title) VALUES (?, ?)`)
    .run(userId, title);
  return getConversation(userId, Number(result.lastInsertRowid))!;
}

export function getConversation(userId: string, id: number): ConversationRow | null {
  return (
    (db
      .prepare(
        `SELECT id, user_id as userId, title, created_at as createdAt
         FROM conversations
         WHERE id = ? AND user_id = ?`,
      )
      .get(id, userId) as ConversationRow | undefined) ?? null
  );
}

export function listMessages(conversationId: number): MessageRow[] {
  return db
    .prepare(
      `SELECT id, conversation_id as conversationId, role, content, created_at as createdAt
       FROM messages
       WHERE conversation_id = ?
       ORDER BY datetime(created_at) ASC`,
    )
    .all(conversationId) as MessageRow[];
}

export function insertMessage(
  conversationId: number,
  role: MessageRow['role'],
  content: string,
): MessageRow {
  const result = db
    .prepare(`INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)`)
    .run(conversationId, role, content);
  return db
    .prepare(
      `SELECT id, conversation_id as conversationId, role, content, created_at as createdAt
       FROM messages WHERE id = ?`,
    )
    .get(Number(result.lastInsertRowid)) as MessageRow;
}

export function countUserMessagesToday(userId: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) as count
       FROM messages m
       INNER JOIN conversations c ON c.id = m.conversation_id
       WHERE c.user_id = ?
         AND m.role = 'user'
         AND datetime(m.created_at) >= datetime('now', 'start of day')`,
    )
    .get(userId) as { count: number };
  return row.count;
}

export function updateConversationTitle(id: number, title: string): void {
  db.prepare(`UPDATE conversations SET title = ? WHERE id = ?`).run(title, id);
}

export function deleteAllConversations(userId: string): void {
  db.prepare(`DELETE FROM conversations WHERE user_id = ?`).run(userId);
}

function mapCompanionMemoryRow(row: Record<string, unknown>): CompanionMemoryRow {
  return {
    id: Number(row.id),
    userId: String(row.user_id),
    memory: String(row.memory ?? ''),
    version: Number(row.version ?? 0),
    updatedAt: String(row.updated_at),
  };
}

export function ensureCompanionMemory(userId: string): CompanionMemoryRow {
  db.prepare(
    `INSERT OR IGNORE INTO companion_memory (user_id, memory, version) VALUES (?, '', 0)`,
  ).run(userId);
  return getCompanionMemory(userId)!;
}

export function getCompanionMemory(userId: string): CompanionMemoryRow | null {
  const row = db
    .prepare(
      `SELECT id, user_id, memory, version, updated_at
       FROM companion_memory WHERE user_id = ?`,
    )
    .get(userId) as Record<string, unknown> | undefined;
  return row ? mapCompanionMemoryRow(row) : null;
}

export function replaceCompanionMemory(userId: string, memory: string): CompanionMemoryRow {
  db.prepare(
    `INSERT INTO companion_memory (user_id, memory, version)
     VALUES (?, ?, 1)
     ON CONFLICT(user_id) DO UPDATE SET
       memory = excluded.memory,
       version = companion_memory.version + 1,
       updated_at = datetime('now')`,
  ).run(userId, memory);
  return getCompanionMemory(userId)!;
}

export function updateCompanionMemoryIfVersion(
  userId: string,
  memory: string,
  expectedVersion: number,
): boolean {
  const result = db
    .prepare(
      `UPDATE companion_memory
       SET memory = ?, version = ?, updated_at = datetime('now')
       WHERE user_id = ? AND version = ?`,
    )
    .run(memory, expectedVersion + 1, userId, expectedVersion);
  return result.changes > 0;
}

function mapCheckInCacheRow(row: Record<string, unknown>): CompanionCheckInCacheRow {
  return {
    id: Number(row.id),
    userId: String(row.user_id),
    dateKey: String(row.date_key),
    message: String(row.message),
    action: String(row.action) as CheckInAction,
    createdAt: String(row.created_at),
  };
}

export function getCachedCheckIn(
  userId: string,
  dateKey: string,
): CompanionCheckInCacheRow | null {
  const row = db
    .prepare(
      `SELECT id, user_id, date_key, message, action, created_at
       FROM companion_check_in_cache
       WHERE user_id = ? AND date_key = ?`,
    )
    .get(userId, dateKey) as Record<string, unknown> | undefined;
  return row ? mapCheckInCacheRow(row) : null;
}

export function saveCachedCheckIn(
  userId: string,
  dateKey: string,
  message: string,
  action: CheckInAction,
): CompanionCheckInCacheRow {
  db.prepare(
    `INSERT INTO companion_check_in_cache (user_id, date_key, message, action)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, date_key) DO UPDATE SET
       message = excluded.message,
       action = excluded.action,
       created_at = datetime('now')`,
  ).run(userId, dateKey, message, action);

  return getCachedCheckIn(userId, dateKey)!;
}

export function listMoods(userId: string, days?: number): MoodRow[] {
  if (days != null && days > 0) {
    return db
      .prepare(
        `SELECT id, user_id as userId, mood_score as moodScore, note, created_at as createdAt
         FROM moods
         WHERE user_id = ?
           AND datetime(created_at) >= datetime('now', '-' || ? || ' days')
         ORDER BY datetime(created_at) DESC`,
      )
      .all(userId, days) as MoodRow[];
  }

  return db
    .prepare(
      `SELECT id, user_id as userId, mood_score as moodScore, note, created_at as createdAt
       FROM moods
       WHERE user_id = ?
       ORDER BY datetime(created_at) DESC`,
    )
    .all(userId) as MoodRow[];
}

export function createMood(
  userId: string,
  moodScore: number,
  note?: string | null,
): MoodRow {
  const result = db
    .prepare(`INSERT INTO moods (user_id, mood_score, note) VALUES (?, ?, ?)`)
    .run(userId, moodScore, note?.trim() || null);
  return db
    .prepare(
      `SELECT id, user_id as userId, mood_score as moodScore, note, created_at as createdAt
       FROM moods WHERE id = ?`,
    )
    .get(Number(result.lastInsertRowid)) as MoodRow;
}

export function deleteMood(userId: string, id: number): boolean {
  const result = db
    .prepare(`DELETE FROM moods WHERE id = ? AND user_id = ?`)
    .run(id, userId);
  return result.changes > 0;
}

function mapGoalRow(row: Record<string, unknown>): GoalRow {
  return {
    id: Number(row.id),
    userId: String(row.user_id),
    title: String(row.title),
    description: (row.description as string | null) ?? null,
    frequency: String(row.frequency) as GoalFrequency,
    archived: Boolean(row.archived),
    createdAt: String(row.created_at),
  };
}

function getCompletionDatesForGoals(goalIds: number[]): Map<number, string[]> {
  const map = new Map<number, string[]>();
  if (goalIds.length === 0) return map;

  const placeholders = goalIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT goal_id, completed_date FROM goal_completions WHERE goal_id IN (${placeholders})`,
    )
    .all(...goalIds) as { goal_id: number; completed_date: string }[];

  for (const row of rows) {
    const list = map.get(row.goal_id) ?? [];
    list.push(row.completed_date);
    map.set(row.goal_id, list);
  }
  return map;
}

export function serializeGoals(goals: GoalRow[]): SerializedGoal[] {
  const completions = getCompletionDatesForGoals(goals.map((g) => g.id));
  return goals.map((goal) => {
    const stats = computeGoalStats(completions.get(goal.id) ?? [], goal.frequency);
    return { ...goal, ...stats };
  });
}

export function listGoals(userId: string, archived?: boolean): GoalRow[] {
  const rows =
    archived === undefined
      ? (db
          .prepare(
            `SELECT id, user_id, title, description, frequency, archived, created_at
             FROM goals WHERE user_id = ? ORDER BY datetime(created_at) DESC`,
          )
          .all(userId) as Record<string, unknown>[])
      : (db
          .prepare(
            `SELECT id, user_id, title, description, frequency, archived, created_at
             FROM goals WHERE user_id = ? AND archived = ? ORDER BY datetime(created_at) DESC`,
          )
          .all(userId, archived ? 1 : 0) as Record<string, unknown>[]);

  return rows.map(mapGoalRow);
}

export function createGoal(
  userId: string,
  title: string,
  description: string | null,
  frequency: GoalFrequency,
): GoalRow {
  const result = db
    .prepare(
      `INSERT INTO goals (user_id, title, description, frequency) VALUES (?, ?, ?, ?)`,
    )
    .run(userId, title, description, frequency);
  return getGoal(userId, Number(result.lastInsertRowid))!;
}

export function getGoal(userId: string, id: number): GoalRow | null {
  const row = db
    .prepare(
      `SELECT id, user_id, title, description, frequency, archived, created_at
       FROM goals WHERE id = ? AND user_id = ?`,
    )
    .get(id, userId) as Record<string, unknown> | undefined;
  return row ? mapGoalRow(row) : null;
}

export function updateGoal(
  userId: string,
  id: number,
  patch: Partial<Pick<GoalRow, 'title' | 'description' | 'frequency' | 'archived'>>,
): GoalRow | null {
  const existing = getGoal(userId, id);
  if (!existing) return null;

  const title = patch.title ?? existing.title;
  const description =
    patch.description !== undefined ? patch.description : existing.description;
  const frequency = patch.frequency ?? existing.frequency;
  const archived = patch.archived ?? existing.archived;

  db.prepare(
    `UPDATE goals SET title = ?, description = ?, frequency = ?, archived = ? WHERE id = ? AND user_id = ?`,
  ).run(title, description, frequency, archived ? 1 : 0, id, userId);

  return getGoal(userId, id);
}

export function deleteGoal(userId: string, id: number): boolean {
  const result = db.prepare(`DELETE FROM goals WHERE id = ? AND user_id = ?`).run(id, userId);
  return result.changes > 0;
}

export function toggleGoalCompletion(userId: string, goalId: number, dateKey: string): GoalRow | null {
  const goal = getGoal(userId, goalId);
  if (!goal) return null;

  const existing = db
    .prepare(`SELECT id FROM goal_completions WHERE goal_id = ? AND completed_date = ?`)
    .get(goalId, dateKey) as { id: number } | undefined;

  if (existing) {
    db.prepare(`DELETE FROM goal_completions WHERE id = ?`).run(existing.id);
  } else {
    db.prepare(`INSERT INTO goal_completions (goal_id, completed_date) VALUES (?, ?)`).run(
      goalId,
      dateKey,
    );
  }

  return goal;
}

function mapGratitudeRow(row: Record<string, unknown>): GratitudeRow {
  let items: string[] = [];
  try {
    const parsed = JSON.parse(String(row.items_json)) as unknown;
    if (Array.isArray(parsed)) {
      items = parsed.filter((item): item is string => typeof item === 'string');
    }
  } catch {
    items = [];
  }

  return {
    id: Number(row.id),
    userId: String(row.user_id),
    items,
    createdAt: String(row.created_at),
  };
}

export function listGratitudeEntries(userId: string, days = 30): GratitudeRow[] {
  const rows = db
    .prepare(
      `SELECT id, user_id, items_json, created_at
       FROM gratitude_entries
       WHERE user_id = ?
         AND datetime(created_at) >= datetime('now', '-' || ? || ' days')
       ORDER BY datetime(created_at) DESC
       LIMIT 60`,
    )
    .all(userId, days) as Record<string, unknown>[];

  return rows.map(mapGratitudeRow);
}

export function createGratitudeEntry(userId: string, items: string[]): GratitudeRow {
  const result = db
    .prepare(`INSERT INTO gratitude_entries (user_id, items_json) VALUES (?, ?)`)
    .run(userId, JSON.stringify(items));

  const row = db
    .prepare(`SELECT id, user_id, items_json, created_at FROM gratitude_entries WHERE id = ?`)
    .get(Number(result.lastInsertRowid)) as Record<string, unknown>;

  return mapGratitudeRow(row);
}

function mapJournalRow(row: Record<string, unknown>): JournalRow {
  return {
    id: Number(row.id),
    userId: String(row.user_id),
    title: String(row.title),
    content: String(row.content ?? ''),
    prompt: (row.prompt as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function listJournalEntries(userId: string): JournalRow[] {
  const rows = db
    .prepare(
      `SELECT id, user_id, title, content, prompt, created_at, updated_at
       FROM journal_entries
       WHERE user_id = ?
       ORDER BY datetime(created_at) DESC`,
    )
    .all(userId) as Record<string, unknown>[];

  return rows.map(mapJournalRow);
}

export function getJournalEntry(userId: string, id: number): JournalRow | null {
  const row = db
    .prepare(
      `SELECT id, user_id, title, content, prompt, created_at, updated_at
       FROM journal_entries WHERE id = ? AND user_id = ?`,
    )
    .get(id, userId) as Record<string, unknown> | undefined;

  return row ? mapJournalRow(row) : null;
}

export function createJournalEntry(
  userId: string,
  title: string,
  content: string,
  prompt: string | null,
): JournalRow {
  const result = db
    .prepare(
      `INSERT INTO journal_entries (user_id, title, content, prompt) VALUES (?, ?, ?, ?)`,
    )
    .run(userId, title, content, prompt);

  return getJournalEntry(userId, Number(result.lastInsertRowid))!;
}

export function updateJournalEntry(
  userId: string,
  id: number,
  patch: Partial<Pick<JournalRow, 'title' | 'content'>>,
): JournalRow | null {
  const existing = getJournalEntry(userId, id);
  if (!existing) return null;

  const title = patch.title ?? existing.title;
  const content = patch.content ?? existing.content;

  db.prepare(
    `UPDATE journal_entries SET title = ?, content = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`,
  ).run(title, content, id, userId);

  return getJournalEntry(userId, id);
}

export function deleteJournalEntry(userId: string, id: number): boolean {
  const result = db
    .prepare(`DELETE FROM journal_entries WHERE id = ? AND user_id = ?`)
    .run(id, userId);
  return result.changes > 0;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateSixDigitCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function createEmailVerificationCode(userId: string, email: string): string {
  const code = generateSixDigitCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  db.prepare(`DELETE FROM auth_tokens WHERE email = ? AND type = 'email_verify'`).run(
    email.toLowerCase(),
  );

  db.prepare(
    `INSERT INTO auth_tokens (id, user_id, email, token_hash, type, expires_at)
     VALUES (?, ?, ?, ?, 'email_verify', ?)`,
  ).run(crypto.randomUUID(), userId, email.toLowerCase(), hashToken(code), expiresAt);

  return code;
}

export function verifyEmailCode(email: string, code: string): string | null {
  const row = db
    .prepare(
      `SELECT user_id, token_hash, expires_at
       FROM auth_tokens
       WHERE email = ? AND type = 'email_verify'
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(email.toLowerCase()) as
    | { user_id: string; token_hash: string; expires_at: string }
    | undefined;

  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) return null;
  if (hashToken(code) !== row.token_hash) return null;

  db.prepare(`DELETE FROM auth_tokens WHERE email = ? AND type = 'email_verify'`).run(
    email.toLowerCase(),
  );
  return row.user_id;
}

export function createPasswordResetCode(userId: string, email: string): string {
  const code = generateSixDigitCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  db.prepare(`DELETE FROM auth_tokens WHERE email = ? AND type = 'password_reset'`).run(
    email.toLowerCase(),
  );

  db.prepare(
    `INSERT INTO auth_tokens (id, user_id, email, token_hash, type, expires_at)
     VALUES (?, ?, ?, ?, 'password_reset', ?)`,
  ).run(crypto.randomUUID(), userId, email.toLowerCase(), hashToken(code), expiresAt);

  return code;
}

export function verifyPasswordResetCode(email: string, code: string): string | null {
  const row = db
    .prepare(
      `SELECT user_id, token_hash, expires_at
       FROM auth_tokens
       WHERE email = ? AND type = 'password_reset'
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(email.toLowerCase()) as
    | { user_id: string; token_hash: string; expires_at: string }
    | undefined;

  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) return null;
  if (hashToken(code) !== row.token_hash) return null;

  db.prepare(`DELETE FROM auth_tokens WHERE email = ? AND type = 'password_reset'`).run(
    email.toLowerCase(),
  );
  return row.user_id;
}

export function createRefreshToken(userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(
    `INSERT INTO auth_tokens (id, user_id, token_hash, type, expires_at)
     VALUES (?, ?, ?, 'refresh', ?)`,
  ).run(crypto.randomUUID(), userId, hashToken(token), expiresAt);

  return token;
}

export function verifyRefreshToken(token: string): string | null {
  const hash = hashToken(token);
  const row = db
    .prepare(
      `SELECT user_id, expires_at FROM auth_tokens WHERE token_hash = ? AND type = 'refresh'`,
    )
    .get(hash) as { user_id: string; expires_at: string } | undefined;

  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    revokeRefreshToken(token);
    return null;
  }
  return row.user_id;
}

export function revokeRefreshToken(token: string): void {
  db.prepare(`DELETE FROM auth_tokens WHERE token_hash = ? AND type = 'refresh'`).run(
    hashToken(token),
  );
}

export function revokeAllRefreshTokens(userId: string): void {
  db.prepare(`DELETE FROM auth_tokens WHERE user_id = ? AND type = 'refresh'`).run(userId);
}

/** Permanently removes the user and all associated wellness data. */
export function deleteUserAccount(userId: string): boolean {
  const user = getUser(userId);
  if (!user) return false;

  const run = db.transaction(() => {
    db.prepare(`DELETE FROM conversations WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM moods WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM goals WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM gratitude_entries WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM journal_entries WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM companion_check_in_cache WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM companion_memory WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM auth_tokens WHERE user_id = ?`).run(userId);
    if (user.email) {
      db.prepare(`DELETE FROM auth_tokens WHERE lower(email) = lower(?)`).run(user.email);
    }
    db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
  });

  run();
  return true;
}

export function linkGoogleId(userId: string, googleId: string): void {
  db.prepare(
    `UPDATE users
     SET google_id = ?,
         auth_provider = 'google',
         email_verified_at = COALESCE(email_verified_at, datetime('now')),
         updated_at = datetime('now')
     WHERE id = ?`,
  ).run(googleId, userId);
}
