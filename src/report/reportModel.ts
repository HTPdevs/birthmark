import { formatDate, formatDateTime, formatElapsed, formatOffset, formatTime24, localParts } from '../domain/time';
import {
  effectiveElapsed,
  effectiveOffset,
  effectiveWall,
  eventDuration,
  eventEnd,
  eventName,
  eventStart,
  intervalsSincePrevious,
  isIncluded,
  momentName,
  sortByEffective,
} from '../domain/timeline';
import {
  type AssessmentPoint,
  type ElapsedMs,
  type Moment,
  type RevisionAction,
  type SessionData,
  type WallMs,
  milestoneLabel,
} from '../domain/types';

export type TimelineRow = {
  momentId: string;
  sequence: number;
  label: string;
  time: string;
  elapsed: string;
  interval: string;
  group: string;
  flags: string[];
  isSystem: boolean;
  /** On-screen "Elapsed time" cell: "Crown to Head", "Start to Crown", or the label for system rows. */
  span: string;
  /** Time from the previous included record (or session start for the first one) to this one. */
  spanElapsed: string;
  /** On-screen "Notes" cell: a milestone's label, then its flags. */
  notes: string[];
};

/** One row of the on-screen timeline table, which opens with the session start. */
export type ScreenTimelineRow = {
  key: string;
  index: number;
  span: string;
  time: string;
  elapsed: string;
  notes: string;
  /** Null for the Start time row, which is not a record and cannot be edited. */
  momentId: string | null;
  isSystem: boolean;
};

export type ReportModel = {
  header: {
    sessionId: string;
    shortId: string;
    sessionDate: string;
    start: string;
    end: string;
    /** Start clock time only (24h, no date), for the on-screen report. */
    startTime: string;
    /** End clock time only (24h, no date), or "In progress", for the on-screen report. */
    endTime: string;
    timezone: string;
    offsets: string;
    totalElapsed: string;
    revision: number;
    generatedAt: string;
    inProgress: boolean;
  };
  timeline: TimelineRow[];
  events: { label: string; start: string; end: string; duration: string; autoEnded: boolean }[];
  apgar: { label: string; score: string }[];
  appendix: {
    excluded: TimelineRow[];
    corrected: { label: string; original: string; effective: string; source: string }[];
    finishes: { label: string; time: string; elapsed: string }[];
    flags: { type: string; interval: string; detail: string }[];
  };
  changeHistory: { revision: number; action: string; target: string; from: string; to: string; changedAt: string }[];
  footer: string;
};

export const REPORT_FOOTER = "Times are captured using this device's internal clock, verify for accuracy.";

const DASH = '—';

const FLAG_LABELS: Record<string, string> = {
  clock_change: 'Clock changed',
  timezone_change: 'Timezone changed',
  recovery_estimate: 'Timing estimated after recovery',
  manual_time: 'Manual time',
};

const ACTION_LABELS: Record<RevisionAction, string> = {
  label: 'Label changed',
  flag_accidental: 'Flagged accidental',
  unflag_accidental: 'Unflagged accidental',
  add_manual: 'Missed moment added',
  correct_time: 'Time corrected',
  finish: 'Session finished',
  resume: 'Session resumed',
  assessment: 'APGAR score saved',
  event_label: 'Event label changed',
};

export const APGAR_LABELS: Record<AssessmentPoint, string> = {
  one_minute: '1-minute APGAR',
  five_minute: '5-minute APGAR',
};

function formatTimestamp(wall: number | null, offset: number, sessionDate: string, sessionOffset: number) {
  if (wall === null) return DASH;
  const date = formatDate(wall, offset);
  const time = formatTime24(wall, offset);
  const datePart = date !== sessionDate ? `${date} ` : '';
  const offsetPart = offset !== sessionOffset ? ` ${formatOffset(offset)}` : '';
  return `${datePart}${time}${offsetPart}`;
}

