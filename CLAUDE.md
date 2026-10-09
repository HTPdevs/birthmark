# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Source of truth

`docs/Birthmark_MVP.md` is the product and technical spec. Read the relevant section before building any feature. It defines exact UI copy, milestone order, data model fields, acceptance IDs (A01-A12, R01-R10, L01-L11), and the visual palette. Do not invent behavior the spec does not describe; when the spec and code disagree, ask.

Product in one line: offline, single-device, landscape app that lets any birth participant record timestamped moments with one tap, run overlapping event timers, review/correct the timeline, and export a PDF report. No accounts, backend, analytics, microphone, or patient identity fields.

## Current state

Working prototype of the MVP (Expo SDK 57, React Native 0.86, React 19.2, TypeScript strict). Per-scenario status and what is still unverified: `docs/acceptance-status.md`. Package manager is npm.

`npx expo install` fails on this machine because `~/.npmrc` sets `allow-scripts`. Read the SDK-compatible version from `node_modules/expo/bundledNativeModules.json` and run `npm install <pkg>@<that range>` instead.

## Commands

```bash
npm test                                  # jest (preset jest-expo/node), tests/**/*.test.ts
npx jest tests/sessionController.test.ts -t "R05"   # one test by name or scenario ID
npm run typecheck                         # tsc --noEmit
npm run lint                              # expo lint
npm run android / npm run ios             # expo run:* builds the dev client (needs the native module)
npm start                                 # expo start --dev-client
```

Expo Go cannot load the local `ClockSnapshot` module. Without it the app uses a JS fallback clock (flagged `fallback` in reports, warned on the home screen). Offline acceptance needs locally signed Release builds.

## Architecture

Routes are in `src/app/`. Path alias: `@/*` -> `src/*` (tests use it, and jest maps it).

- `src/domain/` is pure TypeScript with no React Native imports, so all of it runs in Jest.
  - `types.ts`: branded `WallMs` / `ContinuousMs` / `ElapsedMs`.
  - `time.ts`: anchor math, boot verification, recovery estimate, clock-change detection, formatting and parsing.
  - `timeline.ts`: effective ordering, intervals, live status, row mode.
  - `manualTime.ts`: converts manual or corrected times through the nearest captured reference.
  - `emergency.ts`: the `tel:` handoff over an injected `PhoneAdapter`.
- `SessionController` (`src/domain/sessionController.ts`) owns one loaded session and is the only writer. Every capture reads `clock.read()` first and allocates `captureSequence` synchronously. It then updates in-memory state (subscribers re-render via `useSyncExternalStore`) and only after that enqueues an idempotent DB op on `WriteQueue`. `start()` and `resume()` write to the DB directly and await the commit before the caller may show recording. `load()` on an active session runs recovery: it keeps the anchor if the boot is the same, otherwise it uses the wall-checkpoint estimate and adds a flag.
- `src/storage/`:
  - `db.ts`: the `Db` interface (the subset of expo-sqlite used) and migrations via `PRAGMA user_version`.
  - `repository.ts`: row mapping; every insert is `ON CONFLICT DO NOTHING` so retries never duplicate.
  - `writeQueue.ts`: serial FIFO. A failed op stays at the head and blocks later ops until `retry()`.
- `src/report/`: `buildReport()` returns one model, used by both the report screen and `renderReportHtml()` (escaped, no external assets) for expo-print.
- `src/platform/`: the only React Native / Expo-module code outside the UI (`clock`, `database`, `phone`, `exportPdf`).
- `src/state/store.ts`: `appStore` singleton (DB, active controller, controller cache, session list, clock-format pref) plus hooks. `useClockTick` is display-only at 4 Hz.
- `modules/clock-snapshot/`: Swift (`mach_continuous_time`, `kern.boottime` boot id, `isExcludedFromBackup`) and Kotlin (`elapsedRealtimeNanos`, `Settings.Global.BOOT_COUNT`). Loaded with `requireOptionalNativeModule`.
- Tests: `tests/helpers/sqlite.ts` wraps better-sqlite3 in the `Db` interface. It includes `failNext(regex)` to simulate disk-full errors. `tests/helpers/fakeClock.ts` provides `advance`, `setWallBy`, and `reboot`. Name tests after spec IDs.

