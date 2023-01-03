import SQLiteDb, { SQLiteDbPatchType } from '../index';
import { getNewDbPath } from './utils/getDbPath';
import { unlinkSync } from 'fs';

type PragmaResult = {
  journal_mode: string;
};

class newDb extends SQLiteDb {
  constructor(dbPath: string, pragmas: string[] = []) {
    super({
      dbPath,
      readonly: false,
      log: false,
      pragmas,
    });
  }

  getPragmaMode(): PragmaResult {
    const stmnt = `
      pragma journal_mode;
    `;
    const res = this.queryRow(stmnt);
    return res as PragmaResult;
  }
}

test('standard journal_mode', async () => {
  const dbPath = getNewDbPath();
  const db = new newDb(dbPath);
  await db.initDb();

  const res = db.getPragmaMode();
  expect(res.journal_mode).toBe('memory');

  db.closeDb();
  unlinkSync(dbPath);
});

test('custom journal_mode', async () => {
  const dbPath = getNewDbPath();
  const db = new newDb(dbPath, ['journal_mode=WAL']);
  await db.initDb();

  const res = db.getPragmaMode();
  expect(res.journal_mode).toBe('wal');

  db.closeDb();
  unlinkSync(dbPath);
});
