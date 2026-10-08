import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { SessionController } from '../domain/sessionController';
import { formatDate, formatElapsed, formatTime24 } from '../domain/time';
import { effectiveElapsed, effectiveWall, eventName, momentName } from '../domain/timeline';
import { LABEL_GUIDANCE, LABEL_MAX_LENGTH, type Moment } from '../domain/types';
import { useControllerState } from '../state/store';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { colors, radius, space } from '../ui/theme';
import { ManualTimeFields, type ManualTimeDraft, draftToInput, initialDraft } from './ManualTimeFields';

function draftFor(m: Moment | null, fallbackWall: number, offset: number): ManualTimeDraft {
  const wall = m ? effectiveWall(m) ?? fallbackWall : fallbackWall;
  const elapsed = m ? formatElapsed(effectiveElapsed(m)) : '00:00:00';
  return initialDraft(formatDate(wall, offset), formatTime24(wall, offset), elapsed, offset);
}

/** Rename, flag/unflag, or correct the effective time of one moment. Originals are kept. */
export function CorrectionSheet({
  controller,
  momentId,
  onClose,
}: {
  controller: SessionController;
  momentId: string | null;
  onClose: () => void;
}) {
  const { data } = useControllerState(controller);
  const m = momentId ? data.moments.find((x) => x.id === momentId) ?? null : null;
  const offset = data.session.startedSnapshot.utcOffsetMinutes;
  const [label, setLabel] = useState(m?.label ?? '');
  const [draft, setDraft] = useState<ManualTimeDraft>(() => draftFor(m, data.session.startedSnapshot.wallEpochMs, offset));
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [lastId, setLastId] = useState(momentId);

  if (momentId !== lastId) {
    setLastId(momentId);
    setLabel(m?.label ?? '');
    setDraft(draftFor(m, data.session.startedSnapshot.wallEpochMs, offset));
    setReason('');
    setMessage(null);
  }

  if (!m) return null;
  const editable = m.kind === 'capture' || m.kind === 'milestone';

  const saveTime = () => {
    const input = draftToInput(draft);
    if ('error' in input) return setMessage(input.error);
    const r = controller.correctTime(m.id, input, reason.trim() || null);
    if (!r.ok) return setMessage(r.error);
    setMessage(r.ambiguous ? 'Saved as Manual time: a clock change is near this time.' : 'Time corrected.');
  };

  return (
    <Sheet visible={!!momentId} title={momentName(m, data.events)} onClose={onClose}>
      <Text style={styles.meta}>
        Captured {m.snapshot ? `${formatTime24(m.snapshot.wallEpochMs, m.snapshot.utcOffsetMinutes)} (${formatElapsed(m.originalElapsedMs ?? 0)})` : 'manually'}
        {m.source === 'corrected' ? ` · now ${formatElapsed(effectiveElapsed(m))}` : ''}
      </Text>
      {!editable ? (
        <Text style={styles.meta}>System records cannot be edited.</Text>
      ) : (
        <>
          <Text style={styles.section}>Label</Text>
          <View style={styles.row}>
            <TextInput
              value={label}
              onChangeText={setLabel}
              maxLength={LABEL_MAX_LENGTH}
              placeholder="Optional label"
              placeholderTextColor={colors.slate}
              style={styles.input}
              accessibilityLabel="Label"
              accessibilityHint={LABEL_GUIDANCE}
              autoCorrect={false}
            />
            <Button label="Save label" onPress={() => controller.labelMoment(m.id, label, reason.trim() || null)} />
          </View>
          <Text style={styles.hint}>{LABEL_GUIDANCE}</Text>

          <Text style={styles.section}>Accidental tap</Text>
          <Button
            label={m.flaggedAccidental ? 'Include again (unflag)' : 'Flag as accidental tap'}
            variant={m.flaggedAccidental ? 'secondary' : 'danger'}
            onPress={() => controller.setAccidental(m.id, !m.flaggedAccidental, reason.trim() || null)}
          />

          <Text style={styles.section}>Correct time</Text>
          <ManualTimeFields draft={draft} onChange={setDraft} />
          <Button label="Save corrected time" variant="primary" onPress={saveTime} />

          <Text style={styles.section}>Reason (optional)</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            maxLength={LABEL_MAX_LENGTH}
            style={styles.input}
            accessibilityLabel="Reason for change"
            autoCorrect={false}
          />
          {message ? <Text style={styles.message}>{message}</Text> : null}
        </>
      )}
    </Sheet>
  );
}

/** Adds a moment that was not captured live, marked Manual in every view. */
export function AddMissedSheet({
  controller,
  visible,
  onClose,
}: {
  controller: SessionController;
  visible: boolean;
  onClose: () => void;
}) {
  const { data } = useControllerState(controller);
  const offset = data.session.startedSnapshot.utcOffsetMinutes;
  const [draft, setDraft] = useState<ManualTimeDraft>(() => draftFor(null, data.session.startedSnapshot.wallEpochMs, offset));
  const [label, setLabel] = useState('');
  const [eventId, setEventId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const save = () => {
    const input = draftToInput(draft);
    if ('error' in input) return setMessage(input.error);
    const r = controller.addMissedMoment(input, label, eventId);
    if (!r.ok) return setMessage(r.error);
    setLabel('');
    setMessage(r.ambiguous ? 'Added as Manual time: a clock change is near this time.' : 'Missed moment added.');
  };

  return (
    <Sheet visible={visible} title="Add missed moment" onClose={onClose}>
      <ManualTimeFields draft={draft} onChange={setDraft} />
      <Text style={styles.section}>Label (optional)</Text>
      <TextInput
        value={label}
        onChangeText={setLabel}
        maxLength={LABEL_MAX_LENGTH}
        placeholder="Optional label"
        placeholderTextColor={colors.slate}
        style={styles.input}
        accessibilityHint={LABEL_GUIDANCE}
        autoCorrect={false}
      />
      <Text style={styles.hint}>{LABEL_GUIDANCE}</Text>
      <Text style={styles.section}>Group</Text>
      <View style={styles.groups}>
        <Button label="Session" variant={eventId === null ? 'primary' : 'secondary'} onPress={() => setEventId(null)} />
        {data.events.map((e) => (
          <Button
            key={e.id}
            label={eventName(e)}
            variant={eventId === e.id ? 'primary' : 'secondary'}
            onPress={() => setEventId(e.id)}
          />
        ))}
      </View>
      <Button label="Add moment" variant="primary" onPress={save} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  meta: { fontSize: 16, color: colors.slate },
  section: { fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: space.sm },
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  groups: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
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
  hint: { fontSize: 13, color: colors.slate },
  message: { fontSize: 16, fontWeight: '700', color: colors.ink },
});
