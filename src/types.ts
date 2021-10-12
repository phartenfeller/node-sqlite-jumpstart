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
export type DBTypes = string | number | BigInt | Buffer | null;
export type DBTypesAny = DBTypes | any;
export type DBTypesObject = {
  [key: string]: DBTypesAny;
};
export type DBParams = DBTypesAny[] | DBTypesObject;
export interface RowObj {
  [key: string]: DBTypes;
}
