# Birthmark Mobile App MVP

Minimum Viable Product Specification

Version 1.2  |  October 7 2026  |  Birthmark

Build a mobile app that lets any participant at a birth record a moment with one tap while the session timer continues. The app supports overlapping event timers and produces a chronological report for the midwife to transcribe into their own documentation system.

The first release runs entirely on one device, without accounts or a backend. It supports iOS and Android phones and tablets, including Google Pixel devices, and keeps completed sessions locally until they are manually deleted.

### Product outcome

A participant can start a session, record unlabeled or preset moments, group moments within events, finish the session, review the timeline, and save a PDF. Recording must remain available while optional labeling is in progress.

### Implementation recommendation

Use React Native with Expo and TypeScript. Share the interface, persistence, and reporting code across platforms. Add a small local native clock module for elapsed time that includes device sleep. Use native builds for final testing; the custom clock module is not available in stock Expo Go. Technical references appear at the end of this document.

### Decisions established for the MVP

- One active session per device; multiple event timers can overlap within that session.
- Landscape recording screen with a large clock, milestone row, dedicated Resuscitate and APGAR buttons, live status panel, and protected Emergency action.
- Clock time and time since the previous moment are visible on the recording screen.
- Session time continues through screen lock, backgrounding, and app closure until explicitly finished.
- Patient names and identity fields are excluded. Optional short labels carry guidance against identifying information.
- The deliverable is a build specification. The implementation steps below create a project scaffold; application code must still be implemented and tested.

## Users and scope

Any participant may operate the recording device. The workflow must fit home births, birth centers, hospitals, and transfers between settings without collecting a setting, patient, or participant identity. A device can be handed to another participant without signing in or switching roles.

| Included in the first release | Deferred |
| --- | --- |
| Offline session recording and local history | Multi-device participation in the next deployment |
| Generic capture with optional labels and milestone buttons | Voice commands and wake-word recognition |
| Overlapping named event timers | Nested events or a visual Git-style branch tree |
| Review, corrections, accidental-tap flags, missed moments | Clinical recommendations, alerts, or intervention prompts |
| On-screen report and PDF export | EHR integration, cloud sync, accounts, and CSV export |

### Core user stories

- As a participant, I can record the time first and decide what to call the moment afterward.
- As a participant, I can start and end an event timer without interrupting the overall session or another active event.
- As a midwife, I can review capture order, time intervals, event groups, and later corrections before transcribing the record.
- As a participant, I can reopen the app and recover the active session without restarting its clock.
- As a midwife, I can export the report again later and explicitly delete the local session.

### Operating boundaries

No microphone permission, audio recording, remote logging of session content, advertising, or analytics is required. Birthmark records observations selected by the operator. It does not decide when an event has occurred or give clinical instructions.

Exclude session data from automatic OS cloud backups and verify the native backup settings. No name, date of birth, address, medical record number, or patient profile is collected. A short free-text label can still contain identifying information; the interface must not claim that labels or timestamps are automatically anonymous or that the app is HIPAA approved.

### Success measures

A generic moment requires one tap from the recording screen. No typing or confirmation precedes capture. Practice testers can complete a session, manage two overlapping events, find a correction, and save a PDF without assistance. All critical functional, reliability, and landscape acceptance scenarios must pass on both platforms.

## Recording interface

Recording-screen layout decision (product owner, October 2026): the recording screen has no Mark moment / Other button, no Session elapsed or Recording to display, and no Events button. Resuscitate and APGAR moved out of the milestone row into their own buttons. Generic captures and event timers remain in the session service, timeline, and report; where this document describes tapping Mark moment or opening Events on the recording screen, that control is not present. This decision takes precedence over those passages.

Default the app to landscape. The recording viewport has two persistent panels: the clock and capture controls on the left, and live milestone status on the right. Start with a 60/40 width split, then adjust to preserve clock legibility and touch targets on each supported device.

### Large real time clock

Place the current device clock at the top left in bold tabular digits. Start in 24-hour format, HH:mm:ss. Tapping the clock toggles to h:mm:ss AM/PM; tapping again restores 24-hour time. Include a small 24h or 12h indicator and an accessible Toggle clock format label. This is a display change only and never records a moment or modifies a timestamp.

