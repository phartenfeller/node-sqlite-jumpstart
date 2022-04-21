import { copyFile, unlink } from 'fs/promises';
import path from 'path';

export async function createBackup(dbPath: string, backupPath: string) {
  try {
    const bkpFilename = `bkp-${new Date().getTime()}.sqlite`;

    const bkpFolderRes = path.resolve(backupPath);
    const bkpPathRes = `${bkpFolderRes}/${bkpFilename}`;

    const dbPathRes = path.resolve(dbPath);

    await copyFile(dbPathRes, bkpPathRes);
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
