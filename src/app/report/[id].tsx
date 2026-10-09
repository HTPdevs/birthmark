import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApgarEditor } from '../../components/ApgarEditor';
import { AddMissedSheet, CorrectionSheet } from '../../components/CorrectionSheets';
import { SaveStatus } from '../../components/SaveStatus';
import { ActiveSessionExistsError, type SessionController } from '../../domain/sessionController';
import { type GeneratedPdf, canSaveToFolder, generatePdf, savePdfToFolder, sharePdf } from '../../platform/exportPdf';
import { type TimelineRow, buildReport } from '../../report/reportModel';
import { appStore, useAppState, useClockTick, useControllerState } from '../../state/store';
import { Button } from '../../ui/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { Sheet } from '../../ui/Sheet';
import { colors, space, type } from '../../ui/theme';

export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [controller, setController] = useState<SessionController | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    appStore.getController(id).then(
      (c) => live && setController(c),
      () => live && setController(null),
    );
    return () => {
      live = false;
    };
  }, [id]);

  if (controller === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.ink} />
      </View>
    );
  }
  if (controller === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.h2}>Session not found.</Text>
        <Button label="Home" onPress={() => router.replace('/')} />
      </View>
    );
  }
  return <Report controller={controller} />;
}

type ExportState = { kind: 'idle' } | { kind: 'working' } | { kind: 'ready'; pdf: GeneratedPdf } | { kind: 'error'; message: string };