Use the largest unclipped clock size the left panel permits, starting around 72 logical units on phones and scaling up on tablets. Reading the clock from about 10 feet is a physical-device acceptance target, not a guarantee based on font size. Keep Since last moment underneath in smaller, clearly labeled type.

### Milestone controls

Directly below the clock, show milestone buttons in this exact order: ROM, Crown, Head, Body, First Cry. Size the buttons to share the row width so every button is visible without horizontal sliding and First Cry shows by default. Each milestone tap captures and labels one moment immediately, with no confirmation or typing. If sharing the width would make a button narrower than the minimum touch target, the row scrolls instead and shows a small scroll cue. A swipe must not trigger capture.

After First Cry is recorded, present Separation Gush, Placenta in that order as the active subset. Recommended behavior is to replace the row temporarily and provide All milestones to restore the full row. Permit out-of-order and repeat captures; these buttons document operator observations rather than enforce a clinical sequence.

Below the row, show two large buttons: Resuscitate and APGAR. Resuscitate records the Resuscitate milestone immediately, the same way as a milestone tap, and uses the warning color (rust with cream text). APGAR opens the assessment editor without creating a timestamped moment. The optional 80-character label box for the most recent generic capture sits beside these buttons, with the guidance: Use event labels only. Do not enter names or identifying details. A newer capture never overwrites an earlier unlabeled record.

### Live status and event management

The right panel shows the latest included milestone prominently with its capture timestamp underneath. Previous milestones move upward, remain visible, and use quieter typography. For Crown followed by Head, show Crown above Head and the fixed elapsed interval labeled Since Crown. Maintain a scrollable history as the list grows; keep the current milestone visible.

Generic moments and event boundaries do not replace the prominent milestone or reset its transition interval. Since last moment remains a separate timer for all included moments. The panel represents recorded observations, not an automatically determined clinical state. The top bar holds the save status and a full-color Finish button; there is no Events button on the recording screen.

Place Emergency at the bottom right, separate from other controls. Tapping opens Are you sure? with Yes and No and explanatory text: Yes opens the phone app to call 911. No or dismissal makes no recording change. Timers continue through the dialog. Yes opens the system phone interface to call 911. Complete any system confirmation there; session timing continues. This action does not automatically create a timed moment.

## Session and event behavior

| Action | Required behavior |
| --- | --- |
| Start session | No setup form. Persist the start snapshot and then show the recording screen. Reject a second active session. |
| Start event | Capture its start immediately, persist the boundary, and select it. Offer an optional label afterward; default to Event N. |
| Mark moment | Capture clock and elapsed values before labeling, rendering, or database work. Preserve each intentional tap. |
| End event | Capture its boundary immediately. End that event only; other event timers and session time continue. |
| Body | Capture the Body milestone. Keep all timers running until their explicit end actions. |
| Finish session | Ask for confirmation first. The confirming tap supplies one snapshot used to finish the session and every active event atomically. |
| Resume session | Confirm from the report menu. Log the prior finish and resumption. Include the intervening gap in overall elapsed time. |
| Delete session | Confirm deletion of a completed session. Remove its database records and app-managed cached exports. |

### Resumption rules

Resumption corrects a mistakenly finished session. It does not reopen event timers that were ended at finish; start new events as needed. A new finish replaces the report end boundary while previous finish and resume actions remain in the change history. If another session is active, resumption is unavailable.

Do not create a pause segment or subtract the gap from overall elapsed time. Label the gap Resumed after finish in the report. Any PDF already exported remains an earlier revision, so the next export receives a new revision number.

### Timeline rules

All moments and event boundaries appear in the overall timeline. Event grouping is a secondary view, using the same records. Event-start and event-end boundaries are system records and do not reset the main Since last moment display. On a session with no included moments, show an em dash for that value.

Generic captures receive sequential names such as Moment 1. Labeling does not renumber them. Ordering uses elapsed session time, then a persisted capture sequence for ties. Keep the original capture order available when a correction changes the displayed chronology.

## Time capture and recovery

### Two separate clocks

Clock time comes from the device wall clock and supplies date, 24-hour time, timezone, and UTC offset. Elapsed time comes from a native monotonic clock that includes device sleep: Android elapsedRealtime and iOS mach_continuous_time with its timebase conversion. These sources support interval measurement without depending on wall-clock adjustments [8, 9].

