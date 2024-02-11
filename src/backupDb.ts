import { copyFile, unlink } from 'fs/promises';
import path from 'path';
import BetterSqlite3 from 'better-sqlite3';

export async function createBackup(dbPath: string, backupPath: string) {
  try {
    const bkpFolderRes = path.resolve(backupPath);
    const bkpFilename = `bkp-${new Date().getTime()}.sqlite`;
    const bkpPathRes = `${bkpFolderRes}/${bkpFilename}`;

    const conn = new BetterSqlite3(dbPath, { readonly: true });
    await conn.backup(bkpPathRes);

    return bkpPathRes;
  } catch (err) {
    console.error(`Could not create backup => ${err}`);
    throw err;
  }
}

export async function removeBackup(backupPath: string) {
  try {
    await unlink(backupPath);
  } catch (err) {
    console.error(`Could not remove backup (${backupPath}) => ${err}`);
    throw err;
  }
}
