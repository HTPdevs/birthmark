export const EMERGENCY_NUMBER = '911';

export type PhoneAdapter = {
  /** 'live' opens the system phone app; 'demo' never places a call. */
  mode: 'live' | 'demo';
  canOpen(url: string): Promise<boolean>;
  open(url: string): Promise<void>;
};

export type EmergencyResult =
  /** The system phone interface was requested. This is not evidence a call connected. */
  | { kind: 'handed_off'; url: string }
  | { kind: 'demo'; url: string }
  | { kind: 'unavailable'; message: string };

export const CALL_FALLBACK_MESSAGE = `Call ${EMERGENCY_NUMBER} using another phone.`;

/**
 * Hands off to the system phone interface after the operator confirmed "Yes".
 * Never creates a moment or touches session timing.
 */
export async function requestEmergencyCall(
  phone: PhoneAdapter,
  number: string = EMERGENCY_NUMBER,
): Promise<EmergencyResult> {
  const url = `tel:${number}`;
  if (phone.mode === 'demo') {
    await phone.open(url);
    return { kind: 'demo', url };
  }
  try {
    if (!(await phone.canOpen(url))) return { kind: 'unavailable', message: CALL_FALLBACK_MESSAGE };
    await phone.open(url);
    return { kind: 'handed_off', url };
  } catch {
    return { kind: 'unavailable', message: CALL_FALLBACK_MESSAGE };
  }
}

/** Confirm dialog copy. `number` is what will actually be dialed, so test builds don't claim 911. */
export function emergencyConfirmMessage(number: string): string {
  return `You are about to dial ${number} and end this session. Continue?`;
}

export function demoCallNotice(url: string): string {
  return `Demo - no call placed (${url}).`;
}

export const FINISH_FAILED_MESSAGE =
  'The call was started, but the session could not be finished. Finish it from the recording screen.';

export type EmergencyFinishOutcome =
  | { kind: 'finished'; sessionId: string }
  | { kind: 'failed'; message: string };

export type EmergencyFinishAndCall = {
  /** Settles when the phone handoff was requested (or found unavailable). Never rejects. */
  call: Promise<EmergencyResult>;
  /** Settles when the finish commits or fails. Never rejects; may stay pending while a write waits for Retry. */
  finished: Promise<EmergencyFinishOutcome>;
};

/**
 * Emergency "Yes": requests the call and finishes the active session at the same
 * time. The dial is requested first and never waits on the finish, so a slow or
 * failed write (disk full, blocked queue) cannot delay or block the call. The two
 * outcomes are returned separately so the caller can react to the call result
 * even while the finish is still waiting on storage. Creates no moment.
 */
export function emergencyFinishAndCall({
  finish,
  phone,
  number = EMERGENCY_NUMBER,
}: {
  /** Finishes the active session; resolves with its id once committed. */
  finish: () => Promise<string>;
  phone: PhoneAdapter;
  number?: string;
}): EmergencyFinishAndCall {
  const call = requestEmergencyCall(phone, number).catch(
    (): EmergencyResult => ({ kind: 'unavailable', message: CALL_FALLBACK_MESSAGE }),
  );
  let finished: Promise<EmergencyFinishOutcome>;
  try {
    finished = finish().then(
      (sessionId): EmergencyFinishOutcome => ({ kind: 'finished', sessionId }),
      (): EmergencyFinishOutcome => ({ kind: 'failed', message: FINISH_FAILED_MESSAGE }),
    );
  } catch {
    // A synchronous throw from finish must not escape: the call is already requested.
    finished = Promise.resolve({ kind: 'failed', message: FINISH_FAILED_MESSAGE });
  }
  return { call, finished };
}
