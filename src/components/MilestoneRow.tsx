import { useState } from 'react';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { RowMode } from '../domain/timeline';
import { FULL_ROW, POST_FIRST_CRY_ROW, type RowMilestoneCode, milestoneLabel } from '../domain/types';
import { TOUCH, colors, radius, space } from '../ui/theme';

type Props = {
  mode: RowMode;
  onCapture: (code: RowMilestoneCode) => void;
  onShowAll: () => void;
};

// Roughly 4.4 buttons fit, so the next one is always partly visible.
const VISIBLE_BUTTONS = 4.4;

/**
 * Horizontally swipeable milestone buttons. A drag scrolls the row and cancels
 * the press, so swiping never captures. Resuscitate and APGAR have their own
 * buttons on the recording screen, so every button here records a moment.
 */
export function MilestoneRow({ mode, onCapture, onShowAll }: Props) {
  const [width, setWidth] = useState(0);
  const [atEnd, setAtEnd] = useState(false);
  const codes = mode === 'all' ? FULL_ROW : POST_FIRST_CRY_ROW;
  const buttonWidth = width ? Math.max(TOUCH * 1.6, (width - space.sm * 4) / VISIBLE_BUTTONS) : 120;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    setAtEnd(contentOffset.x + layoutMeasurement.width >= contentSize.width - 4);
  };
  const onContentSize = (w: number) => setAtEnd(w <= width + 4);

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        onContentSizeChange={onContentSize}
        scrollEventThrottle={64}
        contentContainerStyle={styles.row}
        accessibilityLabel="Milestones">
        {codes.map((code) => (
          <Pressable
            key={code}
            onPress={() => onCapture(code)}
            accessibilityRole="button"
            accessibilityLabel={milestoneLabel(code)}
            accessibilityHint="Records this milestone now"
            style={({ pressed }) => [styles.button, { width: buttonWidth }, pressed && styles.pressed]}>
            <Text style={styles.label} numberOfLines={2} maxFontSizeMultiplier={1.4}>
              {milestoneLabel(code)}
            </Text>
          </Pressable>
        ))}
        {mode === 'post_first_cry' ? (
          <Pressable
            onPress={onShowAll}
            accessibilityRole="button"
            accessibilityLabel="All milestones"
            style={({ pressed }) => [styles.button, styles.allButton, { width: buttonWidth }, pressed && styles.pressed]}>
            <Text style={[styles.label, styles.allLabel]} numberOfLines={2} maxFontSizeMultiplier={1.4}>
              All milestones
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
      {!atEnd ? (
        <View pointerEvents="none" style={styles.cue} accessible={false}>
          <Text style={styles.cueText}>{'›'}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  row: { gap: space.sm, paddingRight: space.xl },
  button: {
    minHeight: 64,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  allButton: { backgroundColor: colors.paper, borderWidth: 2, borderColor: colors.line },
  pressed: { opacity: 0.65 },
  label: { color: colors.paper, fontSize: 19, fontWeight: '800', textAlign: 'center' },
  allLabel: { color: colors.slate, fontSize: 16 },
  cue: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 28,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.fade,
  },
  cueText: { fontSize: 32, color: colors.slate, fontWeight: '700' },
});
