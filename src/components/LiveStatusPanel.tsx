import { useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatElapsed, formatTime12, formatTime24 } from '../domain/time';
import { effectiveWall, liveStatus, momentName } from '../domain/timeline';
import type { Moment, SessionEvent } from '../domain/types';
import { colors, space, type } from '../ui/theme';
import type { ClockFormat } from './BigClock';

type Props = {
  moments: Moment[];
  events: SessionEvent[];
  format: ClockFormat;
};

/**
 * Recorded milestone observations, newest at the bottom and most prominent.
 * Generic moments and event boundaries never replace the current milestone.
 */
export function LiveStatusPanel({ moments, events, format }: Props) {
  const scroll = useRef<ScrollView>(null);
  const status = liveStatus(moments);
  const fmt = (m: Moment) => {
    const wall = effectiveWall(m);
    if (wall === null) return '';
    const off = m.snapshot?.utcOffsetMinutes ?? 0;
    return format === '24h' ? formatTime24(wall, off) : formatTime12(wall, off);
  };

  if (!status.current) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No milestones recorded yet.</Text>
      </View>
    );
  }

  const earlier = status.history.slice(0, -1);
  return (
    <ScrollView
      ref={scroll}
      style={styles.flex}
      contentContainerStyle={styles.content}
      onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
      {earlier.map((m) => (
        <View key={m.id} style={styles.prevRow}>
          <Text style={styles.prevName} numberOfLines={1}>
            {momentName(m, events)}
          </Text>
          <Text style={[styles.prevTime, type.tabular]}>{fmt(m)}</Text>
        </View>
      ))}
      <View style={styles.current} accessible accessibilityLabel={`Latest milestone ${momentName(status.current, events)} at ${fmt(status.current)}`}>
        <Text style={styles.currentName} numberOfLines={2}>
          {momentName(status.current, events)}
        </Text>
        <Text style={[styles.currentTime, type.tabular]}>{fmt(status.current)}</Text>
        {status.previous && status.sincePreviousMs !== null ? (
          <Text style={[styles.since, type.tabular]}>
            Since {momentName(status.previous, events)} {formatElapsed(status.sincePreviousMs)}
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'flex-end', gap: space.xs, paddingBottom: space.sm },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: space.lg },
  emptyText: { color: colors.slate, fontSize: 17, textAlign: 'center' },
  prevRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm, paddingVertical: 2 },
  prevName: { color: colors.slate, fontSize: 17, flexShrink: 1 },
  prevTime: { color: colors.slate, fontSize: 17 },
  current: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space.sm, marginTop: space.xs },
  currentName: { color: colors.ink, fontSize: 34, fontWeight: '800' },
  currentTime: { color: colors.ink, fontSize: 22, fontWeight: '600' },
  since: { color: colors.ink, fontSize: 18, fontWeight: '700', marginTop: 2 },
});
