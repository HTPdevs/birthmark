export type BindValue = string | number | null;

/**
 * The subset of expo-sqlite's SQLiteDatabase the app uses. Tests provide the
 * same surface over better-sqlite3 so repository code runs against real SQLite.
 */
export interface Db {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: BindValue[]): Promise<{ changes: number }>;
  getAllAsync<T>(source: string, params: BindValue[]): Promise<T[]>;
  getFirstAsync<T>(source: string, params: BindValue[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

const MIGRATIONS: string[] = [
  // v1
  `
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY NOT NULL,
    short_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'finished')),
    started_snapshot TEXT NOT NULL,
    finish_snapshot TEXT,
    finish_elapsed_ms INTEGER,
    anchor TEXT NOT NULL,
    checkpoint TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    schema_version INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX sessions_one_active ON sessions (status) WHERE status = 'active';

  CREATE TABLE events (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    label TEXT,
    start_moment_id TEXT NOT NULL,
    end_moment_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('active', 'ended')),
    ended_by_session_finish INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX events_session ON events (session_id);

  CREATE TABLE moments (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    event_id TEXT REFERENCES events (id) ON DELETE CASCADE,
    capture_sequence INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('capture', 'milestone', 'event_start', 'event_end', 'finish', 'resume')),
    moment_number INTEGER,
    snapshot TEXT,
    original_elapsed_ms INTEGER,
    effective_wall_ms INTEGER,
    effective_elapsed_ms INTEGER,
    label TEXT,
    source TEXT NOT NULL CHECK (source IN ('captured', 'manual', 'corrected')),
    flagged_accidental INTEGER NOT NULL DEFAULT 0,
    milestone_code TEXT,
    timing_estimated INTEGER NOT NULL DEFAULT 0,
    UNIQUE (session_id, capture_sequence)
  );
  CREATE INDEX moments_session ON moments (session_id);

  CREATE TABLE assessments (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    assessment_point TEXT NOT NULL CHECK (assessment_point IN ('one_minute', 'five_minute')),
    score INTEGER NOT NULL CHECK (typeof(score) = 'integer' AND score BETWEEN 0 AND 10),
    UNIQUE (session_id, assessment_point)
  );

  CREATE TABLE revisions (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    moment_id TEXT,
    assessment_id TEXT,
    event_id TEXT,
    action TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    reason TEXT,
    changed_at INTEGER NOT NULL,
    revision_number INTEGER NOT NULL
  );
  CREATE INDEX revisions_session ON revisions (session_id);

  CREATE TABLE timing_flags (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    moment_id TEXT,
    type TEXT NOT NULL,
    from_elapsed_ms INTEGER,
    to_elapsed_ms INTEGER,
    wall_delta_ms INTEGER,
    continuous_delta_ms INTEGER,
    detail TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX timing_flags_session ON timing_flags (session_id);

  CREATE TABLE exports (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    revision_number INTEGER NOT NULL,
    generated_at INTEGER NOT NULL,
    cached_file_path TEXT
  );

  CREATE TABLE prefs (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrate(db: Db): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    const next = version + 1;
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
      await db.execAsync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
}
