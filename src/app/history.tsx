import { router } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { formatDate, formatElapsed, formatTime24 } from "../domain/time";
import { useAppState } from "../state/store";
import { Button } from "../ui/Button";
import { colors, radius, space, type } from "../ui/theme";

export default function History() {
  const { sessions } = useAppState();
  const completed = sessions.filter((s) => s.status === "finished");

  return (
    <SafeAreaView
      style={styles.screen}
      edges={["left", "right", "top", "bottom"]}
    >
      <View style={styles.toolbar}>
        <Button
          label="Home"
          variant="ghost"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
        />
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
          History
        </Text>
      </View>
      <FlatList
        data={completed}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
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
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  title: { flex: 1, fontSize: 22, fontWeight: "800", color: colors.ink },
  list: { padding: space.lg },
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
