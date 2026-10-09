import { CALL_FALLBACK_MESSAGE, type PhoneAdapter, requestEmergencyCall } from '@/domain/emergency';
import { deriveRowMode, liveStatus, momentName, sinceLastHeading, sinceLastMoment, sortByEffective } from '@/domain/timeline';
import {
  FULL_ROW,
  MILESTONES,
  type Moment,
  POST_FIRST_CRY_ROW,
  continuousMs,
  elapsedMs,
  milestoneLabel,
  wallMs,
} from '@/domain/types';
import { WriteQueue } from '@/storage/writeQueue';

let seq = 0;
function moment(partial: Partial<Moment> & { elapsed: number }): Moment {
  seq++;
  return {
    id: `m${seq}`,
    sessionId: 's',
    eventId: null,
    captureSequence: seq,
    kind: 'capture',
    momentNumber: seq,
    snapshot: {
      wallEpochMs: wallMs(partial.elapsed),
      continuousMs: continuousMs(partial.elapsed),
      timezoneId: 'UTC',
      utcOffsetMinutes: 0,
      bootId: 'b',
      quality: 'native',
    },
    originalElapsedMs: elapsedMs(partial.elapsed),
    effectiveWallMs: null,
    effectiveElapsedMs: null,
    label: null,
    source: 'captured',
    flaggedAccidental: false,
    milestoneCode: null,
    timingEstimated: false,
    ...partial,
  };
}

describe('milestone order (L04)', () => {
  it('uses the exact row order', () => {
    expect(FULL_ROW.map(milestoneLabel)).toEqual(['ROM', 'Crown', 'Head', 'Body', 'First Cry']);
    expect(POST_FIRST_CRY_ROW.map(milestoneLabel)).toEqual(['Separation Gush', 'Placenta']);
  });

  it('keeps Resuscitate and APGAR out of the swipe rows (they have dedicated buttons)', () => {
    for (const row of [FULL_ROW, POST_FIRST_CRY_ROW]) {
      expect(row).not.toContain('RESUSCITATE');
      expect(row).not.toContain('APGAR');
    }
    expect(milestoneLabel('RESUSCITATE')).toBe('Resuscitate');
    expect(milestoneLabel('APGAR')).toBe('APGAR');
  });

  it('leaves every milestone reachable from a row or a dedicated button', () => {
    const dedicated = ['RESUSCITATE', 'APGAR'];
    const reachable = new Set<string>([...FULL_ROW, ...POST_FIRST_CRY_ROW, ...dedicated]);
    expect([...reachable].sort()).toEqual(MILESTONES.map((m) => m.code).sort());
  });
});

describe('moment names', () => {
  it('keeps the milestone name when a label or note is added', () => {
    expect(momentName(moment({ elapsed: 0, kind: 'milestone', milestoneCode: 'CROWN' }), [])).toBe('Crown');
    expect(momentName(moment({ elapsed: 0, kind: 'milestone', milestoneCode: 'CROWN', label: 'slow' }), [])).toBe('Crown: slow');
    expect(momentName(moment({ elapsed: 0, kind: 'milestone', milestoneCode: 'CROWN', label: '  ' }), [])).toBe('Crown');
  });

  it('names the finish boundary Finish time', () => {
    expect(momentName(moment({ elapsed: 0, kind: 'finish', momentNumber: null }), [])).toBe('Finish time');
  });
});

describe('timeline ordering', () => {
  it('orders by elapsed then capture sequence for ties', () => {
    const a = moment({ elapsed: 1000 });
    const b = moment({ elapsed: 1000 });
    const c = moment({ elapsed: 500 });
    expect(sortByEffective([b, a, c]).map((m) => m.id)).toEqual([c.id, a.id, b.id]);
  });
});

