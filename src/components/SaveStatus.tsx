import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { QueueStatus } from '../storage/writeQueue';
import { colors, radius, space } from '../ui/theme';

/** Never claims "Saved" before every queued write has committed. */
export function SaveStatus({ queue, onRetry }: { queue: QueueStatus; onRetry: () => void }) {
  if (queue.failed) {
    return (
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={`Not saved. ${queue.pending} change${queue.pending === 1 ? '' : 's'} waiting. Retry`}
        style={[styles.pill, styles.failed]}>
        <Text style={styles.failedText}>Not saved {'·'} Retry</Text>
      </Pressable>
    );
  }
  return (
    <View style={[styles.pill, styles.ok]} accessible accessibilityLabel={queue.pending ? 'Saving' : 'All saved'}>
      <Text style={queue.pending ? styles.pendingText : styles.okText}>{queue.pending ? 'Saving' : 'All saved'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    justifyContent: 'center',
    borderWidth: 2,
  },
  ok: { borderColor: colors.line },
  failed: { borderColor: colors.danger, backgroundColor: '#FDECEA', minHeight: 48 },
  okText: { color: colors.success, fontWeight: '700', fontSize: 15 },
  pendingText: { color: colors.slate, fontWeight: '700', fontSize: 15 },
  failedText: { color: colors.danger, fontWeight: '800', fontSize: 16 },
});
