import { getNewDbPath } from './utils/getDbPath';
import { unlinkSync } from 'fs';
import SQLiteDb, { SQLiteDbPatchType } from '../index';

test('new DB', async () => {
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
    private counter = 0;

    constructor() {
      super({
        dbPath,
        readonly: false,
        patches,
        log: false,
      });
    }

    addMessage(text: string) {
      const stmnt = `
        insert into messages
          (id, text)
        values
          (?, ?)
        ;
      `;

      this.counter++;
      this.insertRow(stmnt, [this.counter, text]);
    }

    getMessageCount() {
      const stmnt = `
        select count(*) as cnt from messages
      `;

      const row = this.queryRow(stmnt);
      return row.cnt;
    }
  }

  const db = new newDb();
  await db.initDb();

  db.addMessage('Hello');
  const count = db.getMessageCount();
  expect(count).toBe(1);

  db.addMessage('Hello2');
  const count2 = db.getMessageCount();
  expect(count2).toBe(2);

  db.closeDb();
  unlinkSync(dbPath);
});
