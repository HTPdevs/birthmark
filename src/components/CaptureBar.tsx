import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { SaveState } from '../domain/sessionController';
import { formatTime24 } from '../domain/time';
import { momentName } from '../domain/timeline';
import { LABEL_GUIDANCE, LABEL_MAX_LENGTH, type Moment, type SessionEvent } from '../domain/types';
import { Button } from '../ui/Button';
import { colors, radius, space, type } from '../ui/theme';

type Props = {
  target: Moment | null;
  targetSave: SaveState | undefined;
  events: SessionEvent[];
  onSaveLabel: (momentId: string, text: string) => void;
  onDismiss: () => void;
};

/**
 * Optional label for the most recent unlabeled generic capture. Renders nothing
 * (takes no space) when there is no target, so the milestone row above it keeps
 * the full height. Resuscitate and APGAR live elsewhere on the recording screen.
 */
export function CaptureBar({ target, targetSave, events, onSaveLabel, onDismiss }: Props) {
  const [text, setText] = useState('');
  const targetId = target?.id ?? null;
  const prevTarget = useRef<string | null>(targetId);

  useEffect(() => {
    if (prevTarget.current !== targetId) {
      prevTarget.current = targetId;
      setText('');
    }
  }, [targetId]);

  if (!target) return null;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.meta, type.tabular]} numberOfLines={1}>
        {momentName(target, events)} {target.snapshot ? formatTime24(target.snapshot.wallEpochMs, target.snapshot.utcOffsetMinutes) : ''}{' '}
        <Text style={targetSave === 'saved' ? styles.saved : styles.pending}>
          {targetSave === 'saved' ? 'Saved' : 'Saving'}
        </Text>
      </Text>
      <View style={styles.inputRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Optional label"
          placeholderTextColor={colors.slate}
          maxLength={LABEL_MAX_LENGTH}
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={() => targetId && onSaveLabel(targetId, text)}
          accessibilityLabel={`Label for ${momentName(target, events)}`}
          accessibilityHint={LABEL_GUIDANCE}
          autoCorrect={false}
        />
        <Button label="Save" onPress={() => targetId && onSaveLabel(targetId, text)} disabled={!text.trim()} />
        <Button label="Skip" variant="ghost" onPress={onDismiss} />
      </View>
      <Text style={styles.guidance} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {LABEL_GUIDANCE}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  meta: { fontSize: 15, color: colors.slate },
  saved: { color: colors.success, fontWeight: '700' },
  pending: { color: colors.slate, fontWeight: '700' },
  inputRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
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
  guidance: { fontSize: 13, color: colors.slate },
});
