import fs from 'fs';
import path from 'path';
import BetterSqlite3 from 'better-sqlite3';
import { createBackup, removeBackup } from './backupDb';
import os from 'os';
import { SQLiteDbConstructor, SQLiteDbPatchType, RowObj } from './types';
import { DBParams } from 'index';

const QUERY_DB_VERSION_TABLE_EXISTS = `
select count(*) as cnt from sqlite_master where type = 'table' and lower(name) = 'db_version'`;

const TAB_DB_VERSION = `
create table db_version (
  version    real
, installed  real
, primary key (version)
);
`;

const INSERT_DB_VERSION = `
insert into db_version
(version, installed)
values
(?, strftime('%s','now') * 1000);
`;

const QUERY_MAX_DB_VERSION = `
select max(version) as max
  from db_version;
`;

class SQLiteDb {
  private db: BetterSqlite3.Database;
  private dbPath: string;
  private readonly: boolean;
  private patches: SQLiteDbPatchType[] | undefined;
  private backupPath: string;
  private log: boolean;

  private initDbConn() {
    const p = path.resolve(this.dbPath);
    const exists = fs.existsSync(p);

    if (this.readonly && !exists) {
      throw new Error(
        `DB with readonly option does not exist yet! (${this.dbPath})`
      );
    }

    this.db = new BetterSqlite3(p, { readonly: this.readonly });
  }

  constructor({
    dbPath,
    readonly = true,
    patches,
    backupPath = os.tmpdir(),
    log = true,
  }: SQLiteDbConstructor) {
    this.dbPath = dbPath;
    this.readonly = readonly;
    this.backupPath = backupPath;
    this.log = log;

    if (readonly === true && patches) {
      this.patches = undefined;
      console.log('No patches possible for read only');
    } else {
      this.patches = patches;
    }
  }

  async initDb() {
    try {
      this.initDbConn();

      if (this.readonly) {
        this.db.pragma('cache_size=-640000');
        this.db.pragma('journal_mode=OFF');
      } else {
        this.db.pragma('synchronous=OFF');
        this.db.pragma('count_changes=OFF');
        this.db.pragma('journal_mode=MEMORY');
        this.db.pragma('temp_store=MEMORY');
        this.db.pragma('cache_size=-640000');
        this.db.pragma('foreign_keys=ON');
      }

      if (this.patches) {
        await this.checkPatches();
      }

      this.logMessage('Db is ready!');
    } catch (err) {
      this.logError(`could not setup db`, err);
      throw err;
    }
  }

  private logMessage(...args) {
    if (this.log) {
      console.log(...args);
    }
  }

  private logError(...args) {
    if (this.log) {
      console.error(...args);
    }
  }

  runStatement(statement, values?: DBParams) {
    try {
      const st = this.db.prepare(statement);
      const info = st.run(values ?? []);
      return info;
    } catch (err) {
      this.logError(err, 'runStatement');
      throw err;
    }
  }

  insertRow(stmnt: string, values: DBParams) {
    try {
      return this.runStatement(stmnt, values ?? []);
    } catch (err) {
      this.logError(err, 'insertRow');
      throw err;
    }
  }

  transactionalPreparedStatement(statement: string, params: DBParams[]) {
    if (this.readonly) {
      throw new Error(`Cannot modify data in readonly mode`);
    }

    try {
      const st = this.db.prepare(statement);

      const transactionFc = this.db.transaction((params) => {
        for (const param of params) {
          st.run(param);
        }
      });

      transactionFc(params);
    } catch (err) {
      this.logError('Cannot run transactionalPreparedStatement =>', err);
      throw err;
    }
  }

  queryRow(query: string, params?: DBParams): RowObj {
    try {
      const stmnt = this.db.prepare(query);
      const row = stmnt.get(params ?? []);
      return row;
    } catch (err) {
      this.logError(err, 'queryRow');
      throw err;
    }
  }

  queryRows(query: string, params?: DBParams): RowObj[] {
    try {
      const stmnt = this.db.prepare(query);
      const rows = stmnt.all(params ?? []);
      return rows;
    } catch (err) {
      this.logError(err, 'queryRows');
      throw err;
    }
  }

  private setDbVersion(version: number) {
    if (this.readonly) {
      throw new Error(`Cannot set DB patch version in readonly mode`);
    }

    try {
      this.insertRow(INSERT_DB_VERSION, [version]);
      this.logMessage(`├  Successfully updated DB to version "${version}"`);
    } catch (err) {
      this.logMessage(`Could set new Db version => "${version}"`);
      throw err;
    }
  }

  getPatchVersion(): number {
    try {
      const row = this.queryRow(QUERY_DB_VERSION_TABLE_EXISTS);
      if ((row.cnt as number) > 0) {
        const row2 = this.queryRow(QUERY_MAX_DB_VERSION);
        return row2.max as number;
      } else {
        // crate table and set version to 0
        const initVersion = 0;
        this.db.exec(TAB_DB_VERSION);
        this.setDbVersion(initVersion);
        return initVersion;
      }
    } catch (err) {
      this.logError(`Could not get patch version`);
      throw err;
    }
  }

  private async checkPatches() {
    if (!this.patches) return;
    let backupPath: string = '';

    try {
      const version = this.getPatchVersion();

      const applyablePatches = this.patches
        ?.sort((a, b) => a.version - b.version)
        .filter((patch) => patch.version > version);

      if (applyablePatches.length === 0) {
        this.logMessage('No DB patches to apply.');
        return;
      }

      backupPath = await createBackup(this.dbPath, this.backupPath);

      for (let migration of applyablePatches) {
        try {
          if (migration.version > version) {
            this.logMessage(`┌  Patching Database to "${migration.version}"`);

            for (let statement of migration.statements) {
              this.logMessage(
                `├  Applying patch => ${statement.replace(/\n/g, '')}`
              );
              await this.runStatement(statement);
            }

            await this.setDbVersion(migration.version);

            this.logMessage(
              `└  Finished patching Database to "${migration.version}"`
            );
          }
        } catch (err) {
          this.logError(
            `Filed while patching database to version ${migration.version}: ${err}`
          );
          throw err;
        }
      }

      await removeBackup(backupPath);
    } catch (err) {
      this.logError(`Error in checkPatches => ${err}`);
      if (backupPath) {
        this.logMessage(
          `Check backup of version before patch at => ${backupPath}`
        );
      }

      throw err;
    }
  }

  closeDb() {
    this.db.close();
  }
}

export default SQLiteDb;
