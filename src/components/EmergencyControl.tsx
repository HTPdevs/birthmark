import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { type ReactNode, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import {
  EMERGENCY_NUMBER,
  demoCallNotice,
  emergencyConfirmMessage,
  emergencyFinishAndCall,
} from '../domain/emergency';
import { TEST_CALL_NUMBER, phoneAdapter } from '../platform/phone';
import { appStore } from '../state/store';
import type { IconName } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Sheet } from '../ui/Sheet';
import { TOUCH, colors, radius, space } from '../ui/theme';

type TileVariant = 'warning' | 'emergency';

/**
 * Large action with the icon stacked over the label, for the narrow right column
 * where two actions share one row (Resuscitate and Emergency). A side-by-side
 * icon and label at 22pt does not fit a ~115pt slot on a landscape phone; stacked,
 * the label gets the full slot width and shrinks to fit rather than wrapping
 * mid-word. Fills its parent's height so both tiles in a row are equal.
 */
export function ActionTile({
  label,
  icon,
  variant,
  onPress,
  accessibilityHint,
  testID,
  style,
  children,
}: {
  label: string;
  icon?: IconName;
  variant: TileVariant;
  onPress: () => void;
  accessibilityHint: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  /** Extra small line under the label (test-build notice). */
  children?: ReactNode;
}) {
  const fg = variant === 'warning' ? colors.paper : colors.onAccent;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [tile.base, tile[variant], pressed && tile.pressed, style]}>
      {icon ? <Ionicons name={icon} size={26} color={fg} accessible={false} /> : null}
      <Text
        style={[tile.label, { color: fg }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
      {children}
    </Pressable>
  );
}

const tile = StyleSheet.create({
  base: {
    flex: 1,
    minHeight: 72,
    minWidth: TOUCH,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: space.xs,
    paddingVertical: space.sm,
  },
  warning: { backgroundColor: colors.warning },
  emergency: { backgroundColor: colors.accent },
  pressed: { opacity: 0.7 },
  label: { fontSize: 18, fontWeight: '800', textAlign: 'center', alignSelf: 'stretch' },
});

/**
 * Protected Emergency action. No or dismissal changes nothing. Yes requests the
 * phone handoff and finishes the active session at the same time; the call never
 * waits on the finish. It never records a moment and never claims a call connected.
 */
export function EmergencyControl({ style }: { style?: StyleProp<ViewStyle> }) {
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
    <View style={[styles.wrap, style]}>
      {/* "call", not "warning": the button hands off to the phone dialer, and the
          warning glyph would blur it with the rust Resuscitate tile beside it. */}
      <ActionTile
        label="Emergency"
        icon="call"
        variant="emergency"
        onPress={() => setConfirming(true)}
        accessibilityHint={`Asks before calling ${number} and ending the session`}
        testID="emergency">
        {TEST_CALL_NUMBER ? (
          <Text style={styles.test} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            TEST: dials {TEST_CALL_NUMBER}
          </Text>
        ) : null}
      </ActionTile>
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
  wrap: { flexDirection: 'row' },
  // Inside the coral tile, so the tile stays the same height as Resuscitate.
  test: { color: colors.onAccent, fontWeight: '800', fontSize: 12, textAlign: 'center', alignSelf: 'stretch' },
  notice: { fontSize: 22, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 16, color: colors.slate },
});
