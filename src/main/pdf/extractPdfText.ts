// PDF → plain text, main-process only. This lives here (not in shared/) because
// it depends on pdfjs-dist, a Node-coupled library — shared/ must stay free of
// such imports so its logic remains portable and unit-testable (see CLAUDE.md).
//
// We use the *legacy* build and run with NO worker: text-only extraction needs
// no rendering, worker, or canvas, and skipping the worker avoids shipping a
// separate worker bundle. The output is fed straight to the pure parseSyllabus()
// in shared/, so the important detail is reconstructing LINE BREAKS — pdfjs marks
// the end of a visual line with `hasEOL`, which parseSyllabus relies on (it
// treats one line as one assignment).
//
// DOMMatrix note: pdfjs references `new DOMMatrix()` at module load. In a browser
// that global exists; in Electron's main process (DOM-less Node) it doesn't, and
// pdfjs would otherwise reach for the *native* `@napi-rs/canvas` to polyfill it —
// which can't be bundled and would force native-module packaging. Since text
// extraction never actually renders, we install a tiny no-op DOMMatrix first so
// pdfjs loads cleanly with zero native dependencies. The dynamic import() below
// is what lets this stub run BEFORE pdfjs's module body evaluates.

interface PdfTextItem {
  str?: string;
  hasEOL?: boolean;
}

// Minimal DOMMatrix so pdfjs's module-load `new DOMMatrix()` succeeds. It is
// never exercised on the text-extraction path (only canvas rendering uses it).
function installDomMatrixStub(): void {
  const g = globalThis as unknown as { DOMMatrix?: unknown };
  if (!g.DOMMatrix) {
    g.DOMMatrix = class {
      /* no-op: rendering-only, unused for getTextContent() */
    };
  }
}

/**
 * Extract the visible text from a PDF as newline-separated lines.
 *
 * @param data Raw PDF bytes.
 * @returns The document's text, with each visual line on its own line. May be
 *   empty for a scanned/image-only PDF (no selectable text) — the caller decides
 *   how to surface that.
 */
export async function extractPdfText(data: Uint8Array): Promise<string> {
  installDomMatrixStub();
  // Dynamic import so the stub above is in place before pdfjs evaluates.
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const loadingTask = getDocument({ data, useSystemFonts: true });
  const doc = await loadingTask.promise;

  try {
    const pages: string[] = [];

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();

      let line = '';
      const lines: string[] = [];
      for (const item of content.items as PdfTextItem[]) {
        // `marked content` items have no `str`; only text items do.
        if (typeof item.str !== 'string') continue;
        line += item.str;
        if (item.hasEOL) {
          lines.push(line);
          line = '';
        } else {
          line += ' '; // keep words on the same visual line readable
        }
      }
      if (line.trim()) lines.push(line);

      pages.push(lines.join('\n'));
    }

    return pages
      .join('\n')
      .replace(/[ \t]+/g, ' ')    // collapse runs of spaces from the join above
      .replace(/ *\n */g, '\n')   // trim spaces hugging the line breaks
      .replace(/\n{3,}/g, '\n\n') // cap blank-line runs
      .trim();
  } finally {
    // Abort the worker/transport and free document resources promptly.
    await loadingTask.destroy();
  }
}
