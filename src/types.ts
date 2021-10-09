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
