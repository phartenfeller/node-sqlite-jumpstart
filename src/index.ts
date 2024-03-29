import fs, { stat } from 'fs';
import path from 'path';
import BetterSqlite3 from 'better-sqlite3';
import { createBackup, removeBackup } from './backupDb';
import os from 'os';
import {
  SQLiteDbConstructor,
  SQLiteDbPatchType,
  RowObj,
  DBParams,
} from './types';

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

type DbStatus = 'uninitiliazed' | 'initializing' | 'ready' | 'closed';

export class SQLiteDb {
  private db: BetterSqlite3.Database;
  private dbPath: string;
  private readonly: boolean;
  private patches: SQLiteDbPatchType[] | undefined;
  private backupPath: string;
  private logInfos: boolean;
  private logErrors: boolean;
  private pragmas: string[];
  private status: DbStatus = 'uninitiliazed';

  private initDbConn() {
    const p = path.resolve(this.dbPath);
    const exists = fs.existsSync(p);

    if (this.readonly && !exists) {
      throw new Error(
        `DB with readonly option does not exist yet! (${this.dbPath})`,
      );
    }

    this.db = new BetterSqlite3(p, { readonly: this.readonly });
  }

  constructor({
    dbPath,
    readonly = true,
    patches,
    backupPath = os.tmpdir(),
    logInfos = false,
    logErrors = true,
    pragmas = [],
  }: SQLiteDbConstructor) {
    this.dbPath = dbPath;
    this.readonly = readonly;
    this.backupPath = backupPath;
    this.logInfos = logInfos;
    this.logErrors = logErrors;
    this.pragmas = pragmas;

    if (readonly === true && patches) {
      this.patches = undefined;
      console.log('No patches possible for read only');
    } else {
      this.patches = patches;
    }
  }

  async optimize() {
    // https://cj.rs/blog/sqlite-pragma-cheatsheet-for-performance-and-consistency/
    this.db.pragma('analysis_limit=400'); // make sure pragma optimize does not take too long
    this.db.pragma('optimize'); // gather statistics to improve query optimization
    this.db.pragma('vacuum'); // remove unused space
  }

  async initDb() {
    this.status = 'initializing';
    try {
      this.initDbConn();

      if (this.pragmas.length > 0) {
        this.pragmas.forEach((p) => {
          this.logMessage(`Setting pragma: "${p}"`);
          try {
            const res = this.db.pragma(p);
            this.logMessage(`Pragma result`, JSON.stringify(res, null, 2));
          } catch (err) {
            this.logError(`could not set pragma "${p}"`, err);
          }
        });
      } else {
        if (this.readonly) {
          this.db.pragma('cache_size=-640000');
          this.db.pragma('journal_mode=OFF');
        } else {
          this.db.pragma('journal_mode=WAL');
          this.db.pragma('synchronous=normal');
          this.db.pragma('foreign_keys=ON');
        }
      }

      if (this.patches) {
        await this.checkPatches();
      }

      this.status = 'ready';
      this.logMessage('Db is ready!');
    } catch (err) {
      this.logError(`could not setup db`, err);
      throw err;
    }
  }

  private logMessage(...args) {
    if (this.logInfos) {
      console.log(...args);
    }
  }

  private logError(...args) {
    if (this.logErrors) {
      console.error(...args);
    }
  }

  private checkStatus() {
    switch (this.status) {
      case 'uninitiliazed':
        throw new Error(`DB not initialized. Call initDb() first`);
      case 'initializing':
        throw new Error(`DB is still initializing... please wait until ready`);
      case 'closed':
        throw new Error(`DB is closed... cannot run any operations`);
    }
  }

  runStatement(statement, values?: DBParams) {
    try {
      this.checkStatus();
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
      this.checkStatus();
      return this.runStatement(stmnt, values ?? []);
    } catch (err) {
      this.logError(err, 'insertRow');
      throw err;
    }
  }

  updateRow(stmnt: string, values: DBParams) {
    try {
      this.checkStatus();
      return this.runStatement(stmnt, values ?? []);
    } catch (err) {
      this.logError(err, 'updateRow');
      throw err;
    }
  }

  deleteRow(stmnt: string, values: DBParams) {
    try {
      this.checkStatus();
      return this.runStatement(stmnt, values ?? []);
    } catch (err) {
      this.logError(err, 'deleteRow');
      throw err;
    }
  }

  transactionalPreparedStatement(statement: string, params: DBParams[]) {
    if (this.readonly) {
      throw new Error(`Cannot modify data in readonly mode`);
    }

    try {
      this.checkStatus();
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

  // does not call checkStatus for internal use while initializing
  private queryRowInternal(query: string, params?: DBParams): RowObj {
    try {
      const stmnt = this.db.prepare(query);
      const row = stmnt.get(params ?? []) as RowObj;
      return row;
    } catch (err) {
      this.logError(err, 'queryRow');
      throw err;
    }
  }

  queryRow(query: string, params?: DBParams): RowObj {
    try {
      this.checkStatus();
      const stmnt = this.db.prepare(query);
      const row = stmnt.get(params ?? []) as RowObj;
      return row;
    } catch (err) {
      this.logError(err, 'queryRow');
      throw err;
    }
  }

  queryRows(query: string, params?: DBParams): RowObj[] {
    try {
      this.checkStatus();
      const stmnt = this.db.prepare(query);
      const rows = stmnt.all(params ?? []) as RowObj[];
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
      const st = this.db.prepare(INSERT_DB_VERSION);
      st.run(version);
      this.logMessage(`├  Successfully updated DB to version "${version}"`);
    } catch (err) {
      this.logMessage(`Could set new Db version => "${version}"`);
      throw err;
    }
  }

  getPatchVersion(): number {
    try {
      const row = this.queryRowInternal(QUERY_DB_VERSION_TABLE_EXISTS);
      if ((row.cnt as number) > 0) {
        const row2 = this.queryRowInternal(QUERY_MAX_DB_VERSION);
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

      if (version !== 0) {
        backupPath = await createBackup(this.dbPath, this.backupPath);
      }

      for (let migration of applyablePatches) {
        try {
          if (migration.version > version) {
            this.logMessage(`┌  Patching Database to "${migration.version}"`);

            for (let statement of migration.statements) {
              this.logMessage(
                `├  Applying patch => ${statement.replace(/\n/g, '')}`,
              );
              const st = this.db.prepare(statement);
              st.run();
            }

            await this.setDbVersion(migration.version);

            this.logMessage(
              `└  Finished patching Database to "${migration.version}"`,
            );
          }
        } catch (err) {
          this.logError(
            `Filed while patching database to version ${migration.version}: ${err}`,
          );
          throw err;
        }
      }

      if (backupPath) {
        await removeBackup(backupPath);
      }
    } catch (err) {
      this.logError(`Error in checkPatches => ${err}`);
      if (backupPath) {
        this.logMessage(
          `Check backup of version before patch at => ${backupPath}`,
        );
      }

      throw err;
    }
  }

  closeDb() {
    this.status = 'closed';
    this.db.close();
  }
}
