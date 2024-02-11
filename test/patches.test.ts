import { SQLiteDb, type SQLiteDbPatchType } from '../index';
import { getNewDbPath } from './utils/getDbPath';
import { unlinkSync } from 'fs';

test('patches', async () => {
  const dbPath = getNewDbPath();

  const patches1: SQLiteDbPatchType[] = [
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
        patches: patches1,
        logInfos: false,
        logErrors: false,
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
  const count1 = db.getMessageCount();
  expect(count1).toBe(1);

  db.closeDb();

  const patches2 = patches1;
  patches2.push({
    version: 2,
    statements: [
      `alter table messages add create_date integer;`,
      `create table test1234(id integer);`,
    ],
  });

  class newDbV2 extends SQLiteDb {
    private counter = 999999;

    constructor() {
      super({
        dbPath,
        readonly: false,
        patches: patches2,
        logInfos: false,
        logErrors: false,
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

    getTest1234Count() {
      const stmnt = `
        select count(*) as cnt from test1234
      `;

      const row = this.queryRow(stmnt);
      return row.cnt;
    }
  }

  const dbV2 = new newDbV2();
  await dbV2.initDb();

  dbV2.addMessage('Hello2');
  const count = dbV2.getMessageCount();
  expect(count).toBe(2);

  const count2 = dbV2.getTest1234Count();
  expect(count2).toBe(0);

  dbV2.closeDb();
  unlinkSync(dbPath);
});
