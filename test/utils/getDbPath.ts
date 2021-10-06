import path from 'path';
import os from 'os';

export function getNewDbPath() {
  return path.join(os.tmpdir(), `test-db-${Date.now()}.sqlite`);
}
