import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '../ui/Button';
import type { ManualTimeDraft } from '../ui/manualTimeDraft';
import { colors, radius, space } from '../ui/theme';

/** Elapsed time, or a local date + 24-hour time in the device time zone. */
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
        <Field
          label="Time elapsed:"
          a11y="Time elapsed, hours minutes seconds"
          value={draft.elapsed}
          onChange={(elapsed) => onChange({ ...draft, elapsed })}
        />
      ) : (
        <View style={styles.row}>
          <Field label="Date" a11y="Date, month day year" value={draft.date} onChange={(date) => onChange({ ...draft, date })} />
          <Field label="Time (24hr)" a11y="Time, 24 hour" value={draft.time} onChange={(time) => onChange({ ...draft, time })} />
        </View>
      )}
    </View>
  );
}

function Field({ label, a11y, value, onChange }: { label: string; a11y: string; value: string; onChange: (v: string) => void }) {
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
        accessibilityLabel={a11y}
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
