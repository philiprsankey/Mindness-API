import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH ?? path.join(__dirname, '..', 'mindness.db');
const db = new Database(dbPath);

db.exec(`
  DELETE FROM messages;
  DELETE FROM conversations;
  DELETE FROM goal_completions;
  DELETE FROM goals;
  DELETE FROM moods;
  DELETE FROM gratitude_entries;
  DELETE FROM journal_entries;
  DELETE FROM companion_check_in_cache;
  DELETE FROM companion_memory;
  DELETE FROM auth_tokens;
  DELETE FROM users;
`);

const tables = [
  'users',
  'conversations',
  'messages',
  'moods',
  'goals',
  'goal_completions',
  'gratitude_entries',
  'journal_entries',
  'companion_memory',
  'companion_check_in_cache',
  'auth_tokens',
];

for (const table of tables) {
  const { c } = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get();
  console.log(`${table}: ${c}`);
}

console.log('Done — database reset for fresh auth.');
