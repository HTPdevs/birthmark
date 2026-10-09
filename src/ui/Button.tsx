import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { TOUCH, colors, radius, space } from './theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'emergency' | 'danger' | 'warning';

export type IconName = ComponentProps<typeof Ionicons>['name'];

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
  /** Set for a choice in a group (Yes / No); announced as selected. */
  selected?: boolean;
  /** Ionicons glyph drawn before the label. Bundled font, so it works offline. */
  icon?: IconName;
  /** Show only the icon. `label` is still required and becomes the accessibility label. */
  iconOnly?: boolean;
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
  selected,
  icon,
  iconOnly,
}: Props) {
  const textStyle = [styles.text, textStyles[variant], large && styles.largeText];
  const iconSize = large ? 26 : 22;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={selected === undefined ? { disabled: !!disabled } : { disabled: !!disabled, selected }}
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
      <View style={styles.content}>
        {icon ? (
          <Ionicons
            name={icon}
            size={iconOnly ? iconSize + 6 : iconSize}
            color={StyleSheet.flatten(textStyles[variant]).color}
            accessible={false}
          />
        ) : null}
        {iconOnly && icon ? null : (
          <Text style={textStyle} numberOfLines={2} maxFontSizeMultiplier={1.6}>
            {label}
          </Text>
        )}
      </View>
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
  warning: { backgroundColor: colors.warning, borderColor: colors.warning },
  large: { minHeight: 72, paddingHorizontal: space.xl },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  text: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  largeText: { fontSize: 22 },
});

const textStyles = StyleSheet.create({
  primary: { color: colors.paper },
  secondary: { color: colors.ink },
  ghost: { color: colors.slate },
  emergency: { color: colors.onAccent },
  danger: { color: colors.danger },
  warning: { color: colors.paper },
});
