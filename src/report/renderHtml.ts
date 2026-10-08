import type { ReportModel, TimelineRow } from './reportModel';

export function escapeHtml(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const e = escapeHtml;

function table(headers: string[], rows: string[][], emptyText: string): string {
  if (!rows.length) return `<p class="empty">${e(emptyText)}</p>`;
  return `<table>
<thead><tr>${headers.map((h) => `<th>${e(h)}</th>`).join('')}</tr></thead>
<tbody>
${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('\n')}
</tbody>
</table>`;
}

const timelineRow = (r: TimelineRow) => [
  e(r.sequence),
  r.isSystem ? `<span class="system">${e(r.label)}</span>` : e(r.label),
  e(r.time),
  e(r.elapsed),
  e(r.interval),
  e(r.group),
  e(r.flags.join(', ')),
];

/**
 * Text-only, self-contained HTML for expo-print. Every dynamic value is escaped;
 * no external assets are referenced.
 */
export function renderReportHtml(r: ReportModel): string {
  const h = r.header;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${e(`Birthmark report ${h.shortId} r${h.revision}`)}</title>
<style>
  @page { margin: 14mm 12mm; }
  body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; color: #2D3142; font-size: 10.5pt; }
  h1 { font-size: 16pt; margin: 0 0 4pt; }
  h2 { font-size: 12pt; margin: 14pt 0 4pt; border-bottom: 1px solid #BFC0C0; padding-bottom: 2pt; }
  .meta { display: grid; grid-template-columns: max-content 1fr max-content 1fr; gap: 2pt 10pt; font-size: 10pt; }
  .meta dt { color: #4F5D75; }
  .meta dd { margin: 0; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  th { text-align: left; color: #4F5D75; font-weight: 600; border-bottom: 1px solid #BFC0C0; padding: 3pt 4pt; }
  td { border-bottom: 1px solid #E6E6E6; padding: 3pt 4pt; vertical-align: top; font-variant-numeric: tabular-nums; word-break: break-word; }
  .system { color: #4F5D75; font-style: italic; }
  .empty { color: #4F5D75; font-style: italic; }
  .notice { color: #4F5D75; font-size: 10pt; }
  footer { margin-top: 16pt; color: #4F5D75; font-size: 10pt; border-top: 1px solid #BFC0C0; padding-top: 4pt; }
</style>
</head>
<body>
<h1>Birthmark session report</h1>
${h.inProgress ? '<p class="notice">Session in progress at generation time.</p>' : ''}
<dl class="meta">
  <dt>Session</dt><dd>${e(h.shortId)} (${e(h.sessionId)})</dd>
  <dt>Report revision</dt><dd>r${e(h.revision)}</dd>
  <dt>Date</dt><dd>${e(h.sessionDate)}</dd>
  <dt>Generated</dt><dd>${e(h.generatedAt)}</dd>
  <dt>Start</dt><dd>${e(h.start)}</dd>
  <dt>End</dt><dd>${e(h.end)}</dd>
  <dt>Timezone</dt><dd>${e(h.timezone)}</dd>
  <dt>Offsets</dt><dd>${e(h.offsets)}</dd>
  <dt>Total elapsed</dt><dd>${e(h.totalElapsed)}</dd>
</dl>

<h2>Timeline</h2>
${table(['#', 'Label', 'Time (24h)', 'Elapsed', 'Since previous', 'Group', 'Flags'], r.timeline.map(timelineRow), 'No records.')}

<h2>Events</h2>
${table(
  ['Event', 'Start', 'End', 'Duration', 'Ended at session finish'],
  r.events.map((x) => [e(x.label), e(x.start), e(x.end), e(x.duration), x.autoEnded ? 'Yes' : 'No']),
  'No events.',
)}

<h2>APGAR assessments</h2>
<p class="notice">Operator-entered scores. No assessment occurrence time is recorded.</p>
${table(['Assessment', 'Score (0-10)'], r.apgar.map((x) => [e(x.label), e(x.score)]), 'No assessments.')}

<h2>Appendix</h2>
<h3>Excluded captures</h3>
${table(['#', 'Label', 'Time (24h)', 'Elapsed', 'Since previous', 'Group', 'Flags'], r.appendix.excluded.map(timelineRow), 'None.')}
<h3>Original values for corrected or manual records</h3>
${table(
  ['Record', 'Original', 'Effective', 'Source'],
  r.appendix.corrected.map((x) => [e(x.label), e(x.original), e(x.effective), e(x.source)]),
  'None.',
)}
<h3>Finishes and resumptions</h3>
${table(['Action', 'Time (24h)', 'Elapsed'], r.appendix.finishes.map((x) => [e(x.label), e(x.time), e(x.elapsed)]), 'None.')}
<h3>Clock and recovery flags</h3>
${table(['Flag', 'Elapsed interval', 'Detail'], r.appendix.flags.map((x) => [e(x.type), e(x.interval), e(x.detail)]), 'None.')}
<h3>Change history</h3>
${table(
  ['Rev', 'Change', 'Record', 'From', 'To', 'Changed at'],
  r.changeHistory.map((x) => [e(x.revision), e(x.action), e(x.target), e(x.from), e(x.to), e(x.changedAt)]),
  'No changes.',
)}

<footer>${e(r.footer)}</footer>
</body>
</html>`;
}
