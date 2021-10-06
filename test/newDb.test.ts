import SQLiteDb, { PatchType } from '../src';
import { getNewDbPath } from './utils/getDbPath';
import { unlinkSync } from 'fs';

test('new DB', async () => {
  const dbPath = getNewDbPath();

  const patches: PatchType[] = [
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

    async addMessage(text: string) {
      const stmnt = `
        insert into messages
          (id, text)
        values
          (?, ?)
        ;
      `;

      this.counter++;
      await this.insertRow(stmnt, [this.counter, text]);
    }

    async getMessageCount() {
      const stmnt = `
        select count(*) as cnt from messages
      `;

      const row = await this.queryRow(stmnt);
      return row.cnt;
    }
  }

  const db = new newDb();
  await db.initDb();

  await db.addMessage('Hello');
  const count = await db.getMessageCount();
  expect(count).toBe(1);

  await db.addMessage('Hello2');
  const count2 = await db.getMessageCount();
  expect(count2).toBe(2);

  unlinkSync(dbPath);
});
