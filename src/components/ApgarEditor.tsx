import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { SessionController } from '../domain/sessionController';
import type { AssessmentPoint } from '../domain/types';
import { APGAR_LABELS } from '../report/reportModel';
import { useControllerState } from '../state/store';
import { Sheet } from '../ui/Sheet';
import { colors, radius, space } from '../ui/theme';

const POINTS: AssessmentPoint[] = ['one_minute', 'five_minute'];
const SCORES = Array.from({ length: 11 }, (_, i) => i);

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
    <Sheet visible={visible} title="APGAR" onClose={onClose} width="80%">
      <Text style={styles.note}>Operator-entered scores. No assessment time is recorded.</Text>
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
  block: { gap: space.sm },
  title: { fontSize: 20, fontWeight: '800', color: colors.ink },
  value: { fontSize: 18, fontWeight: '600', color: colors.slate },
  scores: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    width: 52,
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
