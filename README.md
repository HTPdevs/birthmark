# Birthmark

Birthmark helps anyone at a birth keep an accurate record of what happened and when. Tap once to save the time of a moment, add a label later if you want, review and correct the timeline, and export a PDF report.

It is offline and single-device on purpose: no accounts, no backend, no analytics, and nothing leaves the phone.

## Before you start

- **Read the spec.** [docs/Birthmark_MVP.md](docs/Birthmark_MVP.md) is the source of truth for behavior, UI copy, and data. Tests are named after its scenario IDs (A01, R05, L11, ...). [docs/acceptance-status.md](docs/acceptance-status.md) shows what is verified so far.
- **You need a development build.** Expo Go can't load the app's local native clock module (`modules/clock-snapshot/`). The app still runs without it, but falls back to a JS clock that doesn't track device sleep and shows a warning on the home screen. Build with Android Studio and/or Xcode instead.
- **`ios/` and `android/` are generated.** They are gitignored. Change native settings in `app.json` or the config plugins in `plugins/`, then prebuild again.

## Things that will surprise you

- **Timing uses two clocks.** The wall clock is only for showing the date and time. Elapsed time comes from the device's monotonic clock, which keeps counting while the phone sleeps. Never mix the two, and never count time with `setInterval`.
- **Moments are never deleted or overwritten.** A correction is saved next to the original capture, and accidental taps are flagged rather than removed.
- **Release builds have no internet access on Android.** `android.permission.INTERNET` is blocked in `app.json`. Debug builds get it back through `plugins/withDebugOnlyInternet.js` so they can reach Metro.
- **The Emergency button never calls 911 in development.** It shows `Demo - no call placed`. To test the real handoff, set `EXPO_PUBLIC_PHONE_MODE=live`, or set `EXPO_PUBLIC_TEST_CALL_NUMBER` to a non-emergency number. Never test with a real 911 call.
- **iOS builds need UIScene support.** Builds against the iOS 27 SDK are killed at launch without it. `app.json` turns it on through `expo-build-properties` (`ios.enableSceneSupport`). If you change that setting, run `npx expo prebuild --platform ios --clean`. More: [expo/fyi: ios-scene-lifecycle](https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md).
- **The privacy policy lives in code.** Edit `src/legal/privacyPolicy.ts`. A test fails if `docs/privacy-policy.md` or the published page falls out of sync, or if the app stops matching what the policy claims. The policy is published at https://htpdevs.github.io/birthmark/privacy-policy/.
- **Colors come from theme tokens.** Use `src/ui/theme.ts`. A test fails on hex color literals anywhere else.

## Where things live

| Path | What's there |
| --- | --- |
| `src/app/` | Screens (Expo Router) |
| `src/domain/` | Timing, timeline, and session logic. Plain TypeScript with no React Native, so all of it is testable in Jest |
| `src/storage/` | SQLite schema, migrations, and the write queue |
| `src/report/` | Report model and the HTML used for the PDF |
| `src/platform/` | Thin wrappers around native clock, database, phone, and PDF export |
| `modules/clock-snapshot/` | Local native module for the monotonic clock (Swift and Kotlin) |

## CI

Every pull request runs typecheck, lint, and tests on GitHub Actions, and builds both platforms on EAS.

## License

MIT. See [LICENSE](LICENSE).
