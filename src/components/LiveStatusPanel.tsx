import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatElapsed, formatTime12, formatTime24 } from '../domain/time';
import { effectiveWall, liveStatus, momentName } from '../domain/timeline';
import type { Moment, SessionEvent } from '../domain/types';
import { TOUCH, colors, radius, space, type } from '../ui/theme';
import type { ClockFormat } from './BigClock';

type Props = {
  moments: Moment[];
  events: SessionEvent[];
  format: ClockFormat;
  /** Pencil: open the record's time correction. */
  onEdit: (momentId: string) => void;
  /** Trash: flag the record as an accidental tap. It is kept, not deleted. */
  onDelete: (momentId: string) => void;
};

/**
 * The most recently recorded milestone only: its name, captured time, and the
 * interval since the milestone before it. Earlier records are on History and
 * the report, not here (operator decision, October 2026). Generic moments and
 * event boundaries never replace the current milestone. Tapping it shows trash
 * and pencil icons inline (no popup); tapping it again hides them.
 */
export function LiveStatusPanel({ moments, events, format, onEdit, onDelete }: Props) {
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
  const selected = selectedId === current.id;
  return (
    <View style={styles.wrap}>
      <View style={styles.rowWrap}>
        <Pressable
          onPress={() => setSelectedId(selected ? null : current.id)}
          accessibilityRole="button"
          accessibilityState={{ expanded: selected }}
          accessibilityLabel={`${momentName(current, events)} at ${fmt(current)}, latest milestone`}
          accessibilityHint="Shows delete and edit"
          style={({ pressed }) => [styles.flex, pressed && styles.pressed]}>
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
        {selected ? (
          <RowActions
            name={momentName(current, events)}
            onDelete={() => {
              setSelectedId(null);
              onDelete(current.id);
            }}
            onEdit={() => {
              setSelectedId(null);
              onEdit(current.id);
            }}
          />
        ) : null}
      </View>
    </View>
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
  // Centered in the space between the clock band and the bottom row.
  wrap: { flex: 1, justifyContent: 'center' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: space.lg },
  emptyText: { color: colors.slate, fontSize: 16, textAlign: 'center' },
  rowWrap: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  // The captured time is the headline the moment a button is pressed; the name labels it.
  currentName: { color: colors.ink, fontSize: 20, fontWeight: '800' },
  currentTime: { color: colors.ink, fontSize: 40, lineHeight: 46, fontWeight: '800' },
  pressed: { opacity: 0.6 },
  since: { color: colors.ink, fontSize: 15, fontWeight: '700', marginTop: 2 },
  actions: { flexDirection: 'row', gap: space.xs },
  icon: {
    width: TOUCH,
    height: TOUCH,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper,
  },
});
