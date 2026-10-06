import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openSourceDatabase(file: string): DatabaseSync {
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}

export function applyMigrations(db: DatabaseSync, migrationsDir: string): string[] {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migration (name TEXT PRIMARY KEY, applied_ms INTEGER NOT NULL)'
  );
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const applied: string[] = [];
  for (const f of files) {
    const row = db.prepare('SELECT name FROM schema_migration WHERE name = ?').get(f);
    if (row) continue;
    const sql = readFileSync(path.join(migrationsDir, f), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migration (name, applied_ms) VALUES (?, ?)').run(f, Date.now());
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    applied.push(f);
  }
  return applied;
}
