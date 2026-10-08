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
import type { AssessmentPoint, ElapsedMs, Moment, RevisionAction, SessionData, WallMs } from '../domain/types';

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
};

export type ReportModel = {
  header: {
    sessionId: string;
    shortId: string;
    sessionDate: string;
    start: string;
    end: string;
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

export const REPORT_FOOTER =
  'Times captured from this device. Manually entered, corrected, or estimated values are identified.';

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
  const toRow = (m: Moment): TimelineRow => {
    const flags: string[] = [];
    if (m.source === 'manual') flags.push('Manual');
    if (m.source === 'corrected') flags.push('Corrected');
    if (m.timingEstimated) flags.push('Estimated');
    if (m.snapshot?.quality === 'fallback') flags.push('Fallback clock');
    if (m.flaggedAccidental) flags.push('Accidental tap');
    flags.push(...(flagsByMoment.get(m.id) ?? []));
    const interval = intervals.get(m.id);
    return {
      momentId: m.id,
      sequence: m.captureSequence,
      label: momentName(m, data.events),
      time: formatTimestamp(effectiveWall(m), effectiveOffset(m, off0), sessionDate, off0),
      elapsed: formatElapsed(effectiveElapsed(m)),
      interval: interval == null ? DASH : formatElapsed(interval),
      group: groupName(m),
      flags,
      isSystem: !(m.kind === 'capture' || m.kind === 'milestone'),
    };
  };

  const timeline = sorted.filter((m) => !(m.kind === 'capture' || m.kind === 'milestone') || isIncluded(m)).map(toRow);
  const excluded = sorted.filter((m) => m.flaggedAccidental).map(toRow);

  // A gap between a finish and its resumption is labelled in the timeline.
  for (const row of timeline) {
    const m = data.moments.find((x) => x.id === row.momentId);
    if (m?.kind !== 'resume') continue;
    const priorFinish = sorted.filter((x) => x.kind === 'finish' && effectiveElapsed(x) <= effectiveElapsed(m)).pop();
    if (priorFinish) row.label = `Resumed after finish (gap ${formatElapsed(effectiveElapsed(m) - effectiveElapsed(priorFinish))})`;
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

/** Birthmark_2026-10-07_142208_AB12_r3.pdf */
export function reportFileName(data: SessionData): string {
  const s = data.session.startedSnapshot;
  const p = localParts(s.wallEpochMs, s.utcOffsetMinutes);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Birthmark_${p.year}-${pad(p.month)}-${pad(p.day)}_${pad(p.hour)}${pad(p.minute)}${pad(p.second)}_${data.session.shortId}_r${data.session.revision}.pdf`;
}
