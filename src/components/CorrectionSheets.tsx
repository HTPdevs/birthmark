import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { MANUAL_MILESTONE_CODES, type ManualMilestoneCode, type SessionController } from '../domain/sessionController';
import { formatElapsed, formatTime24 } from '../domain/time';
import { effectiveElapsed, effectiveWall, momentName } from '../domain/timeline';
import { LABEL_GUIDANCE, LABEL_MAX_LENGTH, type Moment, milestoneLabel } from '../domain/types';
import { useControllerState } from '../state/store';
import { Button } from '../ui/Button';
import { type ManualTimeDraft, draftAt, draftToInput } from '../ui/manualTimeDraft';
import { Sheet } from '../ui/Sheet';
import { colors, radius, space } from '../ui/theme';
import { ManualTimeFields } from './ManualTimeFields';

function draftFor(m: Moment | null, fallbackWall: number): ManualTimeDraft {
  const wall = m ? effectiveWall(m) ?? fallbackWall : fallbackWall;
  return draftAt(wall, m ? effectiveElapsed(m) : 0);
}

/** Flag/unflag or correct the effective time of one moment. Originals are kept. */
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
  const [draft, setDraft] = useState<ManualTimeDraft>(() => draftFor(m, data.session.startedSnapshot.wallEpochMs));
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [lastId, setLastId] = useState(momentId);

  if (momentId !== lastId) {
    setLastId(momentId);
    setDraft(draftFor(m, data.session.startedSnapshot.wallEpochMs));
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
          <Text style={styles.section}>Accidental tap?</Text>
          <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Accidental tap">
            <Button
              label="Yes"
              variant={m.flaggedAccidental ? 'warning' : 'secondary'}
              selected={m.flaggedAccidental}
              accessibilityHint="Excludes this record from the timeline. It stays in the report appendix."
              onPress={() => !m.flaggedAccidental && controller.setAccidental(m.id, true, reason.trim() || null)}
            />
            <Button
              label="No"
              variant={m.flaggedAccidental ? 'secondary' : 'primary'}
              selected={!m.flaggedAccidental}
              onPress={() => m.flaggedAccidental && controller.setAccidental(m.id, false, reason.trim() || null)}
            />
          </View>

          <Text style={styles.section}>Correct time</Text>
          <ManualTimeFields draft={draft} onChange={setDraft} />
          <Button label="Save and update" variant="primary" onPress={saveTime} />

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

/** "Other" adds a plain moment; every other choice adds that milestone. */
type EntryType = ManualMilestoneCode | 'OTHER';

/**
 * Adds a milestone or plain moment that was not captured live, marked Manual in
 * every view. Type first, then time, then optional notes. Entries go in the
 * Session group (no event selector: the UI no longer creates events).
 */
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
  const [entryType, setEntryType] = useState<EntryType | null>(null);
  const [draft, setDraft] = useState<ManualTimeDraft>(() => draftFor(null, data.session.startedSnapshot.wallEpochMs));
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const save = () => {
    if (entryType === null) return setMessage('Choose what to add.');
    const input = draftToInput(draft);
    if ('error' in input) return setMessage(input.error);
    const r =
      entryType === 'OTHER'
        ? controller.addMissedMoment(input, notes, null)
        : controller.addMissedMilestone(entryType, input, notes, null);
    if (!r.ok) return setMessage(r.error);
    setNotes('');
    setEntryType(null);
    setMessage(r.ambiguous ? 'Added as Manual time: a clock change is near this time.' : 'Added to timeline.');
  };

  return (
    <Sheet visible={visible} title="Add to timeline" onClose={onClose}>
      <Text style={styles.section}>Type</Text>
      <View style={styles.groups}>
        {MANUAL_MILESTONE_CODES.map((code) => (
          <Button
            key={code}
            label={milestoneLabel(code)}
            variant={entryType === code ? 'primary' : 'secondary'}
            onPress={() => setEntryType(code)}
          />
        ))}
        <Button label="Other" variant={entryType === 'OTHER' ? 'primary' : 'secondary'} onPress={() => setEntryType('OTHER')} />
      </View>
      <Text style={styles.section}>Time</Text>
      <ManualTimeFields draft={draft} onChange={setDraft} />
      <Text style={styles.section}>Notes (optional)</Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        maxLength={LABEL_MAX_LENGTH}
        placeholder="Optional notes"
        placeholderTextColor={colors.slate}
        style={styles.input}
        accessibilityLabel="Notes"
        accessibilityHint={LABEL_GUIDANCE}
        autoCorrect={false}
      />
      <Text style={styles.hint}>{LABEL_GUIDANCE}</Text>
      <Button label="Add to timeline" variant="primary" onPress={save} />
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
