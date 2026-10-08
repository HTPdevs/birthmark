# Acceptance status

Prototype status against the scenario IDs in `docs/Birthmark_MVP.md`. "Automated" means a Jest test with the ID in its name runs against real SQLite (better-sqlite3) and an injected clock. Physical-device scenarios are not done until someone runs them on hardware and records the results here.

| ID | Status | Evidence |
| --- | --- | --- |
| A01 | Automated | `tests/sessionController.test.ts` "A01 start" (one active session also enforced by a partial unique index) |
| A02 | Automated | "A02 keeps the capture time when labelled later" |
| A03 | Automated | "A03 persists five rapid captures" |
| A04 | Automated (capture) / manual (swipe) | One Head moment saved per tap. Swipe-without-capture relies on ScrollView cancelling the press; check on device |
| A05 | Automated | "A05 overlapping events" |
| A06 | Automated | "A06 ... finish uses one boundary for everything" |
| A07 | Automated | "A07 resume includes the gap" |
| A08 | Automated | "A08 correct, flag, and add missed moment" |
| A09 | Automated | "A09 timezone change", report cross-midnight test |
| A10 | Automated (model + HTML) | `tests/report.test.ts` "A10". PDF page layout still needs a visual review |
| A11 | Automated (records) | "deletion (A11)". Cached PDF removal is in `appStore.deleteSession`, not unit tested |
| A12 | Manual | Export errors are caught and show Retry. The session is never touched by export code |
| R01 | Automated (math) / device | `tests/time.test.ts`. Real lock/background run needed on hardware |
| R02 | Automated | "R02 relaunch within the same boot" |
| R03 | Automated | "R03 a wall clock change" |
| R04 | Automated | "R04 reboot uses the wall checkpoint estimate" |
| R05 | Automated | "R05 a failed write shows not saved" |
| R06 | Automated | "R06 a failed finish transaction" (mutation-checked: removing the transaction makes it fail) |
| R07 | Device | Needs offline Release builds on both platforms |
| R08 | Implemented | `useKeepAwake` on the recording screen only |
| R09 | Partly | Accessibility labels set, live timers not announced. Largest-text pass not done |
| R10 | Device | Five-minute comparison against an independent timer |
| L01-L02 | Device | Landscape is locked (both directions via `expo-screen-orientation`). Distance reading needs testers |
| L03 | Automated | `tests/time.test.ts` noon/midnight. The toggle is display-only |
| L04 | Automated (order) | `tests/timeline.test.ts` exact order |
| L05 | Automated | `tests/timeline.test.ts` "Since Crown" |
| L06 | Automated | "milestone row (L06)" |
| L07 | Automated | `tests/timeline.test.ts` "opens tel:911 exactly once" |
| L08 | Automated | "L08 flagging the newest milestone" |
| L09-L10 | Automated | "APGAR (L09, L10)" |
| L11 | Automated | "reports an unavailable phone handler" |

## Verified in this pass

- `npm test`: 57 tests pass.
- `npm run typecheck` and `npm run lint` are clean.
- Android debug build of the dev client (`expo run:android`), including the Kotlin `ClockSnapshot` module, built and installed on a Pixel 7 emulator (API 37). The app launched in landscape. Start, milestone capture, live status ("Since ROM"), finish, and the report screen ran on the emulator.

## Not verified

- iOS: this machine has no Xcode, so the Swift module and iOS build have not been compiled.
- PDF output: the HTML is tested, but no generated PDF has been opened and reviewed.
- Every physical-device, offline Release-build, and practice-tester scenario.
