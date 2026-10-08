# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Source of truth

`docs/Birthmark_MVP.md` is the product and technical spec. Read the relevant section before building any feature. It defines exact UI copy, milestone order, data model fields, acceptance IDs (A01-A12, R01-R10, L01-L11), and the visual palette. Do not invent behavior the spec does not describe; when the spec and code disagree, ask.

Product in one line: offline, single-device, landscape app that lets any birth participant record timestamped moments with one tap, run overlapping event timers, review/correct the timeline, and export a PDF report. No accounts, backend, analytics, microphone, or patient identity fields.

## Current state

- Fresh `create-expo-app` scaffold (Expo SDK 57, React Native 0.86, React 19.2, TypeScript strict). `npm run reset-project` has already been run: the starter app lives in `example/` (gitignored) and `src/app/` holds a blank `_layout.tsx` + `index.tsx`.
- The `reset-project` script in `package.json` is now stale (`scripts/` moved to `example/scripts/`). Don't run it.
- None of the spec's dependencies are installed yet. Install with `npx expo install`: `expo-sqlite expo-print expo-sharing expo-file-system expo-keep-awake expo-haptics expo-dev-client expo-screen-orientation`.
- No test runner, no ESLint config, no git commits, no remote yet. Spec wants a `tests/` dir covering timing, recovery, persistence, and report.
- Package manager is npm (`package-lock.json`).

## Commands

```bash
npm start                      # expo start
npx expo start --dev-client    # once expo-dev-client + native module exist
npx expo run:ios [--device]    # local native build (required for the clock module)
npx expo run:android [--device]
npx expo lint
npx tsc --noEmit
npx expo-doctor
```

Expo Go cannot run this app once the local `ClockSnapshot` native module exists. Offline acceptance requires locally signed Release builds (spec "Daily testing and offline validation").

## Planned architecture (from spec)

Spec layout uses `app/`; in this repo routes go in `src/app/` and everything else under `src/`. Path aliases: `@/*` -> `src/*`, `@/assets/*` -> `assets/*`. Typed routes and React Compiler are enabled in `app.json`.

| Path | Layer |
| --- | --- |
| `src/app/` | Expo Router routes: home/history, record, report |
| `src/components/` | capture button, milestone row, label area, events drawer, sheets |
| `src/domain/` | models, session service, time rules (pure, testable) |
| `src/storage/` | SQLite migrations, repositories, serialized write queue |
| `src/report/` | one normalized report model feeding both on-screen view and escaped-HTML PDF (expo-print + expo-sharing) |
| `modules/clock-snapshot/` | local Expo module (Swift + Kotlin), created via `npx create-expo-module@latest --local` |
| Platform adapters | keep-awake, haptics, orientation, file export, `PhoneAdapter` for `tel:911` |

Session state lives in a small reducer/service; no global state library required.

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
- Landscape default; 60/40 split (clock + capture left, live status right).
- Milestone order is exact: ROM, Crown, Head, Body, First Cry, Resuscitate, APGAR. After First Cry: Separation Gush, Placenta, APGAR plus "All milestones". Swipes must never capture. APGAR opens an editor, not a moment.
- Clock tap toggles 24h/12h display only; reports stay 24h.
- Emergency asks for confirmation, then `Linking.openURL("tel:911")` through `PhoneAdapter`. Creates no moment. Never place a real 911 call in dev or tests; inject a mock adapter.
- Labels max 80 chars, with the no-identifying-details guidance. Never claim anonymity or HIPAA approval.
- Palette: `#2D3142` primary text, `#BFC0C0` dividers, `#FFFFFF` background, `#EF8354` emergency/accents (with dark text), `#4F5D75` secondary text.

## Testing approach (from spec)

- Deterministic clock-service tests with injected snapshots.
- Real SQLite integration tests for commit and recovery.
- Physical-device end-to-end runs for acceptance; simulator success alone is insufficient.