The local ClockSnapshot module returns wallEpochMs, continuousMs, timezoneId, utcOffsetMinutes, and a boot identity when reliably available. Use a synchronous function at the start of the press handler. Keep its execution short and allocate capture sequence numbers before any asynchronous write.

```text
snapshot = ClockSnapshot.read()
elapsedMs = elapsedAtAnchorMs
          + snapshot.continuousMs - anchorContinuousMs
intervalMs = elapsedMs - previousIncludedMomentElapsedMs
queuePersist({ snapshot, elapsedMs, captureSequence })
```

A screen refresh is only a display update. Never increment an elapsed counter with setInterval. Recompute from the anchor, refreshing visible seconds approximately four times per second while foregrounded. Store integer milliseconds internally, but show HH:mm:ss by default. An elapsed duration can exceed 24 hours.

### Clock changes and device restarts

Compare the difference between wall-clock and continuous-clock deltas at captures and foreground recovery. A difference over 2 seconds creates a clock-change flag; a timezone or offset change creates a separate flag. Preserve every original snapshot and elapsed value. Do not silently rewrite prior moments to fit a new wall clock.

On process restart within a verified same boot, restore the persisted clock anchor. If a reboot is detected, or the boot identity cannot be verified, use the saved wall-clock checkpoint as a recovery estimate, establish a new anchor, and flag the affected interval Timing estimated after recovery. A device clock change during an unobserved restart cannot always be reconstructed.

### Accuracy statement

Captured time means the time the app processes the tap. Touch delivery, native-call latency, device clock accuracy, and human reaction time limit precision. Millisecond storage is not a claim of millisecond accuracy. A force-close can lose a capture that has not committed; the interface must distinguish pending from saved.

## Persistence and data model

Use a local SQLite database with foreign keys, WAL mode, versioned migrations, bound parameters, and serialized mutations. Commit every capture independently of label entry. Keep a failed write in a retry queue while the process remains alive; never show Saved before commit. SQLite persistence survives normal app restarts [2].

| Entity | Minimum fields |
| --- | --- |
| Session | id UUID; status; started snapshot; current finish snapshot; clock anchor; elapsed checkpoint; revision; createdAt; schemaVersion |
| Event | id UUID; sessionId; label; start boundaryId; end boundaryId nullable; status; endedBySessionFinish |
| Moment | id UUID; sessionId; eventId nullable; captureSequence; kind; original snapshot; originalElapsedMs; label; source; flaggedAccidental; milestoneCode nullable |
| Assessment | id UUID; sessionId; assessmentPoint: one_minute or five_minute; score: integer 0–10; unique sessionId plus assessmentPoint; no occurrence timestamp |
| Revision | id UUID; sessionId; momentId nullable; assessmentId nullable; action; old value; new value; reason optional; changedAt; revisionNumber |
| Timing flag | id UUID; sessionId; boundary or momentId; type; affected interval; observed wall and continuous deltas |
| Export record | sessionId; revisionNumber; generatedAt; cachedFilePath nullable |

### Snapshot fields and derived values

A snapshot stores wallEpochMs, continuousMs, boot identity if available, timezoneId, UTC offset, and time-source quality. A manually entered or corrected moment also stores effectiveWallEpochMs and effectiveElapsedMs separately from any original capture. Never overwrite the original snapshot.

Derive Since previous moment from the effective timeline, excluding accidental taps and system boundaries. Recompute intervals after a correction. Event duration comes from its start and end elapsed values, or current elapsed for an active event. Preserve timing quality flags on derived values.

Store clockFormat and milestoneRowMode as local UI preferences. Default the first launch to 24-hour time. Restore the chosen clock display thereafter. On recovery, derive live milestone history from saved moments and row mode from the latest First Cry or explicit row selection. Reports retain 24-hour time by default, independently of the large-clock display.

Assessment edits use the same revision mechanism as other edits. Internal change-history timestamps may record when data was edited, but must never be presented as APGAR assessment occurrence times. Save scores locally with a database constraint enforcing 0–10 and a unique record for each session and assessment point.

### Transactions and failures

Finish uses one transaction to persist its boundary, close all active events, increment the revision, and change session status. Restore session, events, pending label context, and latest timeline from the database on launch. Do not depend on an app-close callback for durability.

