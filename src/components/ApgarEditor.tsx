import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { SessionController } from '../domain/sessionController';
import type { AssessmentPoint } from '../domain/types';
import { APGAR_LABELS } from '../report/reportModel';
import { useControllerState } from '../state/store';
import { Sheet } from '../ui/Sheet';
import { colors, radius, space } from '../ui/theme';

const POINTS: AssessmentPoint[] = ['one_minute', 'five_minute'];
const SCORES = Array.from({ length: 11 }, (_, i) => i);

// All 11 chips share one row per assessment so the sheet fits a landscape
// phone without scrolling: header ~69 + body padding 32 + note ~20 + two
// blocks (title ~26 + 4 + chips 52) + sheet gaps 24 is ~309pt, under the
// Sheet's 96% cap on a 375pt-tall screen (360pt). Chips stay >= 44pt wide
// down to a 667pt-wide screen.

/**
 * Two untimed assessments. Nothing is preselected (unset is not zero). Saving a
 * score never creates a timed moment or changes the live milestone status.
 */
export function ApgarEditor({
  controller,
  visible,
  onClose,
}: {
  controller: SessionController;
  visible: boolean;
  onClose: () => void;
}) {
  const { assessments } = useControllerState(controller).data;
  return (
    <Sheet visible={visible} title="APGAR" onClose={onClose} width="90%">
      <Text style={styles.note}>No assessment time recorded.</Text>
      {POINTS.map((point) => {
        const current = assessments.find((a) => a.assessmentPoint === point)?.score;
        return (
          <View key={point} style={styles.block}>
            <Text style={styles.title}>
              {APGAR_LABELS[point]}
              <Text style={styles.value}>{current === undefined ? '  Not entered' : `  ${current}`}</Text>
            </Text>
            <View style={styles.scores} accessibilityRole="radiogroup" accessibilityLabel={APGAR_LABELS[point]}>
              {SCORES.map((score) => {
                const selected = current === score;
                return (
                  <Pressable
                    key={score}
                    onPress={() => controller.saveAssessment(point, score)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${APGAR_LABELS[point]} score ${score}`}
                    style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}>
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{score}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  note: { color: colors.slate, fontSize: 15 },
  block: { gap: space.xs },
  title: { fontSize: 20, fontWeight: '800', color: colors.ink },
  value: { fontSize: 18, fontWeight: '600', color: colors.slate },
  scores: { flexDirection: 'row', gap: space.xs },
  chip: {
    flex: 1,
    minWidth: 44,
    height: 52,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  pressed: { opacity: 0.6 },
  chipText: { fontSize: 20, fontWeight: '700', color: colors.ink },
  chipTextSelected: { color: colors.paper },
});
