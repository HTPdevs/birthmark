import type { ManualTimeInput } from '../domain/manualTime';
import { deviceOffsetAtLocal, deviceOffsetAtWall, formatDate, formatElapsed, formatTime24, parseDateMDY, parseElapsed } from '../domain/time';

/** What the manual time fields hold. The date is MM-DD-YYYY; the zone is the device's. */
export type ManualTimeDraft = {
  mode: 'elapsed' | 'clock';
  elapsed: string;
  date: string;
  time: string;
};

type TzOffsetOf = (d: Date) => number;

/**
 * Fields prefilled from an instant, shown in the device time zone so save round-trips.
 * The elapsed field counts from `origin` (the first recorded moment, see
 * `recordingOrigin`), matching the report; stored elapsed still counts from Start.
 */
export function draftAt(wall: number, elapsedMs: number, tzOffsetOf?: TzOffsetOf, origin = 0): ManualTimeDraft {
  const offset = deviceOffsetAtWall(wall, tzOffsetOf);
  return {
    mode: 'elapsed',
    elapsed: formatElapsed(Math.max(0, elapsedMs - origin)),
    date: formatDate(wall, offset),
    time: formatTime24(wall, offset),
  };
}

/**
 * Converts the draft for resolveManualTime, reading date and time in the device
 * time zone. An elapsed entry is relative to `origin` and is shifted back to
 * session-start elapsed here, so the domain never sees the display origin.
 */
export function draftToInput(d: ManualTimeDraft, tzOffsetOf?: TzOffsetOf, origin = 0): ManualTimeInput | { error: string } {
  if (d.mode === 'elapsed') {
    const since = parseElapsed(d.elapsed);
    // Unparseable text goes through unchanged so resolveManualTime reports it.
    return { mode: 'elapsed', elapsed: since === null ? d.elapsed : formatElapsed(since + origin) };
  }
  const date = parseDateMDY(d.date);
  if (date === null) return { error: 'Enter the date as MM-DD-YYYY.' };
  const offsetMinutes = deviceOffsetAtLocal(date, d.time.trim(), tzOffsetOf);
  if (offsetMinutes === null) return { error: 'Enter the time as HH:mm:ss (24-hour).' };
  return { mode: 'clock', date, time: d.time, offsetMinutes };
}
