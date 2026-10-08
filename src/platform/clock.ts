import ClockSnapshotModule from '../../modules/clock-snapshot/src/ClockSnapshotModule';
import type { Clock } from '../domain/sessionController';
import { type ClockSnapshot, continuousMs, wallMs } from '../domain/types';

/** Present only in builds that include the local native module (not Expo Go). */
export const hasNativeClock = ClockSnapshotModule !== null;

// Fallback identity is per JS process: a relaunch can never claim the same boot,
// so recovery is flagged as estimated rather than silently trusted.
const fallbackBootId = `js-${Math.random().toString(36).slice(2)}-${Date.now()}`;
const fallbackOrigin = Date.now() - (globalThis.performance?.now?.() ?? 0);

function readFallback(): ClockSnapshot {
  const offset = -new Date().getTimezoneOffset();
  return {
    wallEpochMs: wallMs(Date.now()),
    continuousMs: continuousMs(Math.floor(fallbackOrigin + (globalThis.performance?.now?.() ?? 0))),
    timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Local',
    utcOffsetMinutes: offset === 0 ? 0 : offset,
    bootId: fallbackBootId,
    quality: 'fallback',
  };
}

export const deviceClock: Clock = {
  read(): ClockSnapshot {
    if (!ClockSnapshotModule) return readFallback();
    const s = ClockSnapshotModule.read();
    return {
      wallEpochMs: wallMs(s.wallEpochMs),
      continuousMs: continuousMs(s.continuousMs),
      timezoneId: s.timezoneId,
      utcOffsetMinutes: s.utcOffsetMinutes,
      bootId: s.bootId ?? null,
      quality: 'native',
    };
  },
};

export function excludeFromBackup(path: string): boolean {
  return ClockSnapshotModule?.excludeFromBackup(path) ?? false;
}
