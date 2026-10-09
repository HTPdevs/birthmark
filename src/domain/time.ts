import {
  type Checkpoint,
  type ClockAnchor,
  type ClockSnapshot,
  type ElapsedMs,
  type TimingFlagType,
  elapsedMs,
  wallMs,
} from './types';

/** Wall vs continuous drift beyond this creates a clock-change flag. */
export const CLOCK_CHANGE_THRESHOLD_MS = 2000;

export function anchorFromSnapshot(
  snapshot: ClockSnapshot,
  elapsedAt: ElapsedMs,
  estimated = false,
): ClockAnchor {
  return {
    estimated,
    elapsedAtAnchorMs: elapsedAt,
    anchorContinuousMs: snapshot.continuousMs,
    anchorWallMs: snapshot.wallEpochMs,
    bootId: snapshot.bootId,
    quality: snapshot.quality,
  };
}

export function checkpointFromSnapshot(snapshot: ClockSnapshot, elapsed: ElapsedMs): Checkpoint {
  return {
    wallEpochMs: snapshot.wallEpochMs,
    continuousMs: snapshot.continuousMs,
    elapsedMs: elapsed,
    timezoneId: snapshot.timezoneId,
    utcOffsetMinutes: snapshot.utcOffsetMinutes,
    bootId: snapshot.bootId,
  };
}

/** elapsed = elapsedAtAnchor + (continuous - anchorContinuous). Never accumulated. */
export function computeElapsed(anchor: ClockAnchor, snapshot: ClockSnapshot): ElapsedMs {
  return elapsedMs(
    Math.max(0, Math.round(anchor.elapsedAtAnchorMs + (snapshot.continuousMs - anchor.anchorContinuousMs))),
  );
}

/**
 * Continuous clock values are only comparable within one boot. A boot is
 * verified only when both readings carry the same non-null boot identity from
 * the same clock source and the clock has not gone backwards.
 */
export function isSameBoot(anchor: ClockAnchor, snapshot: ClockSnapshot): boolean {
  return (
    anchor.bootId !== null &&
    snapshot.bootId !== null &&
    anchor.bootId === snapshot.bootId &&
    anchor.quality === snapshot.quality &&
    snapshot.continuousMs >= anchor.anchorContinuousMs
  );
}

export type AnchorResolution =
  | { kind: 'same_boot'; anchor: ClockAnchor; elapsed: ElapsedMs }
  | {
      kind: 'estimated';
      anchor: ClockAnchor;
      elapsed: ElapsedMs;
      fromElapsedMs: ElapsedMs;
      toElapsedMs: ElapsedMs;
    };

/**
 * Called when a process (re)attaches to a session. Same verified boot keeps the
 * persisted anchor. Otherwise the saved wall-clock checkpoint estimates the time
 * that passed, a new anchor is established, and the caller must flag the interval.
 */
export function resolveAnchor(
  anchor: ClockAnchor,
  checkpoint: Checkpoint,
  snapshot: ClockSnapshot,
): AnchorResolution {
  if (isSameBoot(anchor, snapshot)) {
    return { kind: 'same_boot', anchor, elapsed: computeElapsed(anchor, snapshot) };
  }
  const wallGap = Math.max(0, snapshot.wallEpochMs - checkpoint.wallEpochMs);
  const estimate = elapsedMs(checkpoint.elapsedMs + wallGap);
  return {
    kind: 'estimated',
    anchor: anchorFromSnapshot(snapshot, estimate, true),
    elapsed: estimate,
    fromElapsedMs: checkpoint.elapsedMs,
    toElapsedMs: estimate,
  };
}

export type ClockObservation = {
  type: Extract<TimingFlagType, 'clock_change' | 'timezone_change'>;
  wallDeltaMs: number;
  continuousDeltaMs: number;
  detail: string;
};

/**
 * Compares the wall-clock and continuous-clock deltas since the last observation.
 * Only valid when both readings come from the same boot.
 */
