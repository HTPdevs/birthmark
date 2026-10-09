import type { ManualTimeInput } from '../domain/manualTime';
import { deviceOffsetAtLocal, deviceOffsetAtWall, formatDateMDY, formatElapsed, formatTime24, parseDateMDY } from '../domain/time';

/** What the manual time fields hold. The date is MM-DD-YYYY; the zone is the device's. */
export type ManualTimeDraft = {
  mode: 'elapsed' | 'clock';
  elapsed: string;
  date: string;
  time: string;
};

type TzOffsetOf = (d: Date) => number;

/** Fields prefilled from an instant, shown in the device time zone so save round-trips. */
export function draftAt(wall: number, elapsedMs: number, tzOffsetOf?: TzOffsetOf): ManualTimeDraft {
  const offset = deviceOffsetAtWall(wall, tzOffsetOf);
  return { mode: 'elapsed', elapsed: formatElapsed(elapsedMs), date: formatDateMDY(wall, offset), time: formatTime24(wall, offset) };
}

/** Converts the draft for resolveManualTime, reading date and time in the device time zone. */
export function draftToInput(d: ManualTimeDraft, tzOffsetOf?: TzOffsetOf): ManualTimeInput | { error: string } {
  if (d.mode === 'elapsed') return { mode: 'elapsed', elapsed: d.elapsed };
  const date = parseDateMDY(d.date);
  if (date === null) return { error: 'Enter the date as MM-DD-YYYY.' };
  const offsetMinutes = deviceOffsetAtLocal(date, d.time.trim(), tzOffsetOf);
  if (offsetMinutes === null) return { error: 'Enter the time as HH:mm:ss (24-hour).' };
  return { mode: 'clock', date, time: d.time, offsetMinutes };
}
