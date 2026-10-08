import { StyleSheet, Text } from 'react-native';

import { Button } from './Button';
import { Sheet } from './Sheet';
import { colors } from './theme';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmVariant?: 'primary' | 'emergency' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
};

/** Dismissal (backdrop, back gesture, Close) is always the same as cancel. */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'No',
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
  busy,
}: Props) {
  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={onCancel}
      width="52%"
      footer={
        <>
          <Button label={cancelLabel} onPress={onCancel} style={styles.btn} />
          <Button label={confirmLabel} onPress={onConfirm} variant={confirmVariant} style={styles.btn} disabled={busy} />
        </>
      }>
      <Text style={styles.message}>{message}</Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  message: { fontSize: 18, lineHeight: 26, color: colors.ink },
  btn: { minWidth: 120 },
});
