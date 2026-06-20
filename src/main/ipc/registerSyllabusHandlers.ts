import { ipcMain, dialog, BrowserWindow } from 'electron';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { IPC, type ExtractPdfResult } from '../../shared/types';
import { extractPdfText } from '../pdf/extractPdfText';

// Reading files and parsing PDFs belongs in main, on the trusted side of the
// process boundary — the sandboxed renderer can't (and shouldn't) touch the
// filesystem. We open the picker here, read the chosen PDF, and return only its
// extracted text; the renderer drops that into the existing syllabus textarea
// and the pure parseSyllabus() takes over.

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB — a text syllabus is tiny; cap pathological files.

export function registerSyllabusHandlers(): void {
  ipcMain.handle(IPC.SYLLABUS.EXTRACT_PDF, async (): Promise<ExtractPdfResult> => {
    const win = BrowserWindow.getFocusedWindow();
    const options = {
      title: 'Choose a syllabus PDF',
      properties: ['openFile' as const],
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    };
    const { canceled, filePaths } = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (canceled || filePaths.length === 0) return { canceled: true };

    const filePath = filePaths[0];

    if (statSync(filePath).size > MAX_BYTES) {
      throw new Error('That PDF is unexpectedly large (over 25 MB) and was not opened.');
    }

    let text: string;
    try {
      const bytes = new Uint8Array(readFileSync(filePath));
      text = await extractPdfText(bytes);
    } catch {
      throw new Error("Couldn't read that PDF. Make sure it's a valid, unencrypted PDF file.");
    }

    if (!text.trim()) {
      throw new Error(
        "We couldn't find any selectable text — this looks like a scanned or image-only PDF. " +
          'Try copy-pasting the syllabus text instead.',
      );
    }

    return { canceled: false, text, fileName: path.basename(filePath) };
  });
}
