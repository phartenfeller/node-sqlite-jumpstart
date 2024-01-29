# node-sqlite-jumpstart

This is a small class I wrote for myself to get SQLite3 up and running faster in Node projects.

Features:

- APIs for common used default functionalities 
- Handle DB Migrations / Patches with backups
- Readonly and writeble DBs
- Typed

Examples of how to use the class are in the [test folder](https://github.com/phartenfeller/node-sqlite-jumpstart/tree/main/test).

**This is a pretty early stage project. Consider the API unstable!**

## How to use

Install:

```bash
npm i sqlite-jumpstart
```


```ts
import SQLiteDb, { type SQLiteDbPatchType } from 'sqlite-jumpstart';

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

// Create a new class that extends SQLiteDb
class newDb extends SQLiteDb {
  constructor() {
    super({
      dbPath,
      readonly: false,
      patches: patches,
      logInfos: false,
      logErrors: true,
    });
  }

  // create your own APIs that extend the base functions
  addMultipleMessages(values: MessageType[]) {
    const stmnt = `
    insert into messages
      (id, text)
    values
      (:id, :text)
    ;
  `;
    // use the transactionalPreparedStatement to do multiple inserts in one transaction
    this.transactionalPreparedStatement(stmnt, values);
  }

  getMessageCount() {
    const stmnt = `
    select count(*) as cnt from messages
  `;
    const row = this.queryRow(stmnt);
    return row.cnt;
  }

  // use the queryRow function to get a single row
  getTextFromId(id: number) {
    const stmnt = `
    select text from messages where id = $id
  `;
    const row = this.queryRow(stmnt, { id } as any);
    return row.text;
  }
}

// init the DB
const db = new newDb();
await db.initDb();

const messages: MessageType[] = [
  { id: 1, text: 'Hello' },
  { id: 2, text: 'World' },
  { id: 3, text: 'I' },
  { id: 4, text: 'Like' },
  { id: 5, text: 'Tests' },
];

// use your own APIs
// note that the functions are synchronous
db.addMultipleMessages(messages);

const count = db.getMessageCount();
expect(count).toBe(5);

const text = db.getTextFromId(4);
expect(text).toBe('Like');

db.closeDb();
```

## Constructor Params

```ts
type SQLiteDbConstructor = {
  dbPath: string; // path to the DB file
  readonly?: boolean; // if true, an exisiting DB will be opened readonly
  patches?: SQLiteDbPatchType[]; // patches to apply to the DB
  backupPath?: string; // path where the DB backups are stored
  logInfos?: boolean; // if true, log infos to the console
  logErrors?: boolean; // if true, log errors to the console
  pragmas?: string[]; // pragmas to set on the DB (overwrites defaults)
};
```

### Patches

Patches allow you to apply changes to an existing DB. The class will check the current DB version and apply the patches if needed. The class will also create backups of the DB before applying the patches.

```ts
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
  {
    version: 2,
    statements: [
      `alter table messages add create_date integer;`,
      `create table test1234(id integer);`,
    ],
  }
];
```

### Pragmas

I set following default pragmas for writable DBs based on [this blog post](https://cj.rs/blog/sqlite-pragma-cheatsheet-for-performance-and-consistency/).

```txt
PRAGMA journal_mode = wal; -- different implementation of the atomicity properties
PRAGMA synchronous = normal; -- synchronise less often to the filesystem
PRAGMA foreign_keys = on; -- check foreign key reference, slightly worst performance
```

Additionally I run these optimizations:

```txt
PRAGMA analysis_limit=400; -- make sure pragma optimize does not take too long
PRAGMA optimize; -- gather statistics to improve query optimization
PRAGMA vacuum; -- reorganize the database file to reclaim unused space
```

For **read only** DBs I set following pragmas:

```txt
PRAGMA cache_size=-640000;
PRAGMA journal_mode=OFF;
```

If you don't like these you can **overwrite** them with the `pragmas` array parameter in the constructor.

[SQlite Pragmas](https://www.sqlite.org/pragma.html)

## Base Functions

- `runStatement` executes a single statement
- `insertRow`, `updateRow`, `delteRow` run a single statement with a descriptive function name
- `transactionalPreparedStatement` executes a prepared statement in a single transaction for multiple inputs
- `queryRow` returns a single row
- `queryRows`  returns a multiple rows
- `closeDb` closes the DB connection
