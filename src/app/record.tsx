import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApgarEditor } from '../components/ApgarEditor';
import { BigClock } from '../components/BigClock';
import { CaptureBar } from '../components/CaptureBar';
import { CorrectionSheet } from '../components/CorrectionSheets';
import { ActionTile, EmergencyControl } from '../components/EmergencyControl';
import { LiveStatusPanel } from '../components/LiveStatusPanel';
import { MilestoneRow } from '../components/MilestoneRow';
import { SaveStatus } from '../components/SaveStatus';
import type { SessionController } from '../domain/sessionController';
import { formatElapsed } from '../domain/time';
import { sinceLastHeading, sinceLastMoment } from '../domain/timeline';
import type { MilestoneCode, RowMilestoneCode } from '../domain/types';
import { appStore, useAppState, useClockTick, useControllerState } from '../state/store';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { BOTTOM_ROW_HEIGHT, recordingBands, sinceTimerFonts } from '../ui/milestoneLayout';
import { colors, space, type } from '../ui/theme';

export default function RecordScreen() {
  const { active } = useAppState();
  if (!active) return <Redirect href="/" />;
  return <Recording controller={active} />;
}

function tap() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

function Recording({ controller }: { controller: SessionController }) {
  useKeepAwake('recording');
  const state = useControllerState(controller);
  const { clockFormat } = useAppState();
  const snapshot = useClockTick();
  const [apgarOpen, setApgarOpen] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [finishing, setFinishing] = useState(false);
  // Moment opened from the live status panel's pencil for a time correction or accidental-tap flag.
  const [editingId, setEditingId] = useState<string | null>(null);
  // Fitted clock font, so "Time since" scales with it and never outgrows it.
  const [clockFont, setClockFont] = useState(72);
  // Measured "Time since" box, so its fonts are fitted to it (see sinceTimerFonts).
  const [sinceBox, setSinceBox] = useState({ width: 0, height: 0 });
  const keyboardUp = useKeyboardVisible();

  const { data } = state;
  const elapsed = controller.elapsedAt(snapshot);

  // Finish was confirmed but has not committed (e.g. a write failed). Capture is
  // closed; the operator can only retry until the finish is durable.
  if (data.session.status !== 'active') {
    return (
      <SafeAreaView style={[styles.screen, styles.finishing]}>
        <Text style={styles.finishingTitle}>Finishing session</Text>
        <Text style={styles.finishingBody}>
          {state.queue.failed
            ? 'The finish is not saved yet. Retry to save it. Nothing recorded has been lost.'
            : 'Saving the finish.'}
        </Text>
        <SaveStatus queue={state.queue} onRetry={() => controller.retry()} />
      </SafeAreaView>
    );
  }
  const sinceLast = sinceLastMoment(data.moments, elapsed);
  const sinceHeading = sinceLastHeading(data.moments, data.events);
  const target = state.labelTargetId ? data.moments.find((m) => m.id === state.labelTargetId) ?? null : null;
  const bands = recordingBands(target !== null);
  const sinceValue = sinceLast === null ? '—' : formatElapsed(sinceLast);
  // Destructured: Reanimated's dev Babel plugin warns about any `x.value` in an
  // inline style, mistaking it for a shared value read.
  const { label: sinceLabelFont, value: sinceValueFont } = sinceTimerFonts(clockFont, {
    ...sinceBox,
    label: sinceHeading,
    value: sinceValue,
  });

  const milestone = (code: RowMilestoneCode | Extract<MilestoneCode, 'RESUSCITATE'>) => {
    controller.markMilestone(code);
    tap();
  };

  const finish = async () => {
    setFinishing(true);
    try {
      const id = await appStore.finishActive();
      setConfirmFinish(false);
      router.replace({ pathname: '/report/[id]', params: { id } });
    } finally {
      setFinishing(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.column}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}>
        {/* Real-time clock across the full width, about the top third. It and
            the Time since block step aside while the keyboard is up, so the
            label input above the keyboard is never clipped on a phone. */}
        <View style={[styles.clockBand, { flex: bands.clock }, keyboardUp && styles.hidden]}>
          <BigClock
            snapshot={snapshot}
            format={clockFormat}
            onToggle={() => appStore.toggleClockFormat()}
            onFontSize={setClockFont}
          />
          {/* Finish shares the clock's row, bottom right. A pending or failed
              write shows Saving / Not saved above it; nothing while idle. */}
          <View style={styles.clockSide}>
            <SaveStatus queue={state.queue} onRetry={() => controller.retry()} idleHistory={false} />
            <Button
              label="Finish"
              icon="checkmark-circle"
              variant="primary"
              onPress={() => setConfirmFinish(true)}
              accessibilityHint="Asks before finishing"
              testID="finish"
            />
          </View>
        </View>

        {/* Under the clock: "Time since" (and the label box when a capture
            needs one) on the left, the latest capture on the right. */}
        <View style={[styles.row, { flex: bands.body }]}>
          <View style={styles.left}>
            <View
              style={[styles.sinceBox, keyboardUp && styles.hidden]}
              onLayout={(e) => {
                const width = Math.floor(e.nativeEvent.layout.width);
                const height = Math.floor(e.nativeEvent.layout.height);
                if (Math.abs(width - sinceBox.width) > 1 || Math.abs(height - sinceBox.height) > 1) {
                  setSinceBox({ width, height });
                }
              }}
              accessible
              accessibilityLabel={`${sinceHeading} ${sinceLast === null ? 'none' : sinceValue}`}>
              {/* Sized by sinceTimerFonts, not adjustsFontSizeToFit, which on
                  iOS collapsed the value to a few points in this flex box. */}
              <Text
                style={[styles.timerLabel, { fontSize: sinceLabelFont, lineHeight: Math.round(sinceLabelFont * 1.2) }]}
                numberOfLines={1}
                maxFontSizeMultiplier={1}>
                {sinceHeading}
              </Text>
              <Text
                style={[styles.timerValue, type.tabular, { fontSize: sinceValueFont, lineHeight: Math.round(sinceValueFont * 1.1) }]}
                numberOfLines={1}
                maxFontSizeMultiplier={1}>
                {sinceValue}
              </Text>
            </View>
            <CaptureBar
              target={target}
              targetSave={target ? state.saveStates[target.id] : undefined}
              events={data.events}
              onSaveLabel={(id, text) => controller.labelMoment(id, text)}
              onDismiss={() => controller.dismissLabel()}
            />
          </View>

          <View style={styles.right}>
            <LiveStatusPanel
              moments={data.moments}
              events={data.events}
              format={clockFormat}
              onEdit={setEditingId}
              onDelete={(id) => controller.setAccidental(id, true, null)}
            />
          </View>
        </View>

        {/* Bottom row: milestone buttons inline with Resuscitate and Emergency,
            on the same 65/35 split so the column divider runs straight down. */}
        <View style={[styles.row, styles.bottom]}>
          <View style={[styles.left, styles.bottomLeft]}>
            <MilestoneRow
              mode={state.rowMode}
              onCapture={milestone}
              onApgar={() => setApgarOpen(true)}
              onShowAll={() => controller.showAllMilestones()}
            />
          </View>
          <View style={[styles.right, styles.actions]}>
            <ActionTile
              label="Resuscitate"
              variant="warning"
              onPress={() => milestone('RESUSCITATE')}
              accessibilityHint="Records the Resuscitate milestone now"
              testID="resuscitate"
            />
            <EmergencyControl style={styles.emergency} />
          </View>
        </View>
      </KeyboardAvoidingView>

      <ApgarEditor controller={controller} visible={apgarOpen} onClose={() => setApgarOpen(false)} />
      <CorrectionSheet controller={controller} momentId={editingId} onClose={() => setEditingId(null)} />
      <ConfirmDialog
        visible={confirmFinish}
        title="Finish session"
        message={
          state.queue.failed
            ? 'Some records are not saved yet. Finishing will wait until they are saved. Use Retry on the recording screen.'
            : 'End current session? You can edit entries and correct mistakes after clicking Finish'
        }
        confirmLabel={finishing ? 'Finishing' : 'Finish'}
        cancelLabel="Keep recording"
        onConfirm={finish}
        onCancel={() => setConfirmFinish(false)}
        busy={finishing}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  finishing: { alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xl },
  finishingTitle: { fontSize: 28, fontWeight: '800', color: colors.ink },
  finishingBody: { fontSize: 18, color: colors.slate, textAlign: 'center', maxWidth: 560 },
  column: { flex: 1 },
  // flex comes from recordingBands(): half normally, a quarter while the label box shows.
  clockBand: {
    flexDirection: 'row',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    paddingTop: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  row: { flexDirection: 'row' },
  // Wider than the spec's 60/40 at the operator's request: bigger capture
  // buttons, a narrower recorded column. Shared by the middle and bottom rows.
  left: { flex: 65, paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.sm },
  right: {
    flex: 35,
    borderLeftWidth: 1,
    borderLeftColor: colors.line,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.sm,
  },
  // Fills the left column above the label box; sinceTimerFonts() fits the text to it.
  sinceBox: { flex: 1, justifyContent: 'center' },
  // Fixed height: the milestone buttons and action tiles at MILESTONE_BUTTON_HEIGHT.
  bottom: { height: BOTTOM_ROW_HEIGHT },
  bottomLeft: { justifyContent: 'center' },
  // Sizes come from sinceTimerFonts(); these are the static parts.
  timerLabel: { fontWeight: '700', color: colors.slate, textTransform: 'uppercase', letterSpacing: 0.5 },
  timerValue: { fontWeight: '800', color: colors.ink },
  clockSide: { justifyContent: 'flex-end', alignItems: 'flex-end', gap: space.xs },
  actions: { flexDirection: 'row', alignItems: 'stretch' },
  emergency: { flex: 1 },
  hidden: { display: 'none' },
});

/** True while the software keyboard is shown. */
function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    // iOS fires the will* events early enough to lay out before the keyboard
    // covers anything; Android only has did*.
    const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subs = [Keyboard.addListener(show, () => setVisible(true)), Keyboard.addListener(hide, () => setVisible(false))];
    return () => subs.forEach((s) => s.remove());
  }, []);
  return visible;
}
