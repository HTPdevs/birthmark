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
