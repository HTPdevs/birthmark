import { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatElapsed, formatTime12, formatTime24 } from '../domain/time';
import { effectiveWall, liveStatus, momentName } from '../domain/timeline';
import type { Moment, SessionEvent } from '../domain/types';
import { colors, radius, space, type } from '../ui/theme';
import type { ClockFormat } from './BigClock';

type Props = {
  moments: Moment[];
  events: SessionEvent[];
  format: ClockFormat;
  /** Tapping a row opens it for a quick rename, accidental-tap flag, or time correction. */
  onSelect: (momentId: string) => void;
};

/**
 * Recorded milestone observations, newest at the bottom and most prominent.
 * Generic moments and event boundaries never replace the current milestone.
 * Every row is pressable so an accidental press can be fixed mid-session.
 */
export function LiveStatusPanel({ moments, events, format, onSelect }: Props) {
  const scroll = useRef<ScrollView>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
        <Text style={styles.emptyText}>Nothing recorded yet.</Text>
      </View>
    );
  }

  const current = status.current;
  const earlier = status.history.slice(0, -1);
  return (
    <ScrollView
      ref={scroll}
      style={styles.flex}
      contentContainerStyle={styles.content}
      onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
      {earlier.map((m) => (
        <Pressable
          key={m.id}
          onPress={() => onSelect(m.id)}
          accessibilityRole="button"
          accessibilityLabel={`${momentName(m, events)} at ${fmt(m)}, edit`}
          style={({ pressed }) => [styles.prevRow, pressed && styles.pressed]}>
          <Text style={styles.prevName} numberOfLines={1}>
            {momentName(m, events)}
          </Text>
          <Text style={[styles.prevTime, type.tabular]}>{fmt(m)}</Text>
        </Pressable>
      ))}
      <Pressable
        onPress={() => onSelect(current.id)}
        accessibilityRole="button"
        accessibilityLabel={`${momentName(current, events)} at ${fmt(current)}, edit`}
        accessibilityHint="Latest milestone"
        style={({ pressed }) => [styles.current, pressed && styles.pressed]}>
        <Text style={styles.currentName} numberOfLines={2}>
          {momentName(current, events)}
        </Text>
        <Text style={[styles.currentTime, type.tabular]}>{fmt(current)}</Text>
        {status.previous && status.sincePreviousMs !== null ? (
          <Text style={[styles.since, type.tabular]}>
            Since {momentName(status.previous, events)} {formatElapsed(status.sincePreviousMs)}
          </Text>
        ) : null}
      </Pressable>
    </ScrollView>
  );
}

function RowActions({ name, onDelete, onEdit }: { name: string; onDelete: () => void; onEdit: () => void }) {
  return (
    <View style={styles.actions}>
      <Pressable
        onPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${name}`}
        accessibilityHint="Marks it as an accidental tap. It stays in the report appendix."
        style={({ pressed }) => [styles.icon, pressed && styles.pressed]}>
        <Ionicons name="trash-outline" size={26} color={colors.danger} />
      </Pressable>
      <Pressable
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${name}`}
        style={({ pressed }) => [styles.icon, pressed && styles.pressed]}>
        <Ionicons name="pencil" size={24} color={colors.ink} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'flex-end', gap: space.xs, paddingBottom: space.sm },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: space.lg },
  emptyText: { color: colors.slate, fontSize: 17, textAlign: 'center' },
  prevRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 44,
    borderRadius: radius.sm,
  },
  prevName: { color: colors.slate, fontSize: 17, flexShrink: 1 },
  prevTime: { color: colors.slate, fontSize: 17 },
  current: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space.sm, marginTop: space.xs },
  currentName: { color: colors.ink, fontSize: 34, fontWeight: '800' },
  currentTime: { color: colors.ink, fontSize: 22, fontWeight: '600' },
  pressed: { opacity: 0.6 },
  since: { color: colors.ink, fontSize: 18, fontWeight: '700', marginTop: 2 },
});
