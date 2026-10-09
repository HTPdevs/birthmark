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
import { type RowMilestoneCode, milestoneLabel } from '../domain/types';
import { type MilestoneRowItem, milestoneRowItems, milestoneRowLayout } from '../ui/milestoneLayout';
import { TOUCH, colors, radius, space } from '../ui/theme';

type Props = {
  mode: RowMode;
  onCapture: (code: RowMilestoneCode) => void;
  /** Opens the APGAR editor. Records no moment. */
  onApgar: () => void;
  onShowAll: () => void;
};

/**
 * Milestone buttons sized so the whole row fits the viewport (First Cry is
 * visible without sliding) and stretched to fill the height the parent gives
 * the row. If fitting would drop a button below the touch target, the row
 * scrolls instead and shows a scroll cue. The row stays inside a horizontal
 * ScrollView either way: a drag goes to the ScrollView and cancels the press,
 * so swiping never captures.
 *
 * After First Cry the row is Separation Gush, Placenta, APGAR, Go back. Only the
 * milestone buttons record a moment: APGAR opens the score editor and Go back
 * restores the full row. Both are drawn light so they never read as captures.
 */
export function MilestoneRow({ mode, onCapture, onApgar, onShowAll }: Props) {
  const [width, setWidth] = useState(0);
  const [atEnd, setAtEnd] = useState(false);
  const items = milestoneRowItems(mode);
  const layout = milestoneRowLayout(width, items.length);
  const sized = layout.buttonWidth === null ? styles.flexButton : { width: layout.buttonWidth };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    setAtEnd(contentOffset.x + layoutMeasurement.width >= contentSize.width - 4);
  };
  const onContentSize = (w: number) => setAtEnd(w <= width + 4);

  const render = (item: MilestoneRowItem) => {
    if (item.kind === 'milestone') {
      return (
        <Pressable
          key={item.code}
          onPress={() => onCapture(item.code)}
          accessibilityRole="button"
          accessibilityLabel={milestoneLabel(item.code)}
          accessibilityHint="Records this milestone now"
          style={({ pressed }) => [styles.button, sized, pressed && styles.pressed]}>
          <Text
            style={styles.label}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            maxFontSizeMultiplier={1.4}>
            {milestoneLabel(item.code)}
          </Text>
        </Pressable>
      );
    }
    const apgar = item.kind === 'apgar';
    return (
      <Pressable
        key={item.kind}
        onPress={apgar ? onApgar : onShowAll}
        accessibilityRole="button"
        accessibilityLabel={apgar ? 'APGAR' : 'Go back'}
        accessibilityHint={
          apgar ? 'Opens APGAR scores. Does not record a time.' : 'Shows all milestones again. Does not record a time.'
        }
        testID={apgar ? 'apgar' : 'show-all-milestones'}
        style={({ pressed }) => [
          styles.button,
          apgar ? styles.apgarButton : styles.backButton,
          sized,
          pressed && styles.pressed,
        ]}>
        <Text
          style={[styles.label, apgar ? styles.apgarLabel : styles.backLabel]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          maxFontSizeMultiplier={1.4}>
          {apgar ? 'APGAR' : 'Go back'}
        </Text>
      </Pressable>
    );
  };

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={styles.wrap}>
      <ScrollView
        horizontal
        style={styles.scroll}
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        onContentSizeChange={onContentSize}
        scrollEventThrottle={64}
        contentContainerStyle={layout.scroll ? styles.scrollRow : styles.fitRow}
        accessibilityLabel="Milestones">
        {items.map(render)}
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
  // flex: the row takes whatever height the left column has left, so the
  // buttons grow to fill it. Never shorter than a touch target.
  wrap: { position: 'relative', flex: 1, minHeight: TOUCH },
  scroll: { flex: 1 },
  // A horizontal ScrollView lays its content out in a row, and the content
  // container stretches to the ScrollView's height, so buttons stretch too.
  fitRow: { flexGrow: 1, gap: space.sm, alignItems: 'stretch' },
  scrollRow: { gap: space.sm, paddingRight: space.xl, alignItems: 'stretch' },
  flexButton: { flex: 1 },
  button: {
    minHeight: TOUCH,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xs,
  },
  // APGAR opens an editor: outlined in ink, not filled like a capture.
  apgarButton: { backgroundColor: colors.paper, borderWidth: 2, borderColor: colors.ink },
  backButton: { backgroundColor: colors.paper, borderWidth: 2, borderColor: colors.line },
  pressed: { opacity: 0.65 },
  label: { color: colors.paper, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  apgarLabel: { color: colors.ink },
  backLabel: { color: colors.slate, fontSize: 15 },
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
