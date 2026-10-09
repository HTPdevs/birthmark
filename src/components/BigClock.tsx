import { useEffect, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatTime12, formatTime24 } from '../domain/time';
import type { ClockSnapshot } from '../domain/types';
import { colors, type } from '../ui/theme';

export type ClockFormat = '24h' | '12h';

type Props = {
  snapshot: ClockSnapshot;
  format: ClockFormat;
  onToggle: () => void;
  /** Reports the fitted font size so secondary timers can stay smaller than the clock. */
  onFontSize?: (fontSize: number) => void;
};

// Approximate advance width per character relative to font size. Bold tabular
// digits are ~0.6em and colons ~0.3em, so 0.56 averaged over "12:34:56" still
// leaves slack; adjustsFontSizeToFit below catches any font that runs wider.
const WIDTH_PER_CHAR = 0.56;
// Share of the box height the font may use; with lineHeight 1.08 the line fills ~97%.
const HEIGHT_SHARE = 0.9;

/**
 * Current device clock, sized to the largest unclipped size its container
 * allows and centered in it. Tapping toggles 24h / 12h display only; it never
 * records anything.
 */
export function BigClock({ snapshot, format, onToggle, onFontSize }: Props) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const text =
    format === '24h'
      ? formatTime24(snapshot.wallEpochMs, snapshot.utcOffsetMinutes)
      : formatTime12(snapshot.wallEpochMs, snapshot.utcOffsetMinutes);
  // Size against the widest string for the format so the clock never jumps.
  const chars = format === '24h' ? 8 : 11;
  const fontSize = box.w ? Math.max(40, Math.min(box.w / (chars * WIDTH_PER_CHAR), box.h * HEIGHT_SHARE)) : 72;

  useEffect(() => {
    onFontSize?.(fontSize);
  }, [fontSize, onFontSize]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - box.w) > 1 || Math.abs(height - box.h) > 1) setBox({ w: width, h: height });
  };

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel="Toggle clock format"
      accessibilityHint={`Currently ${format === '24h' ? '24-hour' : '12-hour'}. Display only; does not record a moment.`}
      style={styles.wrap}>
      <View style={styles.fill} onLayout={onLayout}>
        <Text
          style={[styles.clock, type.tabular, { fontSize, lineHeight: fontSize * 1.08 }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          allowFontScaling={false}
          accessible={false}>
          {text}
        </Text>
      </View>
      <Text style={styles.badge} accessible={false}>
        {format}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 64 },
  fill: { flex: 1, justifyContent: 'center' },
  clock: { color: colors.ink, fontWeight: '800', letterSpacing: -1, textAlign: 'center' },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    fontSize: 13,
    fontWeight: '700',
    color: colors.slate,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
});
