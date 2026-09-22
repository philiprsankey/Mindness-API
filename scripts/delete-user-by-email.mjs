import Database from 'better-sqlite3';

const email = process.argv[2]?.trim();
if (!email) {
  console.error('Usage: node scripts/delete-user-by-email.mjs <email>');
  process.exit(1);
}

const dbPath = process.env.DATABASE_PATH ?? '/data/mindness.db';
const db = new Database(dbPath);

const user = db
  .prepare(`SELECT id, email FROM users WHERE lower(email) = lower(?)`)
  .get(email);

if (!user) {
  console.log(`No user found for: ${email}`);
  process.exit(0);
}

const userId = user.id;

const run = db.transaction(() => {
  db.prepare(`DELETE FROM conversations WHERE user_id = ?`).run(userId);
  db.prepare(`DELETE FROM moods WHERE user_id = ?`).run(userId);
  db.prepare(`DELETE FROM goals WHERE user_id = ?`).run(userId);
  db.prepare(`DELETE FROM gratitude_entries WHERE user_id = ?`).run(userId);
  db.prepare(`DELETE FROM journal_entries WHERE user_id = ?`).run(userId);
  db.prepare(`DELETE FROM companion_check_in_cache WHERE user_id = ?`).run(userId);
  db.prepare(`DELETE FROM companion_memory WHERE user_id = ?`).run(userId);
  db.prepare(`DELETE FROM auth_tokens WHERE user_id = ?`).run(userId);
  db.prepare(`DELETE FROM auth_tokens WHERE lower(email) = lower(?)`).run(email);
  db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
});

run();
console.log(`Deleted user ${userId} (${user.email}) and related data.`);
