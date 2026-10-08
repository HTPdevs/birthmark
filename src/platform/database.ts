import * as SQLite from 'expo-sqlite';

import { type Db, migrate } from '../storage/db';
import { excludeFromBackup } from './clock';

let opening: Promise<Db> | null = null;

/** Opens, configures, and migrates the single app database once per process. */
export function getDatabase(): Promise<Db> {
  if (!opening) {
    opening = (async () => {
      const native = await SQLite.openDatabaseAsync('birthmark.db');
      const db: Db = {
        execAsync: (sql) => native.execAsync(sql),
        runAsync: (sql, params) => native.runAsync(sql, params),
        getAllAsync: (sql, params) => native.getAllAsync(sql, params),
        getFirstAsync: (sql, params) => native.getFirstAsync(sql, params),
        withTransactionAsync: (task) => native.withTransactionAsync(task),
      };
      await migrate(db);
      // Session data stays on this device: keep the database directory (including
      // WAL files) out of iCloud/iTunes backups. Android disables backup in app.json.
      const dir = native.databasePath.replace(/\/[^/]+$/, '');
      excludeFromBackup(dir);
      return db;
    })().catch((e) => {
      opening = null;
      throw e;
    });
  }
  return opening;
}