describe('live status (L05)', () => {
  it('shows Crown above Head with a fixed Since Crown interval', () => {
    const crown = moment({ elapsed: 10_000, kind: 'milestone', milestoneCode: 'CROWN' });
    const generic = moment({ elapsed: 20_000 });
    const head = moment({ elapsed: 40_000, kind: 'milestone', milestoneCode: 'HEAD' });
    const s = liveStatus([crown, generic, head]);
    expect(s.history.map((m) => m.milestoneCode)).toEqual(['CROWN', 'HEAD']);
    expect(s.previous!.milestoneCode).toBe('CROWN');
    expect(s.sincePreviousMs).toBe(30_000);
  });

  it('shows no Since last moment value with no included moments', () => {
    const boundary = moment({ elapsed: 1000, kind: 'event_start' });
    const accidental = moment({ elapsed: 2000, flaggedAccidental: true });
    expect(sinceLastMoment([boundary, accidental], elapsedMs(5000))).toBeNull();
    const real = moment({ elapsed: 3000 });
    expect(sinceLastMoment([boundary, accidental, real], elapsedMs(5000))).toBe(2000);
  });
});

describe('time since heading', () => {
  it('names the last included record, skipping accidental taps and system rows', () => {
    expect(sinceLastHeading([], [])).toBe('Time since');
    const crown = moment({ elapsed: 1000, kind: 'milestone', milestoneCode: 'CROWN', label: 'slow' });
    expect(sinceLastHeading([crown], [])).toBe('Time since Crown');
    const head = moment({ elapsed: 2000, kind: 'milestone', milestoneCode: 'HEAD', flaggedAccidental: true });
    const finish = moment({ elapsed: 3000, kind: 'finish' });
    expect(sinceLastHeading([crown, head, finish], [])).toBe('Time since Crown');
    const cap = moment({ elapsed: 4000, label: 'Shoulders' });
    expect(sinceLastHeading([crown, head, finish, cap], [])).toBe('Time since Shoulders');
  });
});

describe('row mode', () => {
  it('ignores accidental First Cry taps', () => {
    const fc = moment({ elapsed: 1, kind: 'milestone', milestoneCode: 'FIRST_CRY', flaggedAccidental: true });
    expect(deriveRowMode([fc], null)).toBe('all');
  });
});

describe('emergency handoff (L07, L11)', () => {
  const adapter = (over: Partial<PhoneAdapter> = {}) => {
    const opened: string[] = [];
    const a: PhoneAdapter = {
      mode: 'live',
      canOpen: async () => true,
      open: async (url) => {
        opened.push(url);
      },
      ...over,
    };
    return { a, opened };
  };

  it('opens tel:911 exactly once on Yes', async () => {
    const { a, opened } = adapter();
    expect(await requestEmergencyCall(a)).toEqual({ kind: 'handed_off', url: 'tel:911' });
    expect(opened).toEqual(['tel:911']);
  });

  it('demo mode never reports a real handoff', async () => {
    const { a, opened } = adapter({ mode: 'demo' });
    expect((await requestEmergencyCall(a)).kind).toBe('demo');
    expect(opened).toEqual(['tel:911']);
  });

  it('reports an unavailable phone handler or a rejected handoff', async () => {
    const none = adapter({ canOpen: async () => false });
    expect(await requestEmergencyCall(none.a)).toEqual({ kind: 'unavailable', message: CALL_FALLBACK_MESSAGE });
    expect(none.opened).toEqual([]);
    const rejected = adapter({
      open: async () => {
        throw new Error('no handler');
      },
    });
    expect((await requestEmergencyCall(rejected.a)).kind).toBe('unavailable');
  });
});

describe('write queue', () => {
  it('runs ops in order and holds later ops behind a failure until retry', async () => {
    const log: string[] = [];
    let failOnce = true;
    const q = new WriteQueue({} as never);
    const saved: string[] = [];
    q.subscribe((_, ids) => saved.push(...ids));
    void q.enqueue({
      id: 'a',
      recordIds: ['a'],
      run: async () => {
        if (failOnce) {
          failOnce = false;
          throw new Error('disk full');
        }
        log.push('a');
      },
    });
    const b = q.enqueue({ id: 'b', recordIds: ['b'], run: async () => void log.push('b') });
    await q.whenIdle();
    expect(q.status()).toEqual({ pending: 2, failed: true, lastError: 'disk full' });
    expect(log).toEqual([]);
    q.retry();
    await b;
    expect(log).toEqual(['a', 'b']);
    expect(saved).toEqual(['a', 'b']);
    expect(q.status().pending).toBe(0);
  });
});
