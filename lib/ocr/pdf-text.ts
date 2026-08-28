import { groupIntoLines, type Cell } from "@/lib/ocr/cells";

// PDF에서 텍스트 레이어를 그대로 읽는다.
//
// 스캔본이 아닌 PDF는 글자가 이미 문자로 들어 있다. 이걸 이미지로 만들어 OCR을
// 돌리면 멀쩡한 글자를 일부러 흐리게 만든 뒤 다시 알아맞히는 셈이라 손해다.
// 그래서 텍스트 레이어를 먼저 시도하고, 비어 있을 때만(= 스캔본) OCR로 넘긴다.
//
// 한글 PDF는 대개 CID 인코딩(Adobe-Korea1)을 쓴다. pdf.js가 이걸 유니코드로
// 되돌리려면 cMap 파일이 필요한데, 이걸 넘기지 않으면 텍스트가 통째로 빈 값으로
// 나오고 화면에도 백지로 그려진다. 실제로 그 상태를 "파일이 깨졌다"고 오진했었다.
// cMap은 CDN 대신 앱에서 직접 서빙한다(scripts/copy-pdf-assets.mjs).
const PDF_ASSETS = "/pdfjs/";

export type PdfDocumentLike = {
  numPages: number;
  getPage: (pageNo: number) => Promise<{
    getTextContent: () => Promise<{
      items: { str?: string; transform?: number[]; height?: number }[];
    }>;
    getViewport: (options: { scale: number }) => { width: number; height: number };
    render: (options: {
      canvas: HTMLCanvasElement;
      viewport: { width: number; height: number };
    }) => { promise: Promise<void> };
  }>;
};

export async function openPdf(file: File): Promise<PdfDocumentLike> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `${PDF_ASSETS}pdf.worker.min.mjs`;

  return (await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: `${PDF_ASSETS}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${PDF_ASSETS}standard_fonts/`,
  }).promise) as unknown as PdfDocumentLike;
}

export async function cellsFromPdfText(
  doc: PdfDocumentLike,
): Promise<Cell[][]> {
  const cells: Cell[] = [];

  for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();

    for (const item of content.items) {
      const text = (item.str ?? "").trim();
      if (text === "") {
        continue;
      }
      // transform은 [a, b, c, d, e, f]이고 e/f가 x/y다. PDF는 아래에서 위로
      // 좌표가 커지므로 부호를 뒤집어 화면 순서와 맞춘다.
      const x = item.transform?.[4] ?? 0;
      const y = -(item.transform?.[5] ?? 0);
      const height = item.height ?? 10;

      cells.push({
        text,
        box: { x, y, width: text.length * height * 0.6, height },
        // 읽어낸 값이 아니라 파일에 들어 있던 문자다.
        confidence: 1,
      });
    }

    // 페이지가 바뀌면 y가 다시 작아진다. 페이지마다 큰 오프셋을 더해 순서를 지킨다.
    for (const cell of cells) {
      if (cell.box.y < 0) {
        cell.box.y += pageNo * 100000;
      }
    }
  }

  return groupIntoLines(cells, 4);
}
