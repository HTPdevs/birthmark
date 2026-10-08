import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { ManualTimeInput } from '../domain/manualTime';
import { formatOffset, parseOffset } from '../domain/time';
import { Button } from '../ui/Button';
import { colors, radius, space } from '../ui/theme';

export type ManualTimeDraft = {
  mode: 'elapsed' | 'clock';
  elapsed: string;
  date: string;
  time: string;
  offset: string;
};

export function draftToInput(d: ManualTimeDraft): ManualTimeInput | { error: string } {
  if (d.mode === 'elapsed') return { mode: 'elapsed', elapsed: d.elapsed };
  const offsetMinutes = parseOffset(d.offset);
  if (offsetMinutes === null) return { error: 'Enter the UTC offset as +HH:MM or -HH:MM.' };
  return { mode: 'clock', date: d.date, time: d.time, offsetMinutes };
}

export function initialDraft(date: string, time: string, elapsed: string, offsetMinutes: number): ManualTimeDraft {
  return { mode: 'elapsed', elapsed, date, time, offset: formatOffset(offsetMinutes).replace('UTC', '') };
}

/** Elapsed time, or a local date + 24-hour time with an explicit UTC offset. */
export function ManualTimeFields({ draft, onChange }: { draft: ManualTimeDraft; onChange: (d: ManualTimeDraft) => void }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.modes}>
        <Button
          label="Elapsed time"
          variant={draft.mode === 'elapsed' ? 'primary' : 'secondary'}
          onPress={() => onChange({ ...draft, mode: 'elapsed' })}
        />
        <Button
          label="Date and time"
          variant={draft.mode === 'clock' ? 'primary' : 'secondary'}
          onPress={() => onChange({ ...draft, mode: 'clock' })}
        />
      </View>
      {draft.mode === 'elapsed' ? (
        <Field label="Elapsed (HH:mm:ss)" value={draft.elapsed} onChange={(elapsed) => onChange({ ...draft, elapsed })} />
      ) : (
        <View style={styles.row}>
          <Field label="Date (YYYY-MM-DD)" value={draft.date} onChange={(date) => onChange({ ...draft, date })} />
          <Field label="Time, 24h (HH:mm:ss)" value={draft.time} onChange={(time) => onChange({ ...draft, time })} />
          <Field label="UTC offset" value={draft.offset} onChange={(offset) => onChange({ ...draft, offset })} />
        </View>
      )}
    </View>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        style={styles.input}
        autoCorrect={false}
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  modes: { flexDirection: 'row', gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm },
  field: { flex: 1, gap: 2 },
  label: { fontSize: 14, color: colors.slate, fontWeight: '600' },
  input: {
    minHeight: 48,
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    fontSize: 18,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
});
