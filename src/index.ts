import fs from 'fs';
import path from 'path';
import { Database, OPEN_CREATE, OPEN_READONLY, OPEN_READWRITE } from 'sqlite3';
import { createBackup, removeBackup } from './backupDb';
import os from 'os';

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

export type SQLiteDbPatchType = {
  version: number;
  statements: string[];
};

export type SQLiteDbConstructor = {
  dbPath: string;
  readonly?: boolean;
  patches?: SQLiteDbPatchType[];
  backupPath?: string;
  log?: boolean;
};

class SQLiteDb {
  private db: Database;
  private dbPath: string;
  private readonly: boolean;
  private patches: SQLiteDbPatchType[] | undefined;
  private backupPath: string;
  private log: boolean;

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

  setPragma(statement) {
    this.logMessage('Setting => ', statement.replace(/PRAGMA /i, ''));

    try {
      return new Promise((resolve, reject) => {
        this.db.run(statement, [], (err, result) => {
          if (err) {
            this.logError(`Error in setPragma callback => ${err}`);
            reject(err);
          }
          resolve(result);
        });
      });
    } catch (err) {
      this.logError(`Error in setPragma => ${err}`);
      throw err;
    }
  }

  runStatement(statement, values: any[] = []) {
    try {
      return new Promise((resolve, reject) => {
        if (this.readonly) {
          reject(`Cannot run statemetn in readonly mode`);
        }

        this.db.run(statement, values, (err, result) => {
          if (err) {
            this.logError(err, 'runStatement => res');
            reject(err);
          }
          resolve(result);
        });
      });
    } catch (err) {
      this.logError(err, 'runStatement');
      throw err;
    }
  }

  private initDbConn() {
    return new Promise((resolve, reject) => {
      const p = path.resolve(this.dbPath);

      const exists = fs.existsSync(p);

      if (this.readonly && !exists) {
        reject(`DB with readonly option does not exist yet! (${this.dbPath})`);
      }

      const mode = this.readonly ? OPEN_READONLY : OPEN_READWRITE | OPEN_CREATE;

      const mydb = new Database(p, mode, (err) => {
        if (err) {
          this.logError(`Error from call "new Database" => ${err.message}`);
          this.logError(`Db Parameters: path => "${p}", mode = "${mode}"`);
          reject(err);
        } else {
          this.db = mydb;
          this.logMessage(
            `Successful connection to the database '${this.dbPath}'`
          );
          resolve(exists);
        }
      });
    });
  }

  insertRow(stmnt: string, values: any[] = []): Promise<number> {
    return new Promise((resolve, reject) => {
      if (this.readonly) {
        reject(`Cannot insert row in readonly mode`);
      }

      this.db.run(stmnt, values, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  queryRow(query: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.get(query, params, (err, row) => {
        if (err) {
          reject(err);
        }
        resolve(row);
      });
    });
  }

  private async setDbVersion(version: number) {
    if (this.readonly) {
      throw new Error(`Cannot set DB patch version in readonly mode`);
    }

    try {
      await this.insertRow(INSERT_DB_VERSION, [version]);
      this.logMessage(`├  Successfully updated DB to version "${version}"`);
    } catch (err) {
      this.logMessage(`Could set new Db version => "${version}"`);
      throw err;
    }
  }

  async getPatchVersion(): Promise<number> {
    try {
      const row = await this.queryRow(QUERY_DB_VERSION_TABLE_EXISTS);
      if (row.cnt > 0) {
        const row2 = await this.queryRow(QUERY_MAX_DB_VERSION);
        return parseInt(row2.max);
      } else {
        // crate table and set version to 0
        const initVersion = 0;
        await this.runStatement(TAB_DB_VERSION);
        await this.setDbVersion(initVersion);
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
      const version = await this.getPatchVersion();

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

  async initDb() {
    try {
      await this.initDbConn();

      if (this.readonly) {
        await this.setPragma('PRAGMA cache_size=-640000');
        await this.setPragma('PRAGMA journal_mode=OFF');
      } else {
        await this.setPragma('PRAGMA synchronous=OFF');
        await this.setPragma('PRAGMA count_changes=OFF');
        await this.setPragma('PRAGMA journal_mode=MEMORY');
        await this.setPragma('PRAGMA temp_store=MEMORY');
        await this.setPragma('PRAGMA cache_size=-640000');
        await this.setPragma('PRAGMA foreign_keys=ON');
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

  closeDb() {
    return new Promise((resolve, reject) => {
      try {
        this.db.close((err) => {
          if (err) {
            this.logError(`could not close db`, err);
            reject(err);
          }
          resolve(1);
        });
      } catch (err) {
        this.logError(`could not close db`, err);
        reject(err);
      }
    });
  }
}

export default SQLiteDb;
