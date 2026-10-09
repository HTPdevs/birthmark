import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApgarEditor } from '../components/ApgarEditor';
import { BigClock } from '../components/BigClock';
import { CaptureBar } from '../components/CaptureBar';
import { EmergencyControl } from '../components/EmergencyControl';
import { LiveStatusPanel } from '../components/LiveStatusPanel';
import { MilestoneRow } from '../components/MilestoneRow';
import { SaveStatus } from '../components/SaveStatus';
import type { SessionController } from '../domain/sessionController';
import { formatElapsed } from '../domain/time';
import { sinceLastMoment } from '../domain/timeline';
import type { MilestoneCode, RowMilestoneCode } from '../domain/types';
import { appStore, useAppState, useClockTick, useControllerState } from '../state/store';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
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
  const activeEvents = data.events.filter((e) => e.status === 'active');
  const target = state.labelTargetId ? data.moments.find((m) => m.id === state.labelTargetId) ?? null : null;

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
        style={styles.row}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}>
        <View style={styles.left}>
          <BigClock snapshot={snapshot} format={clockFormat} onToggle={() => appStore.toggleClockFormat()} />
          <View style={styles.timers}>
            <View accessible accessibilityLabel={`Since last moment ${sinceLast === null ? 'none' : formatElapsed(sinceLast)}`}>
              <Text style={styles.timerLabel}>Since last moment</Text>
              <Text style={[styles.timerValue, type.tabular]}>{sinceLast === null ? '—' : formatElapsed(sinceLast)}</Text>
            </View>
          </View>
          <MilestoneRow
            mode={state.rowMode}
            onCapture={milestone}
            onShowAll={() => controller.showAllMilestones()}
          />
          <CaptureBar
            target={target}
            targetSave={target ? state.saveStates[target.id] : undefined}
            events={data.events}
            onResuscitate={() => milestone('RESUSCITATE')}
            onApgar={() => setApgarOpen(true)}
            onSaveLabel={(id, text) => controller.labelMoment(id, text)}
            onDismiss={() => controller.dismissLabel()}
          />
        </View>

        <View style={styles.right}>
          <View style={styles.topBar}>
            <SaveStatus queue={state.queue} onRetry={() => controller.retry()} />
            <Button
              label="Finish"
              variant="primary"
              onPress={() => setConfirmFinish(true)}
              accessibilityHint="Asks before finishing"
            />
          </View>
          <LiveStatusPanel moments={data.moments} events={data.events} format={clockFormat} />
          <View style={styles.emergency}>
            <EmergencyControl />
          </View>
        </View>
      </KeyboardAvoidingView>

      <ApgarEditor controller={controller} visible={apgarOpen} onClose={() => setApgarOpen(false)} />
      <ConfirmDialog
        visible={confirmFinish}
        title="Finish session?"
        message={
          state.queue.failed
            ? 'Some records are not saved yet. Finishing will wait until they are saved. Use Retry on the recording screen.'
            : `This ends the session${activeEvents.length ? ` and ${activeEvents.length} active event${activeEvents.length === 1 ? '' : 's'}` : ''} at the same moment. You can resume from the report if this was a mistake.`
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
  row: { flex: 1, flexDirection: 'row' },
  left: { flex: 6, paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.md },
  right: {
    flex: 4,
    borderLeftWidth: 1,
    borderLeftColor: colors.line,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.md,
  },
  timers: { flexDirection: 'row', gap: space.xl, alignItems: 'flex-end' },
  timerLabel: { fontSize: 14, fontWeight: '700', color: colors.slate, textTransform: 'uppercase', letterSpacing: 0.5 },
  timerValue: { fontSize: 30, fontWeight: '700', color: colors.ink },
  topBar: { flexDirection: 'row', gap: space.sm, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' },
  emergency: { alignItems: 'flex-end' },
});