Use unique IDs to make retry operations idempotent. Multiple intentional taps are separate records even when timestamps match. A database failure shows Not saved with Retry; retain the original timestamp. If persistence is unavailable at session start, show the failure and do not enter an apparently durable recording session.

## Corrections and report output

### Review without erasing the capture

Users can rename a label, flag or unflag an accidental tap, add a missed moment, or correct the effective time. Every change increments the session revision and records its old and new value. Do not hard-delete individual moments. An accidental tap stays visible as excluded in review and the report appendix.

For a missed moment, accept either elapsed time or a local date and 24-hour time with the session offset shown. Require a date for cross-midnight entries and explicit offset selection for ambiguous local times. Require the effective time to fall within the session, and within its event if grouped. Default manual entries to the Session group.

Convert elapsed entries to wall time using the relevant clock anchor. When clock changes make wall-time conversion ambiguous, require the user to choose the interval and mark it Manual time. Preserve the source as Manual or Corrected. Labels remain optional; long narrative notes are outside the MVP.

### Report structure

- Header: local session ID, session date, start/end clock timestamps, timezone and offsets, total elapsed duration, report revision, and generation time.
- Timeline: sequence, label, 24-hour time, elapsed session time, interval since previous included moment, event group, and source or quality flags.
- Event summary: event label, start/end time, duration, and whether it ended automatically at session finish.
- APGAR assessments: separate untimed rows labeled 1-minute APGAR and 5-minute APGAR with the entered score from 0–10, or Not entered. Include assessment edits in change history without implying a clinical assessment time.
- Appendix: excluded captures, original values for corrected records, prior finishes/resumptions, and clock or recovery flags.
- Footer: Times captured from this device. Manually entered, corrected, or estimated values are identified.

### PDF export

Generate the PDF locally from an escaped HTML template with expo-print [3]. Use an OS save/share flow through expo-sharing so the operator can choose a destination [4]. On iOS, use the available Files destination; on Android, test available file destinations and supply a platform file-save fallback if required. No automatic remote delivery occurs.

Use a filename such as Birthmark_2026-10-07_142208_AB12_r3.pdf. Repeat column headers across pages, avoid splitting a row, and keep a readable minimum 10-point font. Use text-only reports without downloaded assets. Export failure leaves the session intact and offers Retry.

History shows completed sessions by date, start time, duration, and an opaque short ID. PDFs saved outside the app are independent copies; deleting a session cannot remove those copies. Clear app-owned export caches on deletion and after sharing when safe.

## Technical architecture

Recommended stack: React Native, Expo, and TypeScript with strict checking. TypeScript helps define timer states and prevents mixing wall time with elapsed durations. Use distinct types for wall-clock timestamps and elapsed durations. Expo supplies cross-platform modules and a native development workflow [1, 5, 6].

| Layer | Responsibility |
| --- | --- |
| Screens and components | Home, history, landscape recording, live status, milestone row, report, correction and confirmation sheets |
| Session service | Start, mark, label, create/end event, finish/resume, corrections, APGAR assessment saves, revision control |
| Clock service | Native snapshot reads, elapsed anchors, boot checks, clock-change flags, recovery estimates |
| Repository | SQLite transactions, mutation queue, migration, idempotent retries, session hydration |
| Report service | One normalized report model for on-screen and escaped HTML PDF output |
| Platform adapters | Keep awake, optional haptics, lifecycle handling, native clock, OS file export; orientation; protected telephone handoff |

### Dependencies and project layout

Use expo-sqlite, expo-print, expo-sharing, expo-file-system, expo-keep-awake, expo-haptics, expo-screen-orientation, and expo-dev-client. Use Expo Router from the default scaffold. Keep session state in a small reducer/service; an external global-state library is optional, not required.

```text
app/                 home, history, record, report routes
src/components/      Resuscitate and APGAR buttons, label area
src/domain/          models, session service, time rules
src/storage/         migrations, repositories, write queue
src/report/          report model, HTML renderer, export
modules/clock-snapshot/  Swift and Kotlin clock adapter
tests/               timing, recovery, persistence, report
```

### Emergency phone adapter