function Report({ controller }: { controller: SessionController }) {
  const state = useControllerState(controller);
  const { active } = useAppState();
  const snapshot = useClockTick(1000);
  const { data } = state;
  const isActive = data.session.status === 'active';
  const report = buildReport(data, snapshot.wallEpochMs, controller.elapsedAt(snapshot));
  const [editing, setEditing] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [apgarOpen, setApgarOpen] = useState(false);
  const [confirm, setConfirm] = useState<'resume' | 'delete' | null>(null);
  const [exportState, setExportState] = useState<ExportState>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);

  const otherActive = active && active.sessionId !== controller.sessionId;

  const exportPdf = async () => {
    setExportState({ kind: 'working' });
    try {
      const pdf = await generatePdf(controller);
      setExportState({ kind: 'ready', pdf });
    } catch (e) {
      setExportState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const doResume = async () => {
    setConfirm(null);
    try {
      await appStore.resume(controller.sessionId);
      router.replace('/record');
    } catch (e) {
      setError(e instanceof ActiveSessionExistsError ? 'Another session is active. Finish it before resuming this one.' : String(e));
    }
  };

  const doDelete = async () => {
    setConfirm(null);
    try {
      await appStore.deleteSession(controller.sessionId);
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'top', 'bottom']}>
      <View style={styles.toolbar}>
        <Button label="Home" variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={styles.title} numberOfLines={1}>
          Report {report.header.shortId} {'·'} r{report.header.revision}
        </Text>
        <SaveStatus queue={state.queue} onRetry={() => controller.retry()} />
        {isActive ? <Button label="Back to recording" variant="primary" onPress={() => router.replace('/record')} /> : null}
        <Button label="Export PDF" variant={isActive ? 'secondary' : 'primary'} onPress={exportPdf} disabled={exportState.kind === 'working'} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.meta}>
          <Meta k="Date" v={report.header.sessionDate} />
          <Meta k="Start" v={report.header.startTime} />
          <Meta k="End" v={report.header.endTime} />
        </View>

        <View style={styles.actions}>
          <Button label="APGAR" onPress={() => setApgarOpen(true)} />
          <Button label="Add missed moment" onPress={() => setAddOpen(true)} />
          {!isActive ? (
            <Button
              label="Resume session"
              onPress={() => setConfirm('resume')}
              disabled={!!otherActive}
              accessibilityHint={otherActive ? 'Unavailable while another session is active' : undefined}
            />
          ) : null}
          {!isActive ? <Button label="Delete session" variant="danger" onPress={() => setConfirm('delete')} /> : null}
        </View>

        <Text style={styles.h2}>Timeline</Text>
        <Text style={styles.hint}>Tap a moment to rename, flag, or correct it.</Text>
        <TableHead cols={['#', 'Label', 'Time (24h)', 'Time since last', 'Flags']} />
        {report.timeline.map((r) => (
          <TimelineRowView key={r.momentId} row={r} onPress={r.isSystem ? undefined : () => setEditing(r.momentId)} />
        ))}
        <TotalRow value={report.header.totalElapsed} />

        <Text style={styles.h2}>Events</Text>
        {report.events.length === 0 ? <Text style={styles.hint}>No events.</Text> : null}
        {report.events.map((e, i) => (
          <View key={i} style={styles.tr}>
            <Text style={[styles.td, styles.w3]}>{e.label}</Text>
            <Text style={[styles.td, styles.w2, type.tabular]}>{e.start}</Text>
            <Text style={[styles.td, styles.w2, type.tabular]}>{e.end}</Text>
            <Text style={[styles.td, styles.w2, type.tabular]}>{e.duration}</Text>
            <Text style={[styles.td, styles.w3]}>{e.autoEnded ? 'Ended at session finish' : ''}</Text>
          </View>
        ))}

        <Text style={styles.h2}>APGAR assessments</Text>
        <Text style={styles.hint}>Untimed, operator-entered scores.</Text>
        {report.apgar.map((a) => (
          <View key={a.label} style={styles.tr}>
            <Text style={[styles.td, styles.w3]}>{a.label}</Text>
            <Text style={[styles.td, styles.w3]}>{a.score}</Text>
          </View>
        ))}

        <Text style={styles.h2}>Appendix</Text>
        <Text style={styles.h3}>Excluded captures</Text>
        {report.appendix.excluded.length === 0 ? <Text style={styles.hint}>None.</Text> : null}
        {report.appendix.excluded.map((r) => (
          <TimelineRowView key={r.momentId} row={r} onPress={() => setEditing(r.momentId)} />
        ))}
        <Text style={styles.h3}>Original values</Text>
        {report.appendix.corrected.length === 0 ? <Text style={styles.hint}>None.</Text> : null}
        {report.appendix.corrected.map((c, i) => (
          <Text key={i} style={styles.line}>
            {c.label}: {c.original} {'→'} {c.effective} ({c.source})
          </Text>
        ))}
        <Text style={styles.h3}>Finishes and resumptions</Text>
        {report.appendix.finishes.map((f, i) => (
          <Text key={i} style={[styles.line, type.tabular]}>
            {f.label} {f.time} ({f.elapsed})
          </Text>
        ))}
        <Text style={styles.h3}>Clock and recovery flags</Text>
        {report.appendix.flags.length === 0 ? <Text style={styles.hint}>None.</Text> : null}
        {report.appendix.flags.map((f, i) => (
          <Text key={i} style={styles.line}>
            {f.type}: {f.interval} {f.detail}
          </Text>
        ))}
        <Text style={styles.h3}>Change history</Text>
        {report.changeHistory.length === 0 ? <Text style={styles.hint}>No changes.</Text> : null}
        {report.changeHistory.map((c, i) => (
          <Text key={i} style={styles.line}>
            r{c.revision} {c.action}: {c.target} {c.from} {'→'} {c.to} ({c.changedAt})
          </Text>
        ))}
        <Text style={styles.footer}>{report.footer}</Text>
      </ScrollView>

      <CorrectionSheet controller={controller} momentId={editing} onClose={() => setEditing(null)} />
      <AddMissedSheet controller={controller} visible={addOpen} onClose={() => setAddOpen(false)} />
      <ApgarEditor controller={controller} visible={apgarOpen} onClose={() => setApgarOpen(false)} />

      <Sheet
        visible={exportState.kind === 'ready' || exportState.kind === 'error'}
        title={exportState.kind === 'error' ? 'Export failed' : 'PDF ready'}
        onClose={() => setExportState({ kind: 'idle' })}
        width="60%">
        {exportState.kind === 'error' ? (
          <>
            <Text style={styles.line}>The session is unchanged. {exportState.message}</Text>
            <Button label="Retry" variant="primary" onPress={exportPdf} />
          </>
        ) : null}
        {exportState.kind === 'ready' ? (
          <>
            <Text style={styles.line}>{exportState.pdf.fileName}</Text>
            <Text style={styles.hint}>Choose where to save it. Nothing is sent automatically.</Text>
            <Button
              label="Save or share"
              variant="primary"
              onPress={() =>
                sharePdf(exportState.pdf).catch((e) => setExportState({ kind: 'error', message: String(e) }))
              }
            />
            {canSaveToFolder ? (
              <Button
                label="Save to a folder"
                onPress={() =>
                  savePdfToFolder(exportState.pdf).catch((e) => setExportState({ kind: 'error', message: String(e) }))
                }
              />
            ) : null}
          </>
        ) : null}
      </Sheet>

      <ConfirmDialog
        visible={confirm === 'resume'}
        title="Resume session?"
        message="Use this only if the session was finished by mistake. Time since the finish stays in the total elapsed time. Events that ended stay ended."
        confirmLabel="Resume"
        cancelLabel="Cancel"
        onConfirm={doResume}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        visible={confirm === 'delete'}
        title="Delete session?"
        message="This removes the session's records and cached PDFs from this device. PDFs already saved elsewhere are not affected."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        confirmVariant="danger"
        onConfirm={doDelete}
        onCancel={() => setConfirm(null)}
      />
    </SafeAreaView>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaKey}>{k}</Text>
      <Text style={[styles.metaVal, type.tabular]}>{v}</Text>
    </View>
  );
}

