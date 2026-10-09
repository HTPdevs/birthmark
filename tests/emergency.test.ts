import {
  CALL_FALLBACK_MESSAGE,
  FINISH_FAILED_MESSAGE,
  type PhoneAdapter,
  demoCallNotice,
  emergencyConfirmMessage,
  emergencyFinishAndCall,
} from '@/domain/emergency';
import { SessionController } from '@/domain/sessionController';
import { migrate } from '@/storage/db';
import * as repo from '@/storage/repository';

import { FakeClock, uuid } from './helpers/fakeClock';
import { openTestDb } from './helpers/sqlite';

/** Mock adapter: records every URL it was asked to open. Never touches Linking. */
function mockPhone(over: Partial<PhoneAdapter> = {}) {
  const opened: string[] = [];
  const canOpenCalls: string[] = [];
  const phone: PhoneAdapter = {
    mode: 'live',
    canOpen: async (url) => {
      canOpenCalls.push(url);
      return true;
    },
    open: async (url) => {
      opened.push(url);
    },
    ...over,
  };
  return { phone, opened, canOpenCalls };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('emergency finish and call (L07, L11)', () => {
  it('dials even when the finish rejects, and reports the failure', async () => {
    const { phone, opened } = mockPhone();
    const { call, finished } = emergencyFinishAndCall({
      finish: () => Promise.reject(new Error('disk full')),
      phone,
    });
    expect(await call).toEqual({ kind: 'handed_off', url: 'tel:911' });
    expect(await finished).toEqual({ kind: 'failed', message: FINISH_FAILED_MESSAGE });
    expect(opened).toEqual(['tel:911']);
  });

  it('dials even when the finish throws synchronously', async () => {
    const { phone, opened } = mockPhone();
    const { call, finished } = emergencyFinishAndCall({
      finish: () => {
        throw new Error('No active session.');
      },
      phone,
    });
    expect((await call).kind).toBe('handed_off');
    expect((await finished).kind).toBe('failed');
    expect(opened).toEqual(['tel:911']);
  });

  it('requests the dial before the finish resolves (finish never commits)', async () => {
    const { phone, opened, canOpenCalls } = mockPhone();
    const pending = deferred<string>();
    let finishSettled = false;
    const { call, finished } = emergencyFinishAndCall({ finish: () => pending.promise, phone });
    void finished.then(() => (finishSettled = true));
    // The handler lookup starts synchronously, before anything is awaited.
    expect(canOpenCalls).toEqual(['tel:911']);
    expect(await call).toEqual({ kind: 'handed_off', url: 'tel:911' });
    expect(opened).toEqual(['tel:911']);
    await flush();
    expect(finishSettled).toBe(false);
    pending.resolve('s1');
    expect(await finished).toEqual({ kind: 'finished', sessionId: 's1' });
  });

  it('requests the dial before starting the finish', () => {
    const order: string[] = [];
    const { phone } = mockPhone({
      canOpen: async () => {
        order.push('dial');
        return true;
      },
    });
    emergencyFinishAndCall({
      finish: () => {
        order.push('finish');
        return new Promise<string>(() => {});
      },
      phone,
    });
    expect(order).toEqual(['dial', 'finish']);
  });

  it('calls finish and open exactly once per confirmation', async () => {
    const { phone, opened } = mockPhone();
    const finish = jest.fn(async () => 's1');
    const { call, finished } = emergencyFinishAndCall({ finish, phone });
    await call;
    await finished;
    expect(finish).toHaveBeenCalledTimes(1);
    expect(opened).toEqual(['tel:911']);
  });

  it('demo mode finishes the session and reports no call placed', async () => {
    const { phone, opened } = mockPhone({ mode: 'demo' });
    const { call, finished } = emergencyFinishAndCall({ finish: async () => 's1', phone });
    const result = await call;
    expect(result).toEqual({ kind: 'demo', url: 'tel:911' });
    expect(await finished).toEqual({ kind: 'finished', sessionId: 's1' });
    expect(opened).toEqual(['tel:911']);
    expect(demoCallNotice(result.kind === 'demo' ? result.url : '')).toBe('Demo - no call placed (tel:911).');
  });

  it('a phone adapter that throws still yields the fallback, never a rejection', async () => {
    const { phone } = mockPhone({
      mode: 'demo',
      open: async () => {
        throw new Error('boom');
      },
    });
    const { call, finished } = emergencyFinishAndCall({ finish: async () => 's1', phone });
    expect(await call).toEqual({ kind: 'unavailable', message: CALL_FALLBACK_MESSAGE });
    expect((await finished).kind).toBe('finished');
  });

  it('dials the test number when one is configured', async () => {
    const { phone, opened } = mockPhone();
    const { call } = emergencyFinishAndCall({ finish: async () => 's1', phone, number: '5550100' });
    expect(await call).toEqual({ kind: 'handed_off', url: 'tel:5550100' });
    expect(opened).toEqual(['tel:5550100']);
  });

  it('confirm copy names the number actually dialed', () => {
    expect(emergencyConfirmMessage('911')).toBe('You are about to dial 911 and end this session. Continue?');
    expect(emergencyConfirmMessage('5550100')).toBe(
      'You are about to dial 5550100 and end this session. Continue?',
    );
  });

  it('no copy uses an em dash', () => {
    for (const text of [emergencyConfirmMessage('911'), demoCallNotice('tel:911'), FINISH_FAILED_MESSAGE]) {
      expect(text).not.toContain('—');
    }
  });
});

describe('emergency against a real session controller', () => {
  async function setup() {
    const db = openTestDb();
    await migrate(db);
    const clock = new FakeClock();
    const c = await SessionController.start({ db, clock, uuid });
    return { db, clock, c };
  }

  it('finishes the session, adds only the finish boundary, and dials once', async () => {
    const { c, clock } = await setup();
    clock.advance(5_000);
    const before = c.getState().data.moments.map((m) => m.id);
    const { phone, opened } = mockPhone();
    const { call, finished } = emergencyFinishAndCall({
      finish: async () => {
        await c.finish();
        return c.sessionId;
      },
      phone,
    });
    expect((await call).kind).toBe('handed_off');
    expect(await finished).toEqual({ kind: 'finished', sessionId: c.sessionId });
    expect(opened).toEqual(['tel:911']);
    const data = c.getState().data;
    expect(data.session.status).toBe('finished');
    const added = data.moments.filter((m) => !before.includes(m.id));
    expect(added.map((m) => m.kind)).toEqual(['finish']);
  });

  it('a blocked write queue does not delay the dial; the finish waits for Retry', async () => {
    const { c, db } = await setup();
    db.failNext(/INSERT INTO moments/);
    const { phone, opened } = mockPhone();
    let outcome: unknown = null;
    const { call, finished } = emergencyFinishAndCall({
      finish: async () => {
        await c.finish();
        return c.sessionId;
      },
      phone,
    });
    void finished.then((o) => (outcome = o));
    expect((await call).kind).toBe('handed_off');
    expect(opened).toEqual(['tel:911']);
    await c.whenSaved();
    await flush();
    expect(c.getState().queue.failed).toBe(true);
    expect(outcome).toBeNull();
    // Not committed: the stored session is still active, so a relaunch resumes it.
    expect(await repo.getActiveSessionId(db)).toBe(c.sessionId);
    c.retry();
    expect(await finished).toEqual({ kind: 'finished', sessionId: c.sessionId });
    expect(await repo.getActiveSessionId(db)).toBeNull();
  });
});