Use React Native Linking.openURL("tel:911") behind a PhoneAdapter [11]. This requests the system phone interface; it does not guarantee dialing or connection. Handle rejected handoffs and devices without a phone handler. A successful link promise is not evidence that an emergency call connected. The documentation app remains offline capable, but calling requires suitable device telephony service.

In development and automated tests, inject a mock PhoneAdapter and show a clear Demo — no call placed message. Do not place live emergency calls to validate the feature. Physical-device validation may use an explicitly configured non-emergency test number in a clearly identified test build; the production number remains 911.

### Framework alternatives

Flutter is a reasonable alternative for a team that prefers Dart. Separate Swift and Kotlin apps would allow platform-specific control but duplicate much of this interface and reporting work. A browser app is less suitable for the requested native lifecycle and device testing. React Native with Expo is the recommended fit for this React-oriented project; this is an architectural judgment rather than a benchmark claim.

Use local native builds for the clock adapter. No cloud account or hosted runtime is necessary for the product. The minimum supported OS versions should follow the selected stable Expo SDK and be recorded in the repository after dependency resolution; do not promise compatibility with every historical device.

## Local implementation plan

### Mac prerequisites

Install an active Node.js LTS version, Xcode with an iOS simulator, and Android Studio with an Android SDK, emulator, and compatible JDK. Follow the selected SDK setup requirements. Physical iOS testing needs signing and device trust; physical Android testing needs USB debugging. Dependencies and tooling require internet during setup, while the installed application must record offline [1, 5].

### Create and build the project

```text
npx create-expo-app@latest birthmark
cd birthmark
npx expo install expo-sqlite expo-print expo-sharing
npx expo install expo-file-system expo-keep-awake
npx expo install expo-haptics expo-dev-client expo-screen-orientation
npx create-expo-module@latest --local
# Name the module ClockSnapshot; select Apple and Android.
# Implement its snapshot function and app screens first.
npx expo run:ios
npx expo run:android
```

Use the default TypeScript scaffold. The local module command creates native source files, not the finished clock implementation [7]. Commit the lockfile and record the resolved Expo, React Native, Node, Xcode, and Android toolchain versions. Do not upgrade dependencies during acceptance testing.

### Daily testing and offline validation

```text
npx expo start --dev-client
# Build on a connected physical device when needed:
npx expo run:ios --device
npx expo run:android --device
# Validate dependency alignment:
npx expo-doctor
```

A debug build usually loads JavaScript from the Mac development server. That does not prove offline cold-launch capability. Before acceptance, create locally signed Release builds that embed the JavaScript bundle, install them on devices, disconnect from the Mac, enable airplane mode, and cold-launch the app. Use Xcode and Android Studio release configurations if CLI signing needs adjustment [5].

### Build sequence

- 1. Prove the native clock and SQLite recovery with sleep, app termination, and a manual clock adjustment.
- 2. Implement landscape layout, clock-format toggle, milestone captures, live status, and local history.
- 3. Add event selection, overlapping timers, finish, and resumption.
- 4. Add corrections, report model, PDF export, and session deletion.
- 5. Test accessibility, interruption recovery, physical-device export, and offline release builds.

## Functional acceptance criteria

Run deterministic clock-service tests using injected snapshots. Use real SQLite integration tests for commit and recovery behavior. Then run end-to-end practice sessions on physical devices; simulator success alone is insufficient.

| ID | Scenario and expected result |
| --- | --- |
| A01 | Start offline with no form or account. A session persists and one active session is enforced. |
| A02 | Tap Mark moment, wait 10 seconds, then label it. The timestamp remains the capture time and the timer keeps running. |
| A03 | Capture five moments rapidly. All five persist in sequence; entering a label or showing a keyboard never blocks capture. |
| A04 | Tap Head in the milestone row. Exactly one Head moment is saved. Swipe across the row without creating a moment. |
| A05 | Run two overlapping events. Selecting one changes grouping only. Ending one leaves the other and the session active. |
| A06 | Capture Body and First Cry. The session stays active. Finish confirmation uses one boundary for the session and active events. |
| A07 | Reopen a completed report and resume. Total elapsed includes the gap; previously ended events stay ended; revisions remain visible. |
| A08 | Correct a timestamp, flag an accidental tap, and add a missed moment. Original values survive; report order and intervals recompute. |
| A09 | Cross midnight and change timezone. Stored date and offsets remain attached to each timestamp; elapsed stays continuous. |
| A10 | Export a report with 500 entries, overlapping events, long labels, and corrections. All records appear; PDF rows and headers remain readable. |
| A11 | Delete a completed session. Its local records and cached PDF disappear; other sessions remain; external PDF copies are unaffected. |
| A12 | Force PDF export failure. Records remain intact, Retry works, and session recording is unaffected. |

