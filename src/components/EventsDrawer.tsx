import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { SessionController } from '../domain/sessionController';
import { formatElapsed } from '../domain/time';
import { eventDuration, eventName } from '../domain/timeline';
import { LABEL_GUIDANCE, LABEL_MAX_LENGTH, type ElapsedMs } from '../domain/types';
import { useControllerState } from '../state/store';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { colors, radius, space, type } from '../ui/theme';

type Props = {
  controller: SessionController;
  visible: boolean;
  nowElapsed: ElapsedMs;
  onClose: () => void;
};

/** Start, select, label, and end overlapping event timers without leaving recording. */
export function EventsDrawer({ controller, visible, nowElapsed, onClose }: Props) {
  const state = useControllerState(controller);
  const { events, moments } = state.data;
  const [labelFor, setLabelFor] = useState<string | null>(null);
  const [labelText, setLabelText] = useState('');
  const active = events.filter((e) => e.status === 'active');
  const ended = events.filter((e) => e.status === 'ended');

  const start = () => {
    const id = controller.startEvent();
    setLabelFor(id);
    setLabelText('');
  };

  const saveLabel = () => {
    if (labelFor && labelText.trim()) controller.labelEvent(labelFor, labelText);
    setLabelFor(null);
  };

  return (
    <Sheet visible={visible} title="Events" onClose={onClose} side="right">
      <Button label="Start event" variant="primary" large onPress={start} accessibilityHint="Starts a new event timer now" />
      <View style={styles.selectRow}>
        <Text style={styles.small}>New captures go to</Text>
        <Button
          label={state.selectedEventId === null ? 'Session (selected)' : 'Session'}
          variant={state.selectedEventId === null ? 'primary' : 'secondary'}
          onPress={() => controller.selectEvent(null)}
        />
      </View>

      {active.length === 0 ? <Text style={styles.small}>No active events.</Text> : null}
      {active.map((e) => {
        const selected = state.selectedEventId === e.id;
        const dur = eventDuration(e, moments, nowElapsed);
        return (
          <View key={e.id} style={[styles.card, selected && styles.cardSelected]}>
            <View style={styles.cardHead}>
              <Text style={styles.name} numberOfLines={1}>
                {eventName(e)}
              </Text>
              <Text style={[styles.duration, type.tabular]}>{dur === null ? '' : formatElapsed(dur)}</Text>
            </View>
            {labelFor === e.id ? (
              <View style={styles.labelRow}>
                <TextInput
                  value={labelText}
                  onChangeText={setLabelText}
                  placeholder={`Event ${e.number}`}
                  placeholderTextColor={colors.slate}
                  maxLength={LABEL_MAX_LENGTH}
                  style={styles.input}
                  onSubmitEditing={saveLabel}
                  accessibilityLabel={`Label for event ${e.number}`}
                  accessibilityHint={LABEL_GUIDANCE}
                  autoCorrect={false}
                />
                <Button label="Save" onPress={saveLabel} />
              </View>
            ) : null}
            <View style={styles.actions}>
              <Button
                label={selected ? 'Selected' : 'Select'}
                variant={selected ? 'primary' : 'secondary'}
                onPress={() => controller.selectEvent(e.id)}
                accessibilityHint="Groups new captures into this event"
              />
              {labelFor !== e.id ? (
                <Button
                  label="Label"
                  variant="ghost"
                  onPress={() => {
                    setLabelFor(e.id);
                    setLabelText(e.label ?? '');
                  }}
                />
              ) : null}
              <Button label="End" variant="danger" onPress={() => controller.endEvent(e.id)} accessibilityHint="Ends only this event now" />
            </View>
          </View>
        );
      })}
      {labelFor ? <Text style={styles.small}>{LABEL_GUIDANCE}</Text> : null}

      {ended.length ? <Text style={styles.section}>Ended</Text> : null}
      {ended.map((e) => {
        const dur = eventDuration(e, moments, nowElapsed);
        return (
          <View key={e.id} style={[styles.cardHead, styles.endedRow]}>
            <Text style={styles.endedName} numberOfLines={1}>
              {eventName(e)}
            </Text>
            <Text style={[styles.endedName, type.tabular]}>{dur === null ? '' : formatElapsed(dur)}</Text>
          </View>
        );
      })}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  selectRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, justifyContent: 'space-between' },
  small: { color: colors.slate, fontSize: 15 },
  card: { borderWidth: 2, borderColor: colors.line, borderRadius: radius.md, padding: space.md, gap: space.sm },
  cardSelected: { borderColor: colors.ink },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  name: { fontSize: 20, fontWeight: '800', color: colors.ink, flexShrink: 1 },
  duration: { fontSize: 20, fontWeight: '700', color: colors.ink },
  actions: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  labelRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  input: {
    flex: 1,
    minHeight: 48,
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    fontSize: 17,
    color: colors.ink,
  },
  section: { fontSize: 15, fontWeight: '700', color: colors.slate, marginTop: space.sm },
  endedRow: { paddingVertical: space.xs, borderBottomWidth: 1, borderBottomColor: colors.mist },
  endedName: { fontSize: 17, color: colors.slate },
});
