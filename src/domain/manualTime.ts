import { parseElapsed, parseLocalDateTime } from './time';
import { effectiveElapsed, eventEnd, eventStart } from './timeline';
import {
  type ElapsedMs,
  type SessionData,
  type WallMs,
  elapsedMs,
  wallMs,
} from './types';

export type ManualTimeInput =
  | { mode: 'elapsed'; elapsed: string }
  | { mode: 'clock'; date: string; time: string; offsetMinutes: number };

export type ManualTimeResult =
  | {
      ok: true;
      elapsed: ElapsedMs;
      wall: WallMs;
      offsetMinutes: number;
      /** A clock change or recovery estimate lies between the reference and the result. */
      ambiguous: boolean;
    }
  | { ok: false; error: string };

type Reference = { elapsed: number; wall: number; offset: number };

/** Captured clock readings that tie elapsed time to wall time. */
function references(data: SessionData): Reference[] {
  const s = data.session;
  const refs: Reference[] = [
    { elapsed: 0, wall: s.startedSnapshot.wallEpochMs, offset: s.startedSnapshot.utcOffsetMinutes },
  ];
  for (const m of data.moments) {
    if (m.snapshot && m.originalElapsedMs !== null) {
      refs.push({
        elapsed: m.originalElapsedMs,
        wall: m.snapshot.wallEpochMs,
        offset: m.snapshot.utcOffsetMinutes,
      });
    }
  }
  return refs.sort((a, b) => a.elapsed - b.elapsed);
}

function crossesFlag(data: SessionData, a: number, b: number): boolean {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return data.flags.some(
    (f) =>
      (f.type === 'clock_change' || f.type === 'recovery_estimate' || f.type === 'timezone_change') &&
      f.toElapsedMs !== null &&
      f.toElapsedMs > lo &&
      (f.fromElapsedMs ?? f.toElapsedMs) <= hi,
  );
}

/**
 * Converts a manual entry to both elapsed and wall time using the nearest
 * captured reference, then validates it falls inside the session (and event).
 */
export function resolveManualTime(
  data: SessionData,
  input: ManualTimeInput,
  eventId: string | null,
  sessionEndElapsed: ElapsedMs,
): ManualTimeResult {
  const refs = references(data);
  let elapsed: number;
  let wall: number;
  let offset: number;
  let ref: Reference;

  if (input.mode === 'elapsed') {
    const parsed = parseElapsed(input.elapsed);
    if (parsed === null) return { ok: false, error: 'Enter elapsed time as HH:mm:ss.' };
    elapsed = parsed;
    ref = [...refs].reverse().find((r) => r.elapsed <= elapsed) ?? refs[0];
    wall = ref.wall + (elapsed - ref.elapsed);
    offset = ref.offset;
  } else {
    const parsed = parseLocalDateTime(input.date, input.time, input.offsetMinutes);
    if (parsed === null) return { ok: false, error: 'Enter date as YYYY-MM-DD and time as HH:mm:ss (24-hour).' };
    wall = parsed;
    offset = input.offsetMinutes;
    const byWall = [...refs].sort((a, b) => a.wall - b.wall);
    ref = [...byWall].reverse().find((r) => r.wall <= wall) ?? byWall[0];
    elapsed = ref.elapsed + (wall - ref.wall);
  }

  if (elapsed < 0 || elapsed > sessionEndElapsed) {
    return { ok: false, error: 'That time is outside this session.' };
  }
  if (eventId) {
    const ev = data.events.find((e) => e.id === eventId);
    if (!ev) return { ok: false, error: 'Event not found.' };
    const start = eventStart(ev, data.moments);
    const end = eventEnd(ev, data.moments);
    const startE = start ? effectiveElapsed(start) : 0;
    const endE = end ? effectiveElapsed(end) : sessionEndElapsed;
    if (elapsed < startE || elapsed > endE) {
      return { ok: false, error: 'That time is outside the selected event.' };
    }
  }

  return {
    ok: true,
    elapsed: elapsedMs(Math.round(elapsed)),
    wall: wallMs(Math.round(wall)),
    offsetMinutes: offset,
    ambiguous: crossesFlag(data, ref.elapsed, elapsed),
  };
}