### Practice test for interface simplicity

Ask at least three representative birth participants to record six fictional moments, create two overlapping events, finish, and export. Observe capture errors, time spent navigating, and confusion between labeling an existing moment and creating a new one. Revise labels or layout before adding more controls.

## Reliability and release criteria

| ID | Scenario and expected result |
| --- | --- |
| R01 | Lock the device for five minutes and switch apps. On return, elapsed includes the absence without a background JavaScript interval. |
| R02 | Terminate and relaunch after a committed capture. All saved records recover; same-boot timing resumes or explicitly shows recovery uncertainty. |
| R03 | Adjust wall clock by plus or minus 10 minutes. Elapsed remains continuous; new wall times reflect the device; the report flags the change. |
| R04 | Restart the device during an active session. Do not treat pre-reboot monotonic values as comparable. Show an estimated recovery interval. |
| R05 | Simulate full disk or database write failure. Show Not saved; retry retains the original snapshot and never duplicates the record. |
| R06 | Kill the app during finish. Recovery shows either the complete pre-finish state or the complete finished state, never partly closed events. |
| R07 | Airplane mode, disconnected Mac, Release build, cold launch. Start, capture, recover, review, and generate a PDF locally. |
| R08 | Foreground recording prevents automatic screen sleep. Finishing releases keep-awake. Explicit user locking remains possible. |
| R09 | Largest supported text size and screen reader. Capture remains reachable; labels are announced without repeatedly reading the live timer. |
| R10 | Compare a five-minute elapsed run with an independent timer. Target difference within 1 second, measured separately from human tap latency. |

### Device coverage and completion gate

Test physical iPhone and Android phones, including a Pixel, plus both platforms in simulation. Test iPad and Android tablet layouts in emulation, then on a physical tablet before claiming tablet readiness. Record models, OS and build versions, results, and limitations.

Completion requires passing the critical scenarios, demonstrating offline Release builds on both platforms, and visually reviewing the full PDF. These are acceptance targets, not results already achieved.

### Next deployment and voice roadmap

Multi-device participation needs shared session identity, join permissions, clock-offset estimation, attribution, and offline conflict handling. Retain UUIDs and revisions now. Keep recorded time separate from synchronization order.

Voice capture timestamps command detection and identifies its source. Investigate offline recognition, false activation, background microphone limits, and wake-word feasibility. Keep manual capture available.

## Landscape acceptance and product decisions

### Additional acceptance scenarios

L01  Cold-launch into landscape on phones and tablets. Test both landscape directions, safe areas, system bars, keyboard appearance, and clock-format width changes without clipping.

L02  From roughly 10 feet, practice testers read the current clock accurately on the smallest supported phone and a tablet under representative lighting. Record results; use a larger device if that phone cannot meet the distance target.

L03  Toggle 24-hour and 12-hour time repeatedly, including noon and midnight. Show AM/PM in 12-hour mode. No new moment is created and all existing timestamps and elapsed values remain unchanged.

L04  Every milestone button is visible without swiping. Confirm the exact order ROM, Crown, Head, Body, First Cry, with Resuscitate and APGAR as separate buttons below the row. Gestures across the row create zero captures.

L05  Capture Crown, then Head 30 seconds later. Crown remains muted above Head, Head shows its capture time, and Since Crown displays 00:00:30 based on elapsed time.

L06  Capture First Cry. Show Separation Gush, Placenta in that order. Restore All milestones and record a repeat or out-of-order milestone without losing history.

L07  Open Emergency, choose No, and dismiss it. No record, timer, or phone handoff occurs. In automated tests, choose Yes and assert that the mocked phone adapter receives tel:911 exactly once. The session remains active. Never place a real 911 call during testing.

L08  Correct or flag the newest milestone. Rebuild live status from the effective included timeline, preserving original records. Keep all current controls available at large system text sizes.

### Confirmed emergency and APGAR behavior

