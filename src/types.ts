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

// types from: https://github.com/JoshuaWise/better-sqlite3/blob/master/docs/api.md#binding-parameters
export interface RowObj {
  [key: string]: string | number | BigInt | Buffer | null;
}
