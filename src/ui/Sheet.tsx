import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius, space } from './theme';

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Where the panel docks. Right is used for the events drawer. */
  side?: 'center' | 'right';
  width?: number | `${number}%`;
  footer?: ReactNode;
};

/** Modal panel. Tapping the backdrop or the system back gesture closes it. */
export function Sheet({ visible, title, onClose, children, side = 'center', width, footer }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={['landscape', 'landscape-left', 'landscape-right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.backdrop, side === 'right' ? styles.right : styles.center]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View
          style={[styles.panel, side === 'right' ? styles.panelRight : styles.panelCenter, width ? { width } : null]}
          accessibilityViewIsModal>
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={styles.close}
              hitSlop={8}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(45,49,66,0.45)' },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.lg },
  right: { alignItems: 'flex-end' },
  panel: { backgroundColor: colors.paper, overflow: 'hidden' },
  panelCenter: { borderRadius: radius.lg, maxHeight: '96%', width: '70%', maxWidth: 760 },
  panelRight: { height: '100%', width: '46%', borderTopLeftRadius: radius.lg, borderBottomLeftRadius: radius.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.ink, flexShrink: 1 },
  close: { minHeight: 44, minWidth: 64, alignItems: 'flex-end', justifyContent: 'center' },
  closeText: { fontSize: 17, fontWeight: '600', color: colors.slate },
  body: { padding: space.lg, gap: space.md },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.md,
    padding: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
});
