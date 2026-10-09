import {
  type ElapsedMs,
  type MilestoneCode,
  type Moment,
  type SessionEvent,
  type WallMs,
  elapsedMs,
  milestoneLabel,
} from './types';

export function effectiveElapsed(m: Moment): ElapsedMs {
  return m.effectiveElapsedMs ?? m.originalElapsedMs ?? elapsedMs(0);
}

export function effectiveWall(m: Moment): WallMs | null {
  return m.effectiveWallMs ?? m.snapshot?.wallEpochMs ?? null;
}

export function effectiveOffset(m: Moment, fallbackOffset: number): number {
  return m.snapshot?.utcOffsetMinutes ?? fallbackOffset;
}

/** Included moments drive "Since last moment" and the live milestone status. */
export function isIncluded(m: Moment): boolean {
  return (m.kind === 'capture' || m.kind === 'milestone') && !m.flaggedAccidental;
}

export function isSystemBoundary(m: Moment): boolean {
  return m.kind === 'event_start' || m.kind === 'event_end' || m.kind === 'finish' || m.kind === 'resume';
}

/** Effective chronology: elapsed time, then persisted capture sequence for ties. */
export function sortByEffective(moments: Moment[]): Moment[] {
  return [...moments].sort(
    (a, b) => effectiveElapsed(a) - effectiveElapsed(b) || a.captureSequence - b.captureSequence,
  );
}

/** Original capture order, kept available when corrections change the chronology. */
export function sortByCapture(moments: Moment[]): Moment[] {
  return [...moments].sort((a, b) => a.captureSequence - b.captureSequence);
}

export function eventName(e: SessionEvent): string {
  return e.label?.trim() ? e.label : `Event ${e.number}`;
}

export function momentName(m: Moment, events: SessionEvent[]): string {
  const ev = m.eventId ? events.find((e) => e.id === m.eventId) : undefined;
  switch (m.kind) {
    case 'capture':
      return m.label?.trim() ? m.label : `Moment ${m.momentNumber ?? '?'}`;
    case 'milestone': {
      // The milestone name always shows; a label adds to it instead of replacing it,
      // so a note on a captured or manually added milestone never hides which one it was.
      const name = m.milestoneCode ? milestoneLabel(m.milestoneCode) : 'Milestone';
      return m.label?.trim() ? `${name}: ${m.label}` : name;
    }
    case 'event_start':
      return `Event started: ${ev ? eventName(ev) : 'Event'}`;
    case 'event_end':
      return `Event ended: ${ev ? eventName(ev) : 'Event'}`;
    case 'finish':
      return 'Finish time';
    case 'resume':
      return 'Resumed after finish';
  }
}

export type IntervalInfo = { momentId: string; intervalMs: ElapsedMs | null };

/**
 * Interval since the previous included moment, computed on the effective
 * timeline. System boundaries and accidental taps get no interval and never
 * reset the running value.
 */
export function intervalsSincePrevious(moments: Moment[]): Map<string, ElapsedMs | null> {
  const out = new Map<string, ElapsedMs | null>();
  let prev: ElapsedMs | null = null;
  for (const m of sortByEffective(moments)) {
    if (!isIncluded(m)) {
      out.set(m.id, null);
      continue;
    }
    const e = effectiveElapsed(m);
    out.set(m.id, prev === null ? null : elapsedMs(e - prev));
    prev = e;
  }
  return out;
}

export function lastIncluded(moments: Moment[]): Moment | null {
  const included = sortByEffective(moments).filter(isIncluded);
  return included.length ? included[included.length - 1] : null;
}

export function sinceLastMoment(moments: Moment[], nowElapsed: ElapsedMs): ElapsedMs | null {
  const last = lastIncluded(moments);
  return last ? elapsedMs(Math.max(0, nowElapsed - effectiveElapsed(last))) : null;
}

export type LiveStatus = {
  history: Moment[];
  current: Moment | null;
  previous: Moment | null;
  /** Fixed interval between the previous and current milestone. */
  sincePreviousMs: ElapsedMs | null;
};

/** Live milestone panel, derived from the effective included timeline. */
export function liveStatus(moments: Moment[]): LiveStatus {
  const milestones = sortByEffective(moments).filter((m) => m.kind === 'milestone' && isIncluded(m));
  const current = milestones.length ? milestones[milestones.length - 1] : null;
  const previous = milestones.length > 1 ? milestones[milestones.length - 2] : null;
  return {
    history: milestones,
    current,
    previous,
    sincePreviousMs:
      current && previous ? elapsedMs(effectiveElapsed(current) - effectiveElapsed(previous)) : null,
  };
}

export type RowMode = 'all' | 'post_first_cry';

/**
 * The row switches to the post-First-Cry subset after a First Cry capture, until
 * the operator explicitly restores "All milestones" (recorded by capture sequence).
 */
export function deriveRowMode(moments: Moment[], allSelectedAtSequence: number | null): RowMode {
  const firstCries = moments.filter(
    (m) => m.kind === 'milestone' && m.milestoneCode === 'FIRST_CRY' && isIncluded(m),
  );
  if (!firstCries.length) return 'all';
  const latestSeq = Math.max(...firstCries.map((m) => m.captureSequence));
  if (allSelectedAtSequence !== null && allSelectedAtSequence >= latestSeq) return 'all';
  return 'post_first_cry';
}

export function eventStart(e: SessionEvent, moments: Moment[]): Moment | undefined {
  return moments.find((m) => m.id === e.startMomentId);
}

export function eventEnd(e: SessionEvent, moments: Moment[]): Moment | undefined {
  return e.endMomentId ? moments.find((m) => m.id === e.endMomentId) : undefined;
}

export function eventDuration(
  e: SessionEvent,
  moments: Moment[],
  nowElapsed: ElapsedMs | null,
): ElapsedMs | null {
  const start = eventStart(e, moments);
  if (!start) return null;
  const end = eventEnd(e, moments);
  const endElapsed = end ? effectiveElapsed(end) : nowElapsed;
  if (endElapsed === null) return null;
  return elapsedMs(Math.max(0, endElapsed - effectiveElapsed(start)));
}

export function milestoneMoments(moments: Moment[], code: MilestoneCode): Moment[] {
  return moments.filter((m) => m.kind === 'milestone' && m.milestoneCode === code);
}
