import { getNewDbPath } from './utils/getDbPath';
import { unlinkSync } from 'fs';
import SQLiteDb, { SQLiteDbPatchType } from '../index';

test('text version', async () => {
  const dbPath = getNewDbPath();

  const patches: SQLiteDbPatchType[] = [
    {
      version: 1,
      statements: [
        `create table messages (
           id   integer primary key,
           text text
         );`,
      ],
    },
  ];

  class newDb extends SQLiteDb {
    constructor() {
      super({
        dbPath,
        readonly: false,
        patches,
        logInfos: false,
        logErrors: false,
      });
    }

    getSQLiteVersion(): string {
      const stmnt = `
        select sqlite_version() as version;
      `;
      const row = this.queryRow(stmnt);
      return row.version as string;
    }
  }

  const db = new newDb();
  await db.initDb();

  const v = db.getSQLiteVersion();
  console.log('Current SQLite Version =>', v);
  expect(v.split('.')[0]).toBe('3');
});
