import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { QueueStatus } from '../storage/writeQueue';
import { Button } from '../ui/Button';
import { saveStatusView } from '../ui/saveStatusView';
import { colors, radius, space } from '../ui/theme';

/**
 * Failed save: "Not saved · Retry" (tap retries). Queued writes: "Saving".
 * Otherwise a History button, or nothing when `idleHistory` is false (the
 * recording screen has no History). Never claims "Saved" before every queued
 * write has committed.
 */
export function SaveStatus({
  queue,
  onRetry,
  idleHistory = true,
}: {
  queue: QueueStatus;
  onRetry: () => void;
  idleHistory?: boolean;
}) {
  const view = saveStatusView(queue);
  if (view === 'failed') {
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
  if (view === 'saving') {
    return (
      <View style={[styles.pill, styles.ok]} accessible accessibilityLabel="Saving">
        <Text style={styles.pendingText}>Saving</Text>
      </View>
    );
  }
  if (!idleHistory) return null;
  return (
    <Button
      label="History"
      icon="time-outline"
      variant="secondary"
      accessibilityHint="Opens finished sessions"
      onPress={() => router.push('/history')}
      testID="save-status-history"
    />
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
  failed: { borderColor: colors.danger, backgroundColor: colors.dangerSurface, minHeight: 48 },
  pendingText: { color: colors.slate, fontWeight: '700', fontSize: 15 },
  failedText: { color: colors.danger, fontWeight: '800', fontSize: 16 },
});
