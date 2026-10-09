import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ActiveSessionExistsError } from "../domain/sessionController";
import { hasNativeClock } from "../platform/clock";
import { appStore, useAppState } from "../state/store";
import { Button } from "../ui/Button";
import { colors, space } from "../ui/theme";

// assets/lockup.png is 1969 x 588 px. The artwork sits inside a transparent
// margin of 100 px on every side (opaque rows 100-487), so the image is drawn
// at LOCKUP_HEIGHT and clipped to the artwork: no transparent band under it,
// and the tagline sits tight against the wordmark.
const LOCKUP_SRC = { w: 1969, h: 588, top: 100, bottom: 488 } as const;
// 140 is 25% larger than the previous 112 (artwork ~92pt tall, was ~74).
const LOCKUP_HEIGHT = 140;
const LOCKUP_WIDTH = Math.round((LOCKUP_HEIGHT * LOCKUP_SRC.w) / LOCKUP_SRC.h);
const LOCKUP_CROP_TOP = Math.floor((LOCKUP_HEIGHT * LOCKUP_SRC.top) / LOCKUP_SRC.h);
const LOCKUP_VISIBLE = Math.ceil((LOCKUP_HEIGHT * LOCKUP_SRC.bottom) / LOCKUP_SRC.h) - LOCKUP_CROP_TOP;
// Height budget on a ~390pt landscape phone (21pt bottom inset, 369 usable):
// 24 + 24 padding, 2 x 16 gaps, lockup 94 + tagline 24, Start button 72, fine
// print 3 lines x 20 = 60. Total 330, so 39pt spare and Start is never clipped.
// The fallback-clock warning or an error adds a row and the column scrolls.

export default function Home() {
  const { active } = useAppState();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recover straight into recording once per launch when a session is running.
  useEffect(() => {
    if (appStore.consumeLaunchRecovery()) router.push("/record");
  }, []);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      await appStore.startSession();
      router.push("/record");
    } catch (e) {
      setError(
        e instanceof ActiveSessionExistsError
          ? e.message
          : `Session could not be saved, so recording did not start. ${e instanceof Error ? e.message : ""}`,
      );
    } finally {
      setStarting(false);
    }
  };

  return (
    <SafeAreaView
      style={styles.screen}
      edges={["left", "right", "top", "bottom"]}
    >
      <View style={styles.body}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.center}
          alwaysBounceVertical={false}
        >
          {/* Lockup and tagline read as one unit, so they sit closer than the column gap. */}
          <View style={styles.brand}>
            <View
              style={styles.lockup}
              accessible
              accessibilityRole="header"
              accessibilityLabel="Birthmark"
            >
              <Image
                source={require("../../assets/lockup.png")}
                style={[styles.lockupImage, { marginTop: -LOCKUP_CROP_TOP }]}
                contentFit="contain"
                accessible={false}
              />
            </View>
            <Text style={styles.tagline}>
              Seamlessly document the birth flow in real-time
            </Text>
          </View>
          {active ? (
            <Button
              label="Return to recording"
              variant="primary"
              large
              onPress={() => router.push("/record")}
            />
          ) : (
            <Button
              label={starting ? "Starting" : "Start"}
              icon="play"
              variant="primary"
              large
              accessibilityHint="Starts a new recording session"
              onPress={start}
              disabled={starting}
              testID="start-session"
            />
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.fine}>
            Records stay on this device. Do not enter names or identifying details
            in labels. Birthmark does not make records anonymous and gives no
            clinical guidance.
          </Text>
          {!hasNativeClock ? (
            <Text style={styles.warn}>
              Fallback clock in use (no native clock module). Use a development or
              release build for accurate elapsed time through device sleep.
            </Text>
          ) : null}
        </ScrollView>
        <View style={styles.topBar}>
          <Button
            label="History"
            icon="time-outline"
            variant="ghost"
            accessibilityHint="Opens finished sessions"
            onPress={() => router.push("/history")}
            testID="open-history"
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  // Inside the safe-area padding, so the absolute top bar stays clear of notches.
  body: { flex: 1 },
  // Absolute so the History button does not push the centered content down.
  topBar: {
    position: "absolute",
    top: 0,
    right: 0,
    zIndex: 1,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  scroll: { flex: 1 },
  // flexGrow, not flex: centers when the column fits, scrolls when it does not,
  // so a short screen never clips the Start button.
  center: {
    flexGrow: 1,
    padding: space.xl,
    gap: space.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  // No gap: the lockup is cropped to its artwork, so the tagline sits right under it.
  brand: { alignItems: "center" },
  lockup: {
    alignSelf: "center",
    width: LOCKUP_WIDTH,
    height: LOCKUP_VISIBLE,
    overflow: "hidden",
  },
  lockupImage: { width: LOCKUP_WIDTH, height: LOCKUP_HEIGHT },
  tagline: { fontSize: 20, color: colors.slate, textAlign: "center" },
  fine: {
    fontSize: 14,
    color: colors.danger,
    lineHeight: 20,
    maxWidth: 560,
    textAlign: "center",
  },
  warn: {
    fontSize: 14,
    color: colors.danger,
    fontWeight: "600",
    maxWidth: 560,
    textAlign: "center",
  },
  error: {
    fontSize: 16,
    color: colors.danger,
    fontWeight: "700",
    maxWidth: 560,
    textAlign: "center",
  },
});
