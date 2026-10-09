import { formatDate, formatDateTime, formatElapsed, formatOffset, formatTime24, localParts } from '../domain/time';
import {
  effectiveElapsed,
  effectiveOffset,
  effectiveWall,
  eventDuration,
  eventEnd,
  eventName,
  eventStart,
  isIncluded,
  momentName,
  recordedTotal,
  recordingOrigin,
  sinceOrigin,
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
  /** Full record name, a milestone's label included ("Head: Face up"). */
  label: string;
  /**
   * Entry cell. The first recorded moment is its bare name ("ROM"); each later
   * one carries the interval from the previous one ("ROM to Crown: 00:03:12").
   * System rows (event boundaries) show their label.
   */
  entry: string;
  time: string;
  /** Elapsed from the recording origin in the timeline; from session start in the appendix. */
  elapsed: string;
  group: string;
  flags: string[];
  isSystem: boolean;
  /** A milestone's label, then the flags. Shown in the Notes section. */
  notes: string[];
};

/** One row of the on-screen timeline table (#, Entry, Time). */
export type ScreenTimelineRow = {
  key: string;
  index: number;
  entry: string;
  time: string;
  /** Null for system rows, which are not editable records. */
  momentId: string | null;
  isSystem: boolean;
};

export type ReportModel = {
  header: {
    sessionId: string;
    shortId: string;
    /** MM-DD-YYYY of the session start. */
    sessionDate: string;
    /** On-screen title: "Report for MM-DD-YYYY". */
    title: string;
    timezone: string;
    offsets: string;
    /** Finish (or now while active) minus the recording origin; a dash before any recorded moment. */
    totalElapsed: string;
    revision: number;
    generatedAt: string;
    inProgress: boolean;
  };
  /** Records and event boundaries. Finishes and resumptions live in appendix.finishes. */
  timeline: TimelineRow[];
  /** One line per timeline entry with notes: "Crown: label, Manual". */
  notes: string[];
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
  const origin = recordingOrigin(data.moments);
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
  // Entry names drop a milestone's label (it goes in Notes) so "Crown to Head" stays short.
  const spanName = (m: Moment) =>
    m.kind === 'milestone' && m.milestoneCode ? milestoneLabel(m.milestoneCode) : momentName(m, data.events);
  const previousIncluded = new Map<string, Moment | null>();
  let lastSeen: Moment | null = null;
  for (const m of sorted) {
    if (!isIncluded(m)) continue;
    previousIncluded.set(m.id, lastSeen);
    lastSeen = m;
  }
  /** `base` is what Elapsed counts from: the recording origin, or null for session start. */
  const toRow = (m: Moment, base: ElapsedMs | null): TimelineRow => {
    const flags: string[] = [];
    if (m.source === 'manual') flags.push('Manual');
    if (m.source === 'corrected') flags.push('Corrected');
    if (m.timingEstimated) flags.push('Estimated');
    if (m.snapshot?.quality === 'fallback') flags.push('Fallback clock');
    if (m.flaggedAccidental) flags.push('Accidental tap');
    flags.push(...(flagsByMoment.get(m.id) ?? []));
    const label = momentName(m, data.events);
    const included = isIncluded(m);
    const prev = previousIncluded.get(m.id) ?? null;
    const notes = m.kind === 'milestone' && m.label?.trim() ? [m.label.trim(), ...flags] : flags;
    return {
      momentId: m.id,
      sequence: m.captureSequence,
      label,
      time: formatTimestamp(effectiveWall(m), effectiveOffset(m, off0), sessionDate, off0),
      // A row before the origin (an event started before the first record) has no recorded time yet.
      elapsed: base !== null && effectiveElapsed(m) < base ? DASH : formatElapsed(sinceOrigin(effectiveElapsed(m), base)),
      group: groupName(m),
      flags,
      isSystem: !(m.kind === 'capture' || m.kind === 'milestone'),
      entry: !included
        ? label
        : prev
          ? `${spanName(prev)} to ${spanName(m)}: ${formatElapsed(effectiveElapsed(m) - effectiveElapsed(prev))}`
          : spanName(m),
      notes,
    };
  };

  const isFinishBoundary = (m: Moment) => m.kind === 'finish' || m.kind === 'resume';
  const timeline = sorted
    .filter((m) => !isFinishBoundary(m) && (!(m.kind === 'capture' || m.kind === 'milestone') || isIncluded(m)))
    .map((m) => toRow(m, origin));
  const excluded = sorted.filter((m) => m.flaggedAccidental).map((m) => toRow(m, null));
  const notes = timeline.flatMap((row) => {
    if (!row.notes.length) return [];
    const m = data.moments.find((x) => x.id === row.momentId);
    return [`${m ? spanName(m) : row.label}: ${row.notes.join(', ')}`];
  });

  const total = recordedTotal(session.finishElapsedMs ?? nowElapsed, origin);
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

  const finishes = sortByEffective(data.moments.filter(isFinishBoundary)).map((m) => {
    // A resumption carries the gap since the finish before it.
    const priorFinish =
      m.kind === 'resume'
        ? sorted.filter((x) => x.kind === 'finish' && effectiveElapsed(x) <= effectiveElapsed(m)).pop()
        : undefined;
    return {
      label:
        m.kind === 'finish'
          ? 'Finished'
          : priorFinish
            ? `Resumed (gap ${formatElapsed(effectiveElapsed(m) - effectiveElapsed(priorFinish))})`
            : 'Resumed',
      time: formatTimestamp(effectiveWall(m), effectiveOffset(m, off0), sessionDate, off0),
      elapsed: formatElapsed(effectiveElapsed(m)),
    };
  });

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
      title: `Report for ${sessionDate}`,
      timezone: session.startedSnapshot.timezoneId,
      offsets: [...offsets].map(formatOffset).join(', '),
      totalElapsed: total === null ? DASH : formatElapsed(total),
      revision: session.revision,
      generatedAt: formatDateTime(generatedAt, off0),
      inProgress: session.status === 'active',
    },
    timeline,
    notes,
    events,
    apgar,
    appendix: { excluded, corrected, finishes, flags },
    changeHistory,
    footer: REPORT_FOOTER,
  };
}

/**
 * Rows for the on-screen timeline table, numbered from 1. The PDF keeps
 * capture sequence numbers instead.
 */
export function screenTimeline(r: ReportModel): ScreenTimelineRow[] {
  return r.timeline.map((row, i) => ({
    key: row.momentId,
    index: i + 1,
    entry: row.entry,
    time: row.time,
    momentId: row.isSystem ? null : row.momentId,
    isSystem: row.isSystem,
  }));
}

/** Birthmark_2026-10-07_142208_AB12_r3.pdf; year first so files sort by date. */
export function reportFileName(data: SessionData): string {
  const s = data.session.startedSnapshot;
  const p = localParts(s.wallEpochMs, s.utcOffsetMinutes);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Birthmark_${p.year}-${pad(p.month)}-${pad(p.day)}_${pad(p.hour)}${pad(p.minute)}${pad(p.second)}_${data.session.shortId}_r${data.session.revision}.pdf`;
}
