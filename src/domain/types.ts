// Distinct branded number types so wall-clock instants, monotonic clock readings,
// and elapsed session durations cannot be mixed by accident.
export type WallMs = number & { readonly __brand: 'WallMs' };
export type ContinuousMs = number & { readonly __brand: 'ContinuousMs' };
export type ElapsedMs = number & { readonly __brand: 'ElapsedMs' };

export const wallMs = (n: number) => n as WallMs;
export const continuousMs = (n: number) => n as ContinuousMs;
export const elapsedMs = (n: number) => n as ElapsedMs;

export type TimeSourceQuality = 'native' | 'fallback';

export type ClockSnapshot = {
  wallEpochMs: WallMs;
  continuousMs: ContinuousMs;
  timezoneId: string;
  utcOffsetMinutes: number;
  bootId: string | null;
  quality: TimeSourceQuality;
};

/** Maps a continuous clock reading to session elapsed time. */
export type ClockAnchor = {
  elapsedAtAnchorMs: ElapsedMs;
  anchorContinuousMs: ContinuousMs;
  anchorWallMs: WallMs;
  bootId: string | null;
  quality: TimeSourceQuality;
  /** True when this anchor was established from a wall-clock recovery estimate. */
  estimated: boolean;
};

/** Last observed clock state, persisted for recovery and clock-change detection. */
export type Checkpoint = {
  wallEpochMs: WallMs;
  continuousMs: ContinuousMs;
  elapsedMs: ElapsedMs;
  timezoneId: string;
  utcOffsetMinutes: number;
  bootId: string | null;
};

export type SessionStatus = 'active' | 'finished';

export type Session = {
  id: string;
  shortId: string;
  status: SessionStatus;
  startedSnapshot: ClockSnapshot;
  finishSnapshot: ClockSnapshot | null;
  finishElapsedMs: ElapsedMs | null;
  anchor: ClockAnchor;
  checkpoint: Checkpoint;
  revision: number;
  createdAt: WallMs;
  schemaVersion: number;
};

export const MILESTONES = [
  { code: 'ROM', label: 'ROM' },
  { code: 'CROWN', label: 'Crown' },
  { code: 'HEAD', label: 'Head' },
  { code: 'BODY', label: 'Body' },
  { code: 'FIRST_CRY', label: 'First Cry' },
  { code: 'RESUSCITATE', label: 'Resuscitate' },
  { code: 'APGAR', label: 'APGAR' },
  { code: 'SEPARATION_GUSH', label: 'Separation Gush' },
  { code: 'PLACENTA', label: 'Placenta' },
] as const;

export type MilestoneCode = (typeof MILESTONES)[number]['code'];

export const FULL_ROW: MilestoneCode[] = [
  'ROM',
  'CROWN',
  'HEAD',
  'BODY',
  'FIRST_CRY',
  'RESUSCITATE',
  'APGAR',
];
export const POST_FIRST_CRY_ROW: MilestoneCode[] = ['SEPARATION_GUSH', 'PLACENTA', 'APGAR'];

export function milestoneLabel(code: MilestoneCode): string {
  return MILESTONES.find((m) => m.code === code)?.label ?? code;
}

/**
 * capture: generic "Mark moment / Other". milestone: preset button.
 * event_start / event_end / finish / resume: system boundaries that appear in the
 * timeline but never count as included moments.
 */
export type MomentKind = 'capture' | 'milestone' | 'event_start' | 'event_end' | 'finish' | 'resume';
export type MomentSource = 'captured' | 'manual' | 'corrected';

export type Moment = {
  id: string;
  sessionId: string;
  eventId: string | null;
  captureSequence: number;
  kind: MomentKind;
  /** Sequential number for generic captures ("Moment 3"); never renumbered. */
  momentNumber: number | null;
  /** Null only for manually added moments, which were never captured. */
  snapshot: ClockSnapshot | null;
  originalElapsedMs: ElapsedMs | null;
  effectiveWallMs: WallMs | null;
  effectiveElapsedMs: ElapsedMs | null;
  label: string | null;
  source: MomentSource;
  flaggedAccidental: boolean;
  milestoneCode: MilestoneCode | null;
  timingEstimated: boolean;
};

export type EventStatus = 'active' | 'ended';

export type SessionEvent = {
  id: string;
  sessionId: string;
  number: number;
  label: string | null;
  startMomentId: string;
  endMomentId: string | null;
  status: EventStatus;
  endedBySessionFinish: boolean;
};

export type AssessmentPoint = 'one_minute' | 'five_minute';

export type Assessment = {
  id: string;
  sessionId: string;
  assessmentPoint: AssessmentPoint;
  score: number;
};

export type RevisionAction =
  | 'label'
  | 'flag_accidental'
  | 'unflag_accidental'
  | 'add_manual'
  | 'correct_time'
  | 'finish'
  | 'resume'
  | 'assessment'
  | 'event_label';

export type Revision = {
  id: string;
  sessionId: string;
  momentId: string | null;
  assessmentId: string | null;
  eventId: string | null;
  action: RevisionAction;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  changedAt: WallMs;
  revisionNumber: number;
};

export type TimingFlagType = 'clock_change' | 'timezone_change' | 'recovery_estimate' | 'manual_time';

export type TimingFlag = {
  id: string;
  sessionId: string;
  momentId: string | null;
  type: TimingFlagType;
  /** Elapsed interval the flag applies to. */
  fromElapsedMs: ElapsedMs | null;
  toElapsedMs: ElapsedMs | null;
  wallDeltaMs: number | null;
  continuousDeltaMs: number | null;
  detail: string | null;
  createdAt: WallMs;
};

export type ExportRecord = {
  id: string;
  sessionId: string;
  revisionNumber: number;
  generatedAt: WallMs;
  cachedFilePath: string | null;
};

/** Everything persisted for one session. */
export type SessionData = {
  session: Session;
  moments: Moment[];
  events: SessionEvent[];
  assessments: Assessment[];
  revisions: Revision[];
  flags: TimingFlag[];
  exports: ExportRecord[];
};

export const LABEL_MAX_LENGTH = 80;
export const LABEL_GUIDANCE = 'Use event labels only. Do not enter names or identifying details.';