Emergency is a calling action. After Yes, Birthmark hands off to the system phone app with 911 using the telephone URL scheme. Complete any operating-system call confirmation in that interface. Do not create an Emergency milestone or event timer automatically, and do not claim that a call connected. No or dismissal does not open the phone app. The session and existing event timers continue while the phone interface is open.

APGAR opens an assessment editor with two options: 1-minute APGAR and 5-minute APGAR. Each option offers integer scores 0 through 10. No score is preselected; an unset score is different from zero. Save the chosen assessment label and score without a clinical occurrence timestamp. Enter or revise either assessment independently. These are operator-entered assessment labels, not scheduled timers, calculated scores, or clinical recommendations.

The First Cry row replacement with All milestones is the recommended default. It keeps the screen compact and preserves access to earlier milestones. Resuscitate and APGAR stay available through their own buttons. ROM and Resuscitate remain moment labels unless explicitly started as separate event timers. APGAR assessments never advance the timed milestone status or reset the Since last moment display.

L09  Open APGAR. Select 1-minute APGAR and score 0, then 5-minute APGAR and score 10. Both assessments persist separately and survive relaunch. No timed moment or live-status transition is created. Reject values outside the integer range 0–10; leave missing assessments unset.

L10  Edit an APGAR score and export a PDF. Include both assessment labels and scores in a separate untimed section, preserve the prior score in change history, and show no assessment occurrence time.

L11  Simulate an unavailable phone handler and failed telephone handoff. Show Call 911 using another phone, keep session recording available, and do not claim a successful call.

### Orientation implementation

Set the Expo app orientation to landscape and use Expo Router per-screen orientation or expo-screen-orientation for recording. Support both landscape directions. If using orientation locking on iPad, configure full-screen operation as required by Expo and test the loss of split-view support. This is a platform implementation choice, not a new clinical workflow [10].

## Visual system and technical references

Birthmark is the selected app name. Use the supplied palette consistently across the landscape viewport. Keep the current clock and milestone visually dominant; do not give every action the same weight.

| Color | Interface role |
| --- | --- |
Brand kit colors and assets are in `assets/README.txt`.

| Color | Interface role |
| --- | --- |
| Espresso #3B2A24 | Primary text, bold clock digits, and current milestone on cream. |
| Sage #8FA89A | Dividers and button outlines. Never text: 2.3:1 on cream. |
| Cream #FAF3EC | Main background and readable panel surfaces. |
| Coral #E8775A | Emergency button and restrained active accents, with espresso text. |
| Rust #B4472C | Errors, "Not saved" states, and the Resuscitate button (cream text). |

Derived from the brand colors:

| Color | Interface role |
| --- | --- |
| #6B5C56 (espresso 75% over cream) | Secondary text, previous milestone labels, and secondary controls. |
| #EDEAE2 (sage 12% over cream) | Muted background surfaces and pressed rows. |
| #F6E9E0 (rust 6% over cream) | "Not saved" pill background. |

Use #6B5C56 rather than sage for previous-milestone text. Use espresso text on coral. The PDF report keeps a white page with the same text colors. Every text pair is checked against WCAG AA (4.5:1) in `tests/palette.test.ts`; still validate text scaling and distance readability on real devices.

### Technical references

Official documentation checked October 7 2026. These references support implementation choices; they do not establish clinical effectiveness or compliance certification.

1. [Expo project creation](https://docs.expo.dev/get-started/create-a-project/)

2. [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/)

3. [Expo Print](https://docs.expo.dev/versions/latest/sdk/print/)

4. [Expo Sharing](https://docs.expo.dev/versions/latest/sdk/sharing/)

5. [Expo local native builds](https://docs.expo.dev/guides/local-app-development/)

6. [Expo KeepAwake](https://docs.expo.dev/versions/latest/sdk/keep-awake/)

7. [Expo local native modules](https://docs.expo.dev/more/create-expo-module/)

8. [Android SystemClock](https://developer.android.com/reference/android/os/SystemClock)

9. [Apple continuous clock](https://developer.apple.com/documentation/kernel/1646199-mach_continuous_time)

10. [Expo screen orientation](https://docs.expo.dev/versions/latest/sdk/screen-orientation/)

11. [React Native Linking](https://reactnative.dev/docs/linking)
