import { router } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ActiveSessionExistsError } from "../domain/sessionController";
import { formatDate, formatElapsed, formatTime24 } from "../domain/time";
import { hasNativeClock } from "../platform/clock";
import { appStore, useAppState } from "../state/store";
import { Button } from "../ui/Button";
import { colors, radius, space, type } from "../ui/theme";

export default function Home() {
  const { active, sessions } = useAppState();
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

  const completed = sessions.filter((s) => s.status === "finished");

  return (
    <SafeAreaView
      style={styles.screen}
      edges={["left", "right", "top", "bottom"]}
    >
      <View style={styles.left}>
        <Text style={styles.brand} accessibilityRole="header">
          Birthmark
        </Text>
        <Text style={styles.tagline}>
          Seamlessly document the birth flow in real-time
        </Text>
        {active ? (
          <Button
            label="Return to recording"
            variant="primary"
            large
            onPress={() => router.push("/record")}
          />
        ) : (
          <Button
            label={starting ? "Starting" : "Start session"}
            variant="primary"
            large
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
      </View>
      <View style={styles.right}>
        <Text style={styles.section}>Completed sessions</Text>
        <FlatList
          data={completed}
          keyExtractor={(s) => s.id}
          ListEmptyComponent={
            <Text style={styles.empty}>No completed sessions.</Text>
          }
          renderItem={({ item }) => {
            const s = item.startedSnapshot;
            return (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/report/[id]",
                    params: { id: item.id },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`Session ${item.shortId}, ${formatDate(s.wallEpochMs, s.utcOffsetMinutes)} at ${formatTime24(s.wallEpochMs, s.utcOffsetMinutes)}`}
                style={({ pressed }) => [
                  styles.item,
                  pressed && styles.pressed,
                ]}
              >
                <View>
                  <Text style={[styles.itemDate, type.tabular]}>
                    {formatDate(s.wallEpochMs, s.utcOffsetMinutes)}{" "}
                    {formatTime24(s.wallEpochMs, s.utcOffsetMinutes)}
                  </Text>
                  <Text style={styles.itemId}>{item.shortId}</Text>
                </View>
                <Text style={[styles.itemDur, type.tabular]}>
                  {item.finishElapsedMs === null
                    ? ""
                    : formatElapsed(item.finishElapsedMs)}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, flexDirection: "row", backgroundColor: colors.paper },
  left: { flex: 6, padding: space.xl, gap: space.lg, justifyContent: "center" },
  right: {
    flex: 4,
    padding: space.xl,
    borderLeftWidth: 1,
    borderLeftColor: colors.line,
  },
  brand: {
    fontSize: 48,
    fontWeight: "900",
    color: colors.ink,
    letterSpacing: -1,
  },
  tagline: { fontSize: 20, color: colors.slate },
  fine: { fontSize: 14, color: colors.danger, lineHeight: 20, maxWidth: 560 },
  warn: {
    fontSize: 14,
    color: colors.danger,
    fontWeight: "600",
    maxWidth: 560,
  },
  error: { fontSize: 16, color: colors.danger, fontWeight: "700" },
  section: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.ink,
    marginBottom: space.md,
  },
  empty: { color: colors.slate, fontSize: 16 },
  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.mist,
    minHeight: 60,
  },
  pressed: { backgroundColor: colors.mist },
  itemDate: { fontSize: 18, fontWeight: "700", color: colors.ink },
  itemId: { fontSize: 14, color: colors.slate },
  itemDur: { fontSize: 18, color: colors.ink },
});
