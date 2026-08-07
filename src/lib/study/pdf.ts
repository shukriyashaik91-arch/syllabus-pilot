/**
 * Client-side PDF text extraction.
 *
 * pdf.js is loaded lazily in the browser only — it must never be pulled into
 * the server bundle.
 */

export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export interface PdfExtractResult {
  text: string;
  pages: number;
}

export async function extractPdfText(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<PdfExtractResult> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Only PDF files are supported.");
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new Error("That PDF is larger than 10 MB.");
  }

  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;

  const chunks: string[] = [];
  for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();
    const items = content.items as { str?: string; hasEOL?: boolean }[];
    let line = "";
    for (const item of items) {
      line += item.str ?? "";
      if (item.hasEOL) {
        chunks.push(line.trim());
        line = "";
      }
    }
    if (line.trim()) chunks.push(line.trim());
    onProgress?.(Math.round((pageNo / doc.numPages) * 100));
  }

  const text = chunks.filter(Boolean).join("\n");
  if (text.trim().length < 20) {
    throw new Error("No selectable text found — this PDF looks like a scan.");
  }
  return { text, pages: doc.numPages };
}
