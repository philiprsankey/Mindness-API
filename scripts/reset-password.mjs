import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const email = process.argv[2];
const newPassword = process.argv[3];

if (!email || !newPassword) {
  console.error('Usage: node scripts/reset-password.mjs <email> <new-password>');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH ?? path.join(__dirname, '..', 'mindness.db');
const db = new Database(dbPath);

const user = db
  .prepare('SELECT id, email FROM users WHERE lower(email) = lower(?)')
  .get(email);

if (!user) {
  console.error('No user found for:', email);
  process.exit(1);
}

const hash = bcrypt.hashSync(newPassword, 12);
db.prepare(
  "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?",
).run(hash, user.id);

const verified = bcrypt.compareSync(newPassword, hash);
console.log('Password reset for:', user.email);
console.log('User ID:', user.id);
console.log('Hash verified:', verified);

db.close();