Emergency in development is `demo` mode (no call). Use `EXPO_PUBLIC_PHONE_MODE=live` to enable the real handoff, or `EXPO_PUBLIC_TEST_CALL_NUMBER` to dial a non-emergency number.

## Invariants that are easy to break

Timing:
- Two clocks, never mixed. Wall clock (date, timezone, offset) for display; native monotonic clock including sleep (Android `elapsedRealtime`, iOS `mach_continuous_time`) for elapsed. Use distinct TypeScript types for wall timestamps vs elapsed durations.
- `ClockSnapshot.read()` is synchronous and called first in every capture press handler, before labeling, rendering, or DB work. Allocate `captureSequence` before any async write.
- Elapsed = anchor + (continuousMs - anchorContinuousMs). Never increment a counter with `setInterval`; timers only re-render (~4 Hz) from the anchor.
- Wall vs continuous delta drift > 2 s creates a clock-change flag; timezone/offset change is a separate flag. On unverified boot identity, recover from the wall-clock checkpoint and flag "Timing estimated after recovery".
- Store integer ms; elapsed can exceed 24h.

Persistence:
- SQLite with foreign keys, WAL, versioned migrations, bound parameters, serialized mutations. Each capture commits independently of labeling. Never show Saved before commit; failures show Not saved + Retry and keep the original snapshot. Retries are idempotent via UUIDs.
- Finish session is one transaction: boundary, close all active events, bump revision, change status. Don't rely on app-close callbacks; hydrate everything from DB on launch.
- Never hard-delete or overwrite moments. Corrections store `effectiveWallEpochMs` / `effectiveElapsedMs` alongside the original snapshot and write a Revision row. Accidental taps are flagged, excluded from intervals, and kept in the report appendix.
- Ordering: elapsed time, then `captureSequence` for ties. Event boundaries and accidental taps don't reset "Since last moment".
- APGAR: two untimed assessments (1-minute, 5-minute), integer 0-10 enforced by DB constraint, unique per session + point, unset is not 0. Never present an occurrence time.
- Exclude session data from OS cloud backups.

UI:
- Landscape default. Recording screen: the real-time clock spans the full width in the top third (`recordingBands()`, a quarter while the label box shows). Under it, a 65/35 split: left is "Time since" (sized from the clock font by `sinceTimerFonts()`, always smaller than the clock), the milestone row (buttons stretch to fill the remaining height), and the label box only when a target exists; right is History + Finish (icon + label; the icon stacks over the label when `headerShowsLabels()` says the slots are too narrow). The clock band and Time since hide while the keyboard is up so the label input stays visible, the live status list, and Resuscitate + Emergency side by side at the bottom. The spec says 60/40; widened at the operator's request.
- Milestone row order is exact: ROM, Crown, Head, Body, First Cry. After First Cry: Separation Gush, Placenta, APGAR, Go back (`milestoneRowItems()` in `src/ui/milestoneLayout.ts`). APGAR in the row opens the editor and records no moment; Go back calls `controller.showAllMilestones()`; both are outlined, not filled like captures. Buttons share the row width so all fit without sliding (`milestoneRowLayout`); the row scrolls only if that would drop a button below `TOUCH`. Swipes must never capture.
- Resuscitate is a dedicated tile next to Emergency (equal width and height, `ActionTile` in `EmergencyControl.tsx`), not a row entry; it records the milestone immediately (warning color). History on the recording screen holds the save-status slot (Saving / Not saved replace it at the same width) and keeps recording running. The recording screen has no Mark moment / Other, Session elapsed, Recording to, or Events control; `controller.markMoment` and event code stay in the domain.
- Clock tap toggles 24h/12h display only; reports stay 24h.
- Emergency asks for confirmation, then `Linking.openURL("tel:911")` through `PhoneAdapter`. Creates no moment. Never place a real 911 call in dev or tests; inject a mock adapter.
- Labels max 80 chars, with the no-identifying-details guidance. Never claim anonymity or HIPAA approval.
- Palette (brand kit in `assets/README.txt`): Espresso `#3B2A24` primary text, Sage `#8FA89A` dividers (never text), Cream `#FAF3EC` background, Coral `#E8775A` emergency/accents (with espresso text), Rust `#B4472C` errors and the Resuscitate fill (`colors.warning`, cream text), `#6B5C56` secondary text. Use the role tokens in `src/ui/theme.ts`; no hex literals elsewhere (`tests/palette.test.ts` enforces it).
