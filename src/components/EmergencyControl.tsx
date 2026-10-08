import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EMERGENCY_NUMBER, requestEmergencyCall } from '../domain/emergency';
import { TEST_CALL_NUMBER, phoneAdapter } from '../platform/phone';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Sheet } from '../ui/Sheet';
import { colors, space } from '../ui/theme';

/**
 * Protected Emergency action. No or dismissal changes nothing. Yes hands off to
 * the system phone app; it never records a moment and never claims a call connected.
 */
export function EmergencyControl() {
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const number = TEST_CALL_NUMBER ?? EMERGENCY_NUMBER;

  const yes = async () => {
    setConfirming(false);
    const result = await requestEmergencyCall(phoneAdapter, number);
    if (result.kind === 'demo') setNotice(`Demo — no call placed (${result.url}).`);
    if (result.kind === 'unavailable') setNotice(result.message);
  };

  return (
    <View>
      {TEST_CALL_NUMBER ? <Text style={styles.test}>TEST BUILD: dials {TEST_CALL_NUMBER}</Text> : null}
      <Button
        label="Emergency"
        variant="emergency"
        large
        onPress={() => setConfirming(true)}
        accessibilityHint={`Asks before opening the phone app to call ${number}`}
        testID="emergency"
      />
      <ConfirmDialog
        visible={confirming}
        title="Are you sure?"
        message={`Yes opens the phone app to call ${number}. Complete any confirmation there. Session timing continues. No moment is recorded.`}
        confirmLabel="Yes"
        cancelLabel="No"
        confirmVariant="emergency"
        onConfirm={yes}
        onCancel={() => setConfirming(false)}
      />
      <Sheet visible={notice !== null} title="Emergency" onClose={() => setNotice(null)} width="50%">
        <Text style={styles.notice}>{notice}</Text>
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
