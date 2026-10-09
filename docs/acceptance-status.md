# Acceptance status

Prototype status against the scenario IDs in `docs/Birthmark_MVP.md`. "Automated" means a Jest test with the ID in its name runs against real SQLite (better-sqlite3) and an injected clock. Physical-device scenarios are not done until someone runs them on hardware and records the results here.

| ID | Status | Evidence |
| --- | --- | --- |
| A01 | Automated | `tests/sessionController.test.ts` "A01 start" (one active session also enforced by a partial unique index) |
| A02 | Automated (domain) | "A02 keeps the capture time when labelled later". The recording screen has no Mark moment button since the October 2026 layout change |
| A03 | Automated (domain) | "A03 persists five rapid captures". No Mark moment button on the recording screen |
| A04 | Automated (capture) / manual (swipe) | One Head moment saved per tap. Swipe-without-capture relies on ScrollView cancelling the press; check on device |
| A05 | Automated (domain) | "A05 overlapping events". No Events button on the recording screen, so events cannot be started from the UI |
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
| L04 | Automated (order, width) / device | `tests/timeline.test.ts` exact order, Resuscitate and APGAR kept out of the capture codes; `tests/milestoneLayout.test.ts` "milestone row items (L04, L06)" row contents and all buttons fit the row width or fall back to scrolling. Buttons are a fixed 64pt tall (`MILESTONE_BUTTON_HEIGHT`). Label fit on real screens needs a device check |
| L05 | Automated | `tests/timeline.test.ts` "Since Crown" |
| L06 | Automated / device | "milestone row (L06)" (controller); `tests/milestoneLayout.test.ts` "L06 after First Cry" row is Separation Gush, Placenta, APGAR (opens the editor, records no moment), Go back (restores the full row). Button wiring needs a device check |
| L07 | Automated | `tests/timeline.test.ts` "opens tel:911 exactly once" |
| L08 | Automated | "L08 flagging the newest milestone" |
| L09-L10 | Automated | "APGAR (L09, L10)" |
| L11 | Automated | "reports an unavailable phone handler" |

## On-screen report vs PDF

Both views come from one `buildReport()` model (`src/report/reportModel.ts`) and share these rules:

- Recorded time starts at the first recorded moment, not at Start. The origin is `recordingOrigin()` in `src/domain/timeline.ts`: the smallest effective elapsed among captures and milestones not flagged accidental, so a manual or corrected earlier moment moves it. This is display only; the clock anchor, the database, and every stored elapsed value still count from session start.
- Total time is the finish (or now, while active) minus the origin, and a dash before any moment is recorded. History shows the same value per session, from `firstMomentElapsedMs` that `listSessions()` computes in SQL with the same rules.
- Dates show as MM-DD-YYYY everywhere (`formatDate`). The PDF file name (`reportFileName`) stays year first so files sort by date.
- Timeline entries: the first recorded moment is its bare name ("ROM"); each later one carries the interval from the previous one ("ROM to Crown: 00:03:12"). Accidental taps are left out and do not split an interval. There is no Start row, no "Start to" span, and no finish or resume row; finishes and resumptions (with the resume gap) are listed only in the PDF appendix.
- The Edit and Add to timeline sheets show and accept elapsed time from the same origin (`draftAt` / `draftToInput` with `recordingOrigin`); stored elapsed still counts from Start.
- Notes is its own section after APGAR assessments: one line per timeline entry with a milestone label or flags ("Crown: slow, Manual"), or "No notes."

On screen: the title is "Report for MM-DD-YYYY" and there is no meta row (Date moved into the title; start and end time were removed). Home is an icon-only button (the label "Home" stays as the accessibility label), on History too. The timeline table has columns #, Entry, Time (24h), numbered from 1, rows still tap to edit, and it ends with a "Total time: HH:MM:SS" line. Session ID, Timezone, Events, and the Appendix are not on screen. As a result, a capture flagged as an accidental tap has no on-screen place to be reopened and unflagged. A08 is covered at the controller level and is unaffected.

PDF (`src/report/renderHtml.ts`): heading "Report for MM-DD-YYYY"; metadata keeps session ID, revision, generated time, timezone, and offsets (no start or finish time; Total time appears once, at the end of the timeline). The timeline columns are #, Entry, Time (24h), Elapsed, Group, with # as the capture sequence and Elapsed counted from the origin (rows before the origin, such as an event started earlier, show a dash); the table ends with a Total time row unless it is empty. Notes follows APGAR. The appendix (excluded captures with their labels and flags, original values, finishes and resumptions, clock and recovery flags, change history) is unchanged in content, and its elapsed values count from session start, which a line under the Appendix heading states. All dynamic values are escaped (tested in `tests/report.test.ts`).

## Verified in this pass

- `npm test`: 92 tests pass.
- `npm run typecheck` and `npm run lint` are clean.
- Android debug build of the dev client (`expo run:android`), including the Kotlin `ClockSnapshot` module, built and installed on a Pixel 7 emulator (API 37). The app launched in landscape. Start, milestone capture, live status ("Since ROM"), finish, and the report screen ran on the emulator.

## Not verified

- iOS: the Debug dev client builds with Xcode 27 (iOS 27 SDK) and launches on the iPhone 18 Pro simulator, using UIScene support from `expo-build-properties` (`ios.enableSceneSupport`). No physical iOS device or Release build has been run.
- PDF output: the HTML is tested, but no generated PDF has been opened and reviewed.
- Every physical-device, offline Release-build, and practice-tester scenario.
- The October 2026 recording layout (Resuscitate and APGAR buttons, fitted milestone row, no Events button) has not been run on a device or emulator.
