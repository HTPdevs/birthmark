import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { TOUCH, colors, radius, space } from './theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'emergency' | 'danger';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  large?: boolean;
  testID?: string;
};

export function Button({
  label,
  onPress,
  variant = 'secondary',
  disabled,
  style,
  accessibilityLabel,
  accessibilityHint,
  large,
  testID,
}: Props) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        large && styles.large,
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}>
      <Text
        style={[styles.text, textStyles[variant], large && styles.largeText]}
        numberOfLines={2}
        maxFontSizeMultiplier={1.6}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: TOUCH,
    minWidth: TOUCH,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  primary: { backgroundColor: colors.ink, borderColor: colors.ink },
  secondary: { backgroundColor: colors.paper, borderColor: colors.line },
  ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  emergency: { backgroundColor: colors.accent, borderColor: colors.accent },
  danger: { backgroundColor: colors.paper, borderColor: colors.danger },
  large: { minHeight: 72, paddingHorizontal: space.xl },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  text: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  largeText: { fontSize: 22 },
});

const textStyles = StyleSheet.create({
  primary: { color: colors.paper },
  secondary: { color: colors.ink },
  ghost: { color: colors.slate },
  emergency: { color: colors.ink },
  danger: { color: colors.danger },
});
