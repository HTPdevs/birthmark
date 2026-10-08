import { Linking, Platform } from 'react-native';

import type { PhoneAdapter } from '../domain/emergency';

/**
 * EXPO_PUBLIC_PHONE_MODE=live enables the real handoff in development builds.
 * Release builds are always live. Development defaults to demo so testing never
 * places an emergency call.
 */
const mode: PhoneAdapter['mode'] =
  !__DEV__ || process.env.EXPO_PUBLIC_PHONE_MODE === 'live' ? 'live' : 'demo';

/** Non-emergency number for a clearly identified physical-device test build. */
export const TEST_CALL_NUMBER = process.env.EXPO_PUBLIC_TEST_CALL_NUMBER || null;

export const phoneAdapter: PhoneAdapter = {
  mode,
  // iOS answers canOpenURL for tel: (declared in LSApplicationQueriesSchemes).
  // Android package visibility makes canOpenURL unreliable, so it relies on
  // openURL rejecting when no handler exists.
  canOpen: (url) => (Platform.OS === 'ios' ? Linking.canOpenURL(url) : Promise.resolve(true)),
  open: async (url) => {
    if (mode === 'demo') return;
    await Linking.openURL(url);
  },
};