export function detectClockChanges(previous: Checkpoint, snapshot: ClockSnapshot): ClockObservation[] {
  const wallDeltaMs = snapshot.wallEpochMs - previous.wallEpochMs;
  const continuousDeltaMs = snapshot.continuousMs - previous.continuousMs;
  const out: ClockObservation[] = [];
  const drift = wallDeltaMs - continuousDeltaMs;
  if (Math.abs(drift) > CLOCK_CHANGE_THRESHOLD_MS) {
    out.push({
      type: 'clock_change',
      wallDeltaMs,
      continuousDeltaMs,
      detail: `Device clock moved ${drift > 0 ? '+' : '-'}${formatElapsed(Math.abs(drift))}`,
    });
  }
  if (
    snapshot.timezoneId !== previous.timezoneId ||
    snapshot.utcOffsetMinutes !== previous.utcOffsetMinutes
  ) {
    out.push({
      type: 'timezone_change',
      wallDeltaMs,
      continuousDeltaMs,
      detail: `${previous.timezoneId} ${formatOffset(previous.utcOffsetMinutes)} to ${snapshot.timezoneId} ${formatOffset(snapshot.utcOffsetMinutes)}`,
    });
  }
  return out;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** HH:mm:ss; hours keep growing past 24. */
export function formatElapsed(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function formatOffset(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  return `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Wall instant broken into local fields for a fixed UTC offset (no device tz lookups). */
export function localParts(wall: number, offsetMinutes: number) {
  const d = new Date(wall + offsetMinutes * 60_000);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  };
}

export function formatTime24(wall: number, offsetMinutes: number): string {
  const p = localParts(wall, offsetMinutes);
  return `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

export function formatTime12(wall: number, offsetMinutes: number): string {
  const p = localParts(wall, offsetMinutes);
  const suffix = p.hour < 12 ? 'AM' : 'PM';
  const h = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${h}:${pad(p.minute)}:${pad(p.second)} ${suffix}`;
}

export function formatDate(wall: number, offsetMinutes: number): string {
  const p = localParts(wall, offsetMinutes);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function formatDateTime(wall: number, offsetMinutes: number): string {
  return `${formatDate(wall, offsetMinutes)} ${formatTime24(wall, offsetMinutes)}`;
}

/** Parses HH:mm:ss or H:mm:ss (hours may exceed 24). Returns ms or null. */
export function parseElapsed(input: string): ElapsedMs | null {
  const m = /^\s*(\d{1,4}):([0-5]\d):([0-5]\d)\s*$/.exec(input);
  if (!m) return null;
  return elapsedMs((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000);
}

/** Parses "YYYY-MM-DD" + "HH:mm:ss" at a fixed UTC offset into a wall instant. */
export function parseLocalDateTime(date: string, time: string, offsetMinutes: number) {
  const d = /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/.exec(date);
  const t = /^\s*([01]\d|2[0-3]):([0-5]\d):([0-5]\d)\s*$/.exec(time);
  if (!d || !t) return null;
  const [y, mo, da] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const utc = Date.UTC(y, mo - 1, da, Number(t[1]), Number(t[2]), Number(t[3]));
  const check = new Date(utc);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== da) return null;
  return wallMs(utc - offsetMinutes * 60_000);
}

/** Parses "+HH:MM" / "-HH:MM" / "UTC+HH:MM" into minutes. */
export function parseOffset(input: string): number | null {
  const m = /^\s*(?:UTC)?([+-])(\d{2}):?(\d{2})\s*$/i.exec(input);
  if (!m) return null;
  const minutes = Number(m[2]) * 60 + Number(m[3]);
  if (minutes > 14 * 60) return null;
  return m[1] === '-' ? -minutes : minutes;
}

/** MM-DD-YYYY, the date format the manual time fields show. */
export function formatDateMDY(wall: number, offsetMinutes: number): string {
  const p = localParts(wall, offsetMinutes);
  return `${pad(p.month)}-${pad(p.day)}-${p.year}`;
}

/** Converts "MM-DD-YYYY" to "YYYY-MM-DD", or null when it is not a real calendar date. */
export function parseDateMDY(input: string): string | null {
  const m = /^\s*(\d{1,2})[-/](\d{1,2})[-/](\d{4})\s*$/.exec(input);
  if (!m) return null;
  const [mo, da, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(y, mo - 1, da));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== da) return null;
  return `${y}-${pad(mo)}-${pad(da)}`;
}

/**
 * Minutes east of UTC that the device time zone uses at an instant. The
 * resolver is injectable so tests do not depend on the machine's zone.
 */
export function deviceOffsetAtWall(wall: number, tzOffsetOf: (d: Date) => number = (d) => d.getTimezoneOffset()): number {
  // getTimezoneOffset is minutes WEST of UTC; `|| 0` turns -0 into 0.
  return -tzOffsetOf(new Date(wall)) || 0;
}

/**
 * Offset the device time zone uses for a local "YYYY-MM-DD" + "HH:mm:ss".
 * Local fields are read as device time. A time skipped by a DST jump resolves
 * the way the platform Date does (rolled forward); a repeated hour picks one.
 */
export function deviceOffsetAtLocal(
  date: string,
  time: string,
  tzOffsetOf: (d: Date) => number = (d) => d.getTimezoneOffset(),
): number | null {
  const d = /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/.exec(date);
  const t = /^\s*(\d{2}):(\d{2}):(\d{2})\s*$/.exec(time);
  if (!d || !t) return null;
  const local = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]), Number(t[3]));
  return -tzOffsetOf(local) || 0;
}
