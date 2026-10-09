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
import { headerShowsLabels, recordingBands, sinceTimerFonts } from '../ui/milestoneLayout';
import { saveStatusView } from '../ui/saveStatusView';
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
  // Width of the History / Finish bar; too narrow and the icons stack over the labels.
  const [barWidth, setBarWidth] = useState(0);
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
  const since = sinceTimerFonts(clockFont);
  const labels = headerShowsLabels(barWidth);
  const idle = saveStatusView(state.queue) === 'history';

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
        </View>

        <View style={[styles.row, { flex: bands.body }]}>
          <View style={styles.left}>
            <View
              style={keyboardUp ? styles.hidden : undefined}
              accessible
              accessibilityLabel={`${sinceHeading} ${sinceLast === null ? 'none' : formatElapsed(sinceLast)}`}>
              <Text
                style={[styles.timerLabel, { fontSize: since.label, lineHeight: Math.round(since.label * 1.2) }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
                maxFontSizeMultiplier={1}>
                {sinceHeading}
              </Text>
              <Text
                style={[styles.timerValue, type.tabular, { fontSize: since.value, lineHeight: Math.round(since.value * 1.1) }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
                maxFontSizeMultiplier={1}>
                {sinceLast === null ? '—' : formatElapsed(sinceLast)}
              </Text>
            </View>
            <MilestoneRow
              mode={state.rowMode}
              onCapture={milestone}
              onApgar={() => setApgarOpen(true)}
              onShowAll={() => controller.showAllMilestones()}
            />
            <CaptureBar
              target={target}
              targetSave={target ? state.saveStates[target.id] : undefined}
              events={data.events}
              onSaveLabel={(id, text) => controller.labelMoment(id, text)}
              onDismiss={() => controller.dismissLabel()}
            />
          </View>

          <View style={styles.right}>
            {/* History holds the save-status slot: a pending or failed write
                replaces it with Saving / Not saved, at the same width, so the
                bar never reflows on a capture. */}
            <View style={styles.topBar} onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}>
              <View style={styles.slot}>
                {idle ? (
                  <Button
                    label="History"
                    icon="time-outline"
                    stacked={!labels}
                    variant="secondary"
                    style={styles.barButton}
                    accessibilityHint="Opens finished sessions. Recording keeps running."
                    onPress={() => router.push('/history')}
                    testID="record-history"
                  />
                ) : (
                  <SaveStatus queue={state.queue} onRetry={() => controller.retry()} />
                )}
              </View>
              <View style={styles.slot}>
                <Button
                  label="Finish"
                  icon="checkmark-circle"
                  stacked={!labels}
                  variant="primary"
                  style={styles.barButton}
                  onPress={() => setConfirmFinish(true)}
                  accessibilityHint="Asks before finishing"
                  testID="finish"
                />
              </View>
            </View>
            <LiveStatusPanel
              moments={data.moments}
              events={data.events}
              format={clockFormat}
              onEdit={setEditingId}
              onDelete={(id) => controller.setAccidental(id, true, null)}
            />
            <View style={styles.actions}>
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
  // flex comes from recordingBands(): 1 of 3 normally, 1 of 4 while the label box shows.
  clockBand: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  row: { flexDirection: 'row' },
  // Wider than the spec's 60/40 at the operator's request: bigger capture
  // buttons, a narrower recorded list.
  left: { flex: 65, paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.sm },
  right: {
    flex: 35,
    borderLeftWidth: 1,
    borderLeftColor: colors.line,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.sm,
  },
  // Sizes come from sinceTimerFonts(); these are the static parts.
  timerLabel: { fontWeight: '700', color: colors.slate, textTransform: 'uppercase', letterSpacing: 0.5 },
  timerValue: { fontWeight: '800', color: colors.ink },
  topBar: { flexDirection: 'row', gap: space.sm, alignItems: 'stretch' },
  slot: { flex: 1, justifyContent: 'center' },
  barButton: { paddingHorizontal: space.sm },
  actions: { flexDirection: 'row', gap: space.sm, alignItems: 'stretch' },
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
