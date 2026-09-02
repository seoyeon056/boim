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

// PDF 텍스트 레이어에서 읽은 값의 신뢰도.
//
// 글자 자체는 파일에 들어 있던 것이라 오인식이 없다. 그래서 오래 1로 두었다.
// 그런데 pdf.js 가 돌려주는 건 "칸"이 아니라 "조각"이다. 한 칸의 글자가 줄바꿈이나
// 자간 때문에 여러 조각으로 쪼개져 나오고, 그걸 좌표로 다시 묶는 건 우리 추측이다.
//
// 실측: 세금계산서의 "(주)한국테크놀로지"가 "(주)한국테크놀로"와 "지" 두 조각으로
// 나뉘어, 거래처가 "㈜한국테크놀로"로 잘린 채 추출됐다. 그런데 신뢰도가 1이라
// 자동 확인으로 통과해 검수 화면에 뜨지도 않았다.
//
// 읽기가 정확한 것과 값이 온전한 것은 다르다. 묶기가 추측인 이상 확신할 수 없으므로
// 자동 확인 기준(0.95) 아래로 둔다. 사람이 한 번 보게 하는 편이 맞다.
const TEXT_LAYER_CONFIDENCE = 0.9;

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
        confidence: TEXT_LAYER_CONFIDENCE,
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
