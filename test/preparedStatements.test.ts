import SQLiteDb, { SQLiteDbPatchType } from '../index';
import { getNewDbPath } from './utils/getDbPath';
import { unlinkSync } from 'fs';

type MessageType = {
  id: number;
  text: string;
};

describe('preparedStatements', () => {
  test('success => commit', async () => {
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
          patches: patches,
          log: false,
        });
      }

      addMultipleMessages(values: MessageType[]) {
        const stmnt = `
        insert into messages
          (id, text)
        values
          (:id, :text)
        ;
      `;

        this.transactionalPreparedStatement(stmnt, values);
      }

      getMessageCount() {
        const stmnt = `
        select count(*) as cnt from messages
      `;

        const row = this.queryRow(stmnt);
        return row.cnt;
      }

      getTextFromId(id: number) {
        const stmnt = `
        select text from messages where id = $id
      `;

        const row = this.queryRow(stmnt, { id } as any);
        return row.text;
      }
    }

    const db = new newDb();
    await db.initDb();

    const messages: MessageType[] = [
      { id: 1, text: 'Hello' },
      { id: 2, text: 'World' },
      { id: 3, text: 'I' },
      { id: 4, text: 'Like' },
      { id: 5, text: 'Tests' },
    ];

    db.addMultipleMessages(messages);

    const count = db.getMessageCount();
    expect(count).toBe(5);

    const text = db.getTextFromId(4);
    expect(text).toBe('Like');

    db.closeDb();
    unlinkSync(dbPath);
  });

  test('fail => rollback', async () => {
    const dbPath = getNewDbPath();

    const patches: SQLiteDbPatchType[] = [
      {
        version: 1,
        statements: [
          `create table messages (
           id   integer primary key,
           text text not null
         );`,
        ],
      },
    ];

    class newDb extends SQLiteDb {
      constructor() {
        super({
          dbPath,
          readonly: false,
          patches: patches,
          log: false,
        });
      }

      addMultipleMessages(values: MessageType[]) {
        try {
          const stmnt = `
        insert into messages
          (id, text)
        values
          ($id, $text)
        ;
      `;

          this.transactionalPreparedStatement(stmnt, values);
        } catch (e) {
          throw new Error('YES FAILED');
        }
      }

      getMessageCount() {
        const stmnt = `
        select count(*) as cnt from messages
      `;

        const row = this.queryRow(stmnt);
        return row.cnt;
      }

      getTextFromId(id: number) {
        const stmnt = `
        select text from messages where id = $id
      `;

        const row = this.queryRow(stmnt, { id } as any);
        return row.text;
      }
    }

    const db = new newDb();
    await db.initDb();

    const messages: any = [
      { id: 1, text: 'Hello' },
      { id: 2, text: 'World' },
      { id: 3, text: 'I' },
      { id: 4, text: 'Like' },
      { id: 5, text: null },
    ];

    const runInsert = () => {
      db.addMultipleMessages(messages);
    };

    expect(runInsert).toThrow('YES FAILED');

    const count = db.getMessageCount();
    expect(count).toBe(0);

    db.closeDb();
    unlinkSync(dbPath);
  });
});
