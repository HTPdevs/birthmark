import { randomUUID } from 'node:crypto';

import type { Clock } from '@/domain/sessionController';
import { type ClockSnapshot, continuousMs, wallMs } from '@/domain/types';

/** 2026-10-07 14:22:08 UTC-07:00 */
export const T0 = Date.UTC(2026, 9, 7, 21, 22, 8);

/** Injectable clock: advance() moves both clocks; other helpers model device events. */
export class FakeClock implements Clock {
  wall = T0;
  cont = 5_000_000;
  timezoneId = 'America/Los_Angeles';
  offset = -420;
  bootId: string | null = 'boot-1';
  quality: ClockSnapshot['quality'] = 'native';
  reads = 0;

  read(): ClockSnapshot {
    this.reads++;
    return {
      wallEpochMs: wallMs(this.wall),
      continuousMs: continuousMs(this.cont),
      timezoneId: this.timezoneId,
      utcOffsetMinutes: this.offset,
      bootId: this.bootId,
      quality: this.quality,
    };
  }

  /** Real time passes (including sleep): both clocks move together. */
  advance(ms: number) {
    this.wall += ms;
    this.cont += ms;
  }

  /** User or network changes the wall clock; continuous time is unaffected. */
  setWallBy(ms: number) {
    this.wall += ms;
  }

  /** Device reboot after `downMs`: continuous restarts near zero with a new boot id. */
  reboot(downMs: number, newBootId: string | null = 'boot-2') {
    this.wall += downMs;
    this.cont = 30_000;
    this.bootId = newBootId;
  }
}

export const uuid = () => randomUUID();
