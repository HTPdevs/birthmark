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
import { milestoneRowLayout } from '../ui/milestoneLayout';
import { colors, radius, space } from '../ui/theme';

type Props = {
  mode: RowMode;
  onCapture: (code: RowMilestoneCode) => void;
  onShowAll: () => void;
};

/**
 * Milestone buttons sized so the whole row fits the viewport (First Cry is
 * visible without sliding). If fitting would drop a button below the touch
 * target, the row scrolls instead and shows a scroll cue. The row stays inside
 * a horizontal ScrollView either way: a drag goes to the ScrollView and cancels
 * the press, so swiping never captures. Resuscitate and APGAR have their own
 * buttons on the recording screen, so every button here records a moment.
 */
export function MilestoneRow({ mode, onCapture, onShowAll }: Props) {
  const [width, setWidth] = useState(0);
  const [atEnd, setAtEnd] = useState(false);
  const codes = mode === 'all' ? FULL_ROW : POST_FIRST_CRY_ROW;
  const count = codes.length + (mode === 'post_first_cry' ? 1 : 0);
  const layout = milestoneRowLayout(width, count);
  const sized = layout.buttonWidth === null ? styles.flexButton : { width: layout.buttonWidth };

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
        contentContainerStyle={layout.scroll ? styles.scrollRow : styles.fitRow}
        accessibilityLabel="Milestones">
        {codes.map((code) => (
          <Pressable
            key={code}
            onPress={() => onCapture(code)}
            accessibilityRole="button"
            accessibilityLabel={milestoneLabel(code)}
            accessibilityHint="Records this milestone now"
            style={({ pressed }) => [styles.button, sized, pressed && styles.pressed]}>
            <Text
              style={styles.label}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              maxFontSizeMultiplier={1.4}>
              {milestoneLabel(code)}
            </Text>
          </Pressable>
        ))}
        {mode === 'post_first_cry' ? (
          <Pressable
            onPress={onShowAll}
            accessibilityRole="button"
            accessibilityLabel="All milestones"
            style={({ pressed }) => [styles.button, styles.allButton, sized, pressed && styles.pressed]}>
            <Text
              style={[styles.label, styles.allLabel]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              maxFontSizeMultiplier={1.4}>
              All milestones
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
      {layout.scroll && !atEnd ? (
        <View pointerEvents="none" style={styles.cue} accessible={false}>
          <Text style={styles.cueText}>{'›'}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  fitRow: { flexGrow: 1, gap: space.sm },
  scrollRow: { gap: space.sm, paddingRight: space.xl },
  flexButton: { flex: 1 },
  button: {
    minHeight: 64,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xs,
  },
  allButton: { backgroundColor: colors.paper, borderWidth: 2, borderColor: colors.line },
  pressed: { opacity: 0.65 },
  label: { color: colors.paper, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  allLabel: { color: colors.slate, fontSize: 15 },
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
