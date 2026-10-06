// T5.1 service regression harness: real SQLite, all production migrations and triggers.
// This verifies SQL semantics; Wrangler/D1 HTTP acceptance is recorded separately.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function createDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  const dir = fileURLToPath(new URL('../../../db/migrations/', import.meta.url));
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(`${dir}/${file}`, 'utf8'));
  }
  function prepare(sql) {
    let args = [];
    const statement = {
      bind(...values) { args = values; return statement; },
      async first(column) {
        const row = sqlite.prepare(sql).get(...args) ?? null;
        return column && row ? row[column] : row;
      },
      async all() { return { results: sqlite.prepare(sql).all(...args), success: true }; },
      async run() {
        const r = sqlite.prepare(sql).run(...args);
        return { meta: { changes: Number(r.changes) }, success: true };
      },
    };
    return statement;
  }
  return {
    sqlite, prepare,
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
    close() { sqlite.close(); },
  };
}
