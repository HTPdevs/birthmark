import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  EMERGENCY_NUMBER,
  demoCallNotice,
  emergencyConfirmMessage,
  emergencyFinishAndCall,
} from '../domain/emergency';
import { TEST_CALL_NUMBER, phoneAdapter } from '../platform/phone';
import { appStore } from '../state/store';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Sheet } from '../ui/Sheet';
import { colors, space } from '../ui/theme';

/**
 * Protected Emergency action. No or dismissal changes nothing. Yes requests the
 * phone handoff and finishes the active session at the same time; the call never
 * waits on the finish. It never records a moment and never claims a call connected.
 */
export function EmergencyControl() {
  const [confirming, setConfirming] = useState(false);
  const [notices, setNotices] = useState<string[]>([]);
  const inFlight = useRef(false);
  const number = TEST_CALL_NUMBER ?? EMERGENCY_NUMBER;

  const yes = () => {
    // A second tap on Yes before the dialog closes must not dial twice.
    if (inFlight.current) return;
    inFlight.current = true;
    setConfirming(false);
    const controller = appStore.getState().active;
    const { call, finished } = emergencyFinishAndCall({
      finish: () => appStore.finishActive(),
      phone: phoneAdapter,
      number,
    });
    // finish() flips the session out of 'active' synchronously, which swaps the
    // recording screen for the finishing view and unmounts this component. In that
    // case a Sheet here would never be seen, so call notices go to a native alert,
    // which survives the unmount and the navigation to the report.
    const screenStays = controller?.getState().data.session.status === 'active';
    const show = (text: string) => {
      if (screenStays) setNotices((n) => [...n, text]);
      else Alert.alert('Emergency', text);
    };

    void call.then((result) => {
      if (result.kind === 'demo') show(demoCallNotice(result.url));
      if (result.kind === 'unavailable') show(result.message);
    });
    void finished.then((outcome) => {
      inFlight.current = false;
      if (outcome.kind === 'finished') {
        router.replace({ pathname: '/report/[id]', params: { id: outcome.sessionId } });
      } else {
        show(outcome.message);
      }
    });
  };

  return (
    <View>
      {TEST_CALL_NUMBER ? <Text style={styles.test}>TEST BUILD: dials {TEST_CALL_NUMBER}</Text> : null}
      <Button
        label="Emergency"
        variant="emergency"
        large
        onPress={() => setConfirming(true)}
        accessibilityHint={`Asks before calling ${number} and ending the session`}
        testID="emergency"
      />
      <ConfirmDialog
        visible={confirming}
        title="Are you sure?"
        message={emergencyConfirmMessage(number)}
        confirmLabel="Yes"
        cancelLabel="No"
        confirmVariant="emergency"
        onConfirm={yes}
        onCancel={() => setConfirming(false)}
      />
      <Sheet visible={notices.length > 0} title="Emergency" onClose={() => setNotices([])} width="50%">
        {notices.map((text, i) => (
          <Text key={i} style={styles.notice}>
            {text}
          </Text>
        ))}
        <Text style={styles.sub}>Recording is still running.</Text>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  test: { color: colors.danger, fontWeight: '800', fontSize: 13, textAlign: 'right', marginBottom: space.xs },
  notice: { fontSize: 22, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 16, color: colors.slate },
});
