import { Directory, File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { SessionController } from '../domain/sessionController';
import type { ExportRecord } from '../domain/types';
import { buildReport, reportFileName } from '../report/reportModel';
import { renderReportHtml } from '../report/renderHtml';

const exportsDir = () => new Directory(Paths.cache, 'exports');

export type GeneratedPdf = { uri: string; fileName: string; record: ExportRecord };

/**
 * Renders the report locally to a cached PDF. Older cached revisions for the
 * same session are removed. Failure leaves the session untouched.
 */
export async function generatePdf(controller: SessionController): Promise<GeneratedPdf> {
  const snapshot = controller.readClock();
  const data = controller.getState().data;
  const html = renderReportHtml(buildReport(data, snapshot.wallEpochMs, controller.elapsedAt(snapshot)));
  const { uri } = await Print.printToFileAsync({ html, width: 612, height: 792 });

  const dir = exportsDir();
  if (!dir.exists) dir.create({ intermediates: true });
  const fileName = reportFileName(data);
  const dest = new File(dir, fileName);
  if (dest.exists) dest.delete();
  await new File(uri).move(dest);

  for (const prior of data.exports) {
    if (!prior.cachedFilePath) continue;
    deleteCachedFile(prior.cachedFilePath);
    controller.clearExportCache(prior.id);
  }
  const record = controller.recordExport({ generatedAt: snapshot.wallEpochMs, cachedFilePath: dest.uri });
  return { uri: dest.uri, fileName, record };
}

/** OS share/save sheet; the operator picks the destination. Nothing is sent automatically. */
export async function sharePdf(pdf: GeneratedPdf): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(pdf.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: 'Save Birthmark report',
  });
}

/** Android fallback: write a copy into a folder the operator picks (Storage Access Framework). */
export async function savePdfToFolder(pdf: GeneratedPdf): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const dir = await Directory.pickDirectoryAsync();
  const out = dir.createFile(pdf.fileName, 'application/pdf');
  out.write(await new File(pdf.uri).bytes());
  return true;
}

export const canSaveToFolder = Platform.OS === 'android';

export function deleteCachedFile(uri: string): void {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Already gone; nothing app-owned remains.
  }
}