// #, Label, Time (24h), Time since last, Flags
const WIDTHS = [0.5, 3, 2, 1.5, 2.5];

function TableHead({ cols }: { cols: string[] }) {
  return (
    <View style={[styles.tr, styles.thead]}>
      {cols.map((c, i) => (
        <Text key={c} style={[styles.th, { flex: WIDTHS[i] }]}>
          {c}
        </Text>
      ))}
    </View>
  );
}

function TimelineRowView({ row, onPress }: { row: TimelineRow; onPress?: () => void }) {
  const cells = [String(row.sequence), row.label, row.time, row.interval, row.flags.join(', ')];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${row.label}, ${row.time}, time since last ${row.interval}`}
      style={({ pressed }) => [styles.tr, pressed && styles.pressed]}>
      {cells.map((c, i) => (
        <Text key={i} style={[styles.td, type.tabular, { flex: WIDTHS[i] }, row.isSystem && styles.system]}>
          {c}
        </Text>
      ))}
    </Pressable>
  );
}

/** Summary line under the timeline: label in the Label column, value in the Time since last column. */
function TotalRow({ value }: { value: string }) {
  const cells = ['', 'Total time', '', value, ''];
  return (
    <View style={[styles.tr, styles.total]} accessible accessibilityLabel={`Total time ${value}`}>
      {cells.map((c, i) => (
        <Text key={i} style={[styles.td, styles.totalText, type.tabular, { flex: WIDTHS[i] }]}>
          {c}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, backgroundColor: colors.paper },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  title: { flex: 1, fontSize: 22, fontWeight: '800', color: colors.ink },
  body: { padding: space.lg, gap: space.xs, paddingBottom: space.xl * 2 },
  error: { color: colors.danger, fontSize: 16, fontWeight: '700' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, marginBottom: space.sm },
  metaItem: { minWidth: 180 },
  metaKey: { fontSize: 13, color: colors.slate, fontWeight: '700' },
  metaVal: { fontSize: 16, color: colors.ink },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  h2: { fontSize: 20, fontWeight: '800', color: colors.ink, marginTop: space.lg },
  h3: { fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: space.md },
  hint: { fontSize: 14, color: colors.slate },
  thead: { borderBottomWidth: 2, borderBottomColor: colors.line },
  tr: { flexDirection: 'row', gap: space.sm, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.mist, minHeight: 44, alignItems: 'center' },
  th: { fontSize: 13, fontWeight: '700', color: colors.slate },
  td: { fontSize: 15, color: colors.ink },
  w2: { flex: 2 },
  w3: { flex: 3 },
  system: { color: colors.slate, fontStyle: 'italic' },
  pressed: { backgroundColor: colors.mist },
  total: { borderTopWidth: 2, borderTopColor: colors.line, borderBottomWidth: 0 },
  totalText: { fontWeight: '800' },
  line: { fontSize: 15, color: colors.ink },
  footer: { marginTop: space.xl, fontSize: 14, color: colors.slate },
});
