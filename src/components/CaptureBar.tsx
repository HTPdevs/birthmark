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
  groupName: string;
  onMark: (pendingLabel: { momentId: string; text: string } | null) => void;
  onSaveLabel: (momentId: string, text: string) => void;
  onDismiss: () => void;
};

/**
 * "Mark moment / Other" captures immediately. The optional label for the most
 * recent capture sits right beside it so marking stays reachable while typing.
 * Text typed for an earlier capture is committed to that capture, never moved.
 */
export function CaptureBar({ target, targetSave, events, groupName, onMark, onSaveLabel, onDismiss }: Props) {
  const [text, setText] = useState('');
  const targetId = target?.id ?? null;
  const prevTarget = useRef<string | null>(targetId);

  useEffect(() => {
    if (prevTarget.current !== targetId) {
      prevTarget.current = targetId;
      setText('');
    }
  }, [targetId]);

  const mark = () => {
    const pending = targetId && text.trim() ? { momentId: targetId, text } : null;
    onMark(pending);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Button
          label="Mark moment / Other"
          onPress={mark}
          variant="primary"
          large
          style={styles.mark}
          accessibilityHint={`Records a moment now in ${groupName}. Label is optional.`}
          testID="mark-moment"
        />
        {target ? (
          <View style={styles.labelBox}>
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
          </View>
        ) : null}
      </View>
      {target ? <Text style={styles.guidance}>{LABEL_GUIDANCE}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  row: { flexDirection: 'row', gap: space.md, alignItems: 'stretch' },
  mark: { flexShrink: 0, minWidth: 200 },
  labelBox: { flex: 1, gap: space.xs, justifyContent: 'center' },
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