/** One normalized model feeding both the on-screen report and the PDF. */
export function buildReport(data: SessionData, generatedAt: WallMs, nowElapsed: ElapsedMs | null): ReportModel {
  const { session } = data;
  const off0 = session.startedSnapshot.utcOffsetMinutes;
  const sessionDate = formatDate(session.startedSnapshot.wallEpochMs, off0);
  const intervals = intervalsSincePrevious(data.moments);
  const flagsByMoment = new Map<string, string[]>();
  for (const f of data.flags) {
    if (!f.momentId) continue;
    const list = flagsByMoment.get(f.momentId) ?? [];
    list.push(FLAG_LABELS[f.type] ?? f.type);
    flagsByMoment.set(f.momentId, list);
  }
  const groupName = (m: Moment) => {
    const ev = m.eventId ? data.events.find((e) => e.id === m.eventId) : undefined;
    return ev ? eventName(ev) : 'Session';
  };

  const sorted = sortByEffective(data.moments);
  // Span names drop a milestone's label (it goes in Notes) so "Crown to Head" stays short.
  const spanName = (m: Moment) =>
    m.kind === 'milestone' && m.milestoneCode ? milestoneLabel(m.milestoneCode) : momentName(m, data.events);
  const previousIncluded = new Map<string, Moment | null>();
  let lastSeen: Moment | null = null;
  for (const m of sorted) {
    if (!isIncluded(m)) continue;
    previousIncluded.set(m.id, lastSeen);
    lastSeen = m;
  }
  const toRow = (m: Moment): TimelineRow => {
    const flags: string[] = [];
    if (m.source === 'manual') flags.push('Manual');
    if (m.source === 'corrected') flags.push('Corrected');
    if (m.timingEstimated) flags.push('Estimated');
    if (m.snapshot?.quality === 'fallback') flags.push('Fallback clock');
    if (m.flaggedAccidental) flags.push('Accidental tap');
    flags.push(...(flagsByMoment.get(m.id) ?? []));
    const interval = intervals.get(m.id);
    const label = momentName(m, data.events);
    const included = isIncluded(m);
    const prev = previousIncluded.get(m.id) ?? null;
    const notes = m.kind === 'milestone' && m.label?.trim() ? [m.label.trim(), ...flags] : flags;
    return {
      momentId: m.id,
      sequence: m.captureSequence,
      label,
      time: formatTimestamp(effectiveWall(m), effectiveOffset(m, off0), sessionDate, off0),
      elapsed: formatElapsed(effectiveElapsed(m)),
      interval: interval == null ? DASH : formatElapsed(interval),
      group: groupName(m),
      flags,
      isSystem: !(m.kind === 'capture' || m.kind === 'milestone'),
      span: !included ? label : `${prev ? spanName(prev) : 'Start'} to ${spanName(m)}`,
      spanElapsed: !included
        ? DASH
        : formatElapsed(prev ? effectiveElapsed(m) - effectiveElapsed(prev) : effectiveElapsed(m)),
      notes,
    };
  };

  const timeline = sorted.filter((m) => !(m.kind === 'capture' || m.kind === 'milestone') || isIncluded(m)).map(toRow);
  const excluded = sorted.filter((m) => m.flaggedAccidental).map(toRow);

  // A gap between a finish and its resumption is labelled in the timeline.
  for (const row of timeline) {
    const m = data.moments.find((x) => x.id === row.momentId);
    if (m?.kind !== 'resume') continue;
    const priorFinish = sorted.filter((x) => x.kind === 'finish' && effectiveElapsed(x) <= effectiveElapsed(m)).pop();
    if (!priorFinish) continue;
    row.label = `Resumed after finish (gap ${formatElapsed(effectiveElapsed(m) - effectiveElapsed(priorFinish))})`;
    row.span = row.label;
  }

  const end = session.finishSnapshot;
  const totalElapsed = session.finishElapsedMs ?? nowElapsed;
  const offsets = new Set<number>([off0]);
  data.moments.forEach((m) => m.snapshot && offsets.add(m.snapshot.utcOffsetMinutes));

  const events = data.events.map((e) => {
    const s = eventStart(e, data.moments);
    const en = eventEnd(e, data.moments);
    const dur = eventDuration(e, data.moments, nowElapsed);
    return {
      label: eventName(e),
      start: s ? formatTimestamp(effectiveWall(s), effectiveOffset(s, off0), sessionDate, off0) : DASH,
      end: en ? formatTimestamp(effectiveWall(en), effectiveOffset(en, off0), sessionDate, off0) : 'Active',
      duration: dur === null ? DASH : formatElapsed(dur),
      autoEnded: e.endedBySessionFinish,
    };
  });

  const apgar = (['one_minute', 'five_minute'] as const).map((p) => {
    const a = data.assessments.find((x) => x.assessmentPoint === p);
    return { label: APGAR_LABELS[p], score: a ? String(a.score) : 'Not entered' };
  });

  const corrected = data.moments
    .filter((m) => m.source !== 'captured' || m.effectiveElapsedMs !== null)
    .map((m) => ({
      label: momentName(m, data.events),
      original:
        m.snapshot && m.originalElapsedMs !== null
          ? `${formatTimestamp(m.snapshot.wallEpochMs, m.snapshot.utcOffsetMinutes, sessionDate, off0)} (${formatElapsed(m.originalElapsedMs)})`
          : 'Not captured (manual entry)',
      effective: `${formatTimestamp(effectiveWall(m), effectiveOffset(m, off0), sessionDate, off0)} (${formatElapsed(effectiveElapsed(m))})`,
      source: m.source === 'manual' ? 'Manual' : 'Corrected',
    }));

  const finishes = sortByEffective(data.moments.filter((m) => m.kind === 'finish' || m.kind === 'resume')).map((m) => ({
    label: m.kind === 'finish' ? 'Finished' : 'Resumed',
    time: formatTimestamp(effectiveWall(m), effectiveOffset(m, off0), sessionDate, off0),
    elapsed: formatElapsed(effectiveElapsed(m)),
  }));

  const flags = data.flags.map((f) => ({
    type: FLAG_LABELS[f.type] ?? f.type,
    interval:
      f.fromElapsedMs !== null && f.toElapsedMs !== null
        ? `${formatElapsed(f.fromElapsedMs)} to ${formatElapsed(f.toElapsedMs)}`
        : DASH,
    detail: f.detail ?? '',
  }));

  const targetName = (r: SessionData['revisions'][number]) => {
    if (r.momentId) {
      const m = data.moments.find((x) => x.id === r.momentId);
      return m ? momentName(m, data.events) : 'Moment';
    }
    if (r.assessmentId) {
      const a = data.assessments.find((x) => x.id === r.assessmentId);
      return a ? APGAR_LABELS[a.assessmentPoint] : 'APGAR';
    }
    if (r.eventId) {
      const e = data.events.find((x) => x.id === r.eventId);
      return e ? `Event ${e.number}` : 'Event';
    }
    return 'Session';
  };
  const describe = (action: RevisionAction, v: string | null) => {
    if (v === null) return DASH;
    if (action === 'correct_time' || action === 'add_manual') {
      try {
        const o = JSON.parse(v) as { elapsed: number; wall: number | null };
        return `${formatElapsed(o.elapsed)}${o.wall !== null ? ` / ${formatTimestamp(o.wall, off0, sessionDate, off0)}` : ''}`;
      } catch {
        return v;
      }
    }
    if (action === 'finish' || action === 'resume') {
      const n = Number(v);
      return Number.isFinite(n) ? formatElapsed(n) : v;
    }
    if (action === 'flag_accidental' || action === 'unflag_accidental') return v === 'true' ? 'Excluded' : 'Included';
    return v;
  };

  const changeHistory = data.revisions.map((r) => ({
    revision: r.revisionNumber,
    action: ACTION_LABELS[r.action] ?? r.action,
    target: targetName(r),
    from: describe(r.action, r.oldValue),
    to: describe(r.action, r.newValue),
    changedAt: formatDateTime(r.changedAt, off0),
  }));

  return {
    header: {
      sessionId: session.id,
      shortId: session.shortId,
      sessionDate,
      start: formatDateTime(session.startedSnapshot.wallEpochMs, off0),
      end: end ? formatDateTime(end.wallEpochMs, end.utcOffsetMinutes) : 'In progress',
      startTime: formatTime24(session.startedSnapshot.wallEpochMs, off0),
      endTime: end ? formatTime24(end.wallEpochMs, end.utcOffsetMinutes) : 'In progress',
      timezone: session.startedSnapshot.timezoneId,
      offsets: [...offsets].map(formatOffset).join(', '),
      totalElapsed: totalElapsed === null ? DASH : formatElapsed(totalElapsed),
      revision: session.revision,
      generatedAt: formatDateTime(generatedAt, off0),
      inProgress: session.status === 'active',
    },
    timeline,
    events,
    apgar,
    appendix: { excluded, corrected, finishes, flags },
    changeHistory,
    footer: REPORT_FOOTER,
  };
}

/**
 * Rows for the on-screen timeline table: a Start time row, then every timeline
 * row numbered from 2. The PDF keeps capture sequence numbers instead.
 */
export function screenTimeline(r: ReportModel): ScreenTimelineRow[] {
  return [
    { key: 'start', index: 1, span: 'Start time', time: r.header.startTime, elapsed: DASH, notes: '', momentId: null, isSystem: true },
    ...r.timeline.map((row, i) => ({
      key: row.momentId,
      index: i + 2,
      span: row.span,
      time: row.time,
      elapsed: row.spanElapsed,
      notes: row.notes.join(', '),
      momentId: row.isSystem ? null : row.momentId,
      isSystem: row.isSystem,
    })),
  ];
}

/** Birthmark_2026-10-07_142208_AB12_r3.pdf */
export function reportFileName(data: SessionData): string {
  const s = data.session.startedSnapshot;
  const p = localParts(s.wallEpochMs, s.utcOffsetMinutes);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Birthmark_${p.year}-${pad(p.month)}-${pad(p.day)}_${pad(p.hour)}${pad(p.minute)}${pad(p.second)}_${data.session.shortId}_r${data.session.revision}.pdf`;
}
