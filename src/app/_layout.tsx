import { Stack } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { appStore, useAppState } from '../state/store';
import { Button } from '../ui/Button';
import { colors, space } from '../ui/theme';

const CHECKPOINT_INTERVAL_MS = 30_000;

export default function RootLayout() {
  const { status, error, active } = useAppState();

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    void appStore.init();
  }, []);

  // Persist a wall/continuous checkpoint periodically and around app lifecycle
  // changes. Durability never depends on these: every capture commits on its own.
  useEffect(() => {
    if (!active) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' || next === 'background') active.checkpoint();
    });
    const id = setInterval(() => active.checkpoint(), CHECKPOINT_INTERVAL_MS);
    return () => {
      sub.remove();
      clearInterval(id);
    };
  }, [active]);

  if (status !== 'ready') {
    return (
      <SafeAreaProvider>
        <View style={styles.center}>
          {status === 'loading' ? (
            <ActivityIndicator size="large" color={colors.ink} />
          ) : (
            <>
              <Text style={styles.errorTitle}>Storage is unavailable</Text>
              <Text style={styles.errorBody}>
                Birthmark cannot save records right now, so recording is not available. {error}
              </Text>
              <Button label="Try again" variant="primary" onPress={() => void appStore.init()} />
            </>
          )}
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" hidden />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }} />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
    padding: space.xl,
    backgroundColor: colors.paper,
  },
  errorTitle: { fontSize: 26, fontWeight: '800', color: colors.ink },
  errorBody: { fontSize: 18, color: colors.slate, textAlign: 'center', maxWidth: 560 },
});
