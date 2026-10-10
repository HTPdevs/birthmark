import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  PRIVACY_EFFECTIVE_DATE,
  PRIVACY_INTRO,
  PRIVACY_SECTIONS,
  PRIVACY_TITLE,
} from "../legal/privacyPolicy";
import { Button } from "../ui/Button";
import { colors, space } from "../ui/theme";

// Bundled text, not a web link: the app is offline, and Google Play requires
// the policy to be readable inside the app as well as at the listing URL.
export default function Privacy() {
  return (
    <SafeAreaView
      style={styles.screen}
      edges={["left", "right", "top", "bottom"]}
    >
      <View style={styles.toolbar}>
        <Button
          label="Home"
          icon="home"
          iconOnly
          variant="ghost"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
        />
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
          {PRIVACY_TITLE}
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.date}>Effective {PRIVACY_EFFECTIVE_DATE}</Text>
        <Text style={styles.paragraph}>{PRIVACY_INTRO}</Text>
        {PRIVACY_SECTIONS.map((s) => (
          <View key={s.heading} style={styles.section}>
            <Text style={styles.heading} accessibilityRole="header">
              {s.heading}
            </Text>
            {s.paragraphs.map((p) => (
              <Text key={p} style={styles.paragraph} selectable>
                {p}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
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
  // Line length capped for reading in landscape.
  body: { padding: space.xl, gap: space.lg, maxWidth: 760, alignSelf: "center" },
  date: { fontSize: 14, color: colors.slate },
  section: { gap: space.sm },
  heading: { fontSize: 19, fontWeight: "700", color: colors.ink },
  paragraph: { fontSize: 16, lineHeight: 24, color: colors.ink },
});
