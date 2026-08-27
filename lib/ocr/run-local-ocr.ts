"use client";

// OCR 엔진과 PDF 래스터화를 감싼다. 전부 브라우저에서 돈다.
import { rowsFromOcr } from "@/lib/ocr/local-extract";
import type { ExtractedTransactionRow } from "@/lib/ocr/types";

// 모델은 첫 호출 때 한 번만 받고 이후 재사용한다(실측 6.9초 -> 이후 0초).
let servicePromise: Promise<{ recognize: (canvas: HTMLCanvasElement) => Promise<unknown> }> | null =
  null;

async function getService() {
  servicePromise ??= (async () => {
    const mod = await import("ppu-paddle-ocr/web");
    const service = new mod.PaddleOcrService({
      model: mod.V5_KOREAN_MOBILE_MODEL,
    });
    await service.initialize();
    return service as unknown as {
      recognize: (canvas: HTMLCanvasElement) => Promise<unknown>;
    };
  })();

  try {
    return await servicePromise;
  } catch (error) {
    // 실패한 프라미스를 캐시해두면 이후 시도가 전부 같이 죽는다.
    servicePromise = null;
    throw error;
  }
}

// 휴대폰 사진은 1200만 화소가 넘는다. 그대로 넣으면 WASM 추론이 몇 분씩 걸려서
// 화면이 멈춘 것처럼 보인다. 글자를 읽는 데는 긴 변 2000px이면 충분하다(실측 기준
// 명세서 본문이 이 해상도에서 정확히 인식된다).
const MAX_SIDE = 2000;

function canvasFromBitmap(bitmap: ImageBitmap): HTMLCanvasElement {
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (context) {
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

// PDF는 그림이 아니라서 OCR에 바로 못 넣는다. 페이지마다 캔버스로 그려야 한다.
// 배율 2는 본문 글자가 인식되기에 충분한 해상도다(실측).
const PDF_SCALE = 2;

async function canvasesFromPdf(file: File): Promise<HTMLCanvasElement[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const canvases: HTMLCanvasElement[] = [];

  for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
    const page = await doc.getPage(pageNo);
    const viewport = page.getViewport({ scale: PDF_SCALE });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvas, viewport }).promise;
    canvases.push(canvas);
  }

  return canvases;
}

async function canvasesFromFile(file: File): Promise<HTMLCanvasElement[]> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return canvasesFromPdf(file);
  }
  return [canvasFromBitmap(await createImageBitmap(file))];
}

// 캔버스에 실제로 그려진 게 있는지 본다.
// 한글 폰트가 임베드되지 않은 PDF는 브라우저에서 백지로 그려지는데(실측), 그대로
// OCR에 넣으면 "인식 0건"이 되어 사용자는 이유를 알 수 없다. 여기서 구분한다.
function isBlank(canvas: HTMLCanvasElement): boolean {
  const context = canvas.getContext("2d");
  if (!context) {
    return true;
  }
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < data.length; i += 4) {
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (data[i + 3] > 0 && brightness < 240) {
      return false;
    }
  }
  return true;
}

export type LocalOcrOutcome =
  | { status: "ok"; transactions: ExtractedTransactionRow[] }
  | { status: "blank" }
  | { status: "no-transactions" }
  | { status: "error"; message: string };

export type OcrPhase =
  | { phase: "preparing" }
  | { phase: "rendering"; done: number; total: number }
  | { phase: "recognizing"; done: number; total: number };

export async function extractTransactionsLocally(
  files: File[],
  onProgress?: (done: number, total: number) => void,
  onPhase?: (phase: OcrPhase) => void,
): Promise<LocalOcrOutcome> {
  if (files.length === 0) {
    return { status: "no-transactions" };
  }

  try {
    // 모델 다운로드 구간. 첫 방문은 여기서 7초 가까이 걸리는데, 알리지 않으면
    // 진행률이 0에 멈춰 있어 고장처럼 보인다.
    onPhase?.({ phase: "preparing" });
    const service = await getService();

    const canvases: HTMLCanvasElement[] = [];
    for (let i = 0; i < files.length; i += 1) {
      onPhase?.({ phase: "rendering", done: i, total: files.length });
      canvases.push(...(await canvasesFromFile(files[i])));
    }

    const drawn = canvases.filter((canvas) => !isBlank(canvas));
    if (drawn.length === 0) {
      return { status: "blank" };
    }

    const transactions: ExtractedTransactionRow[] = [];
    for (let index = 0; index < drawn.length; index += 1) {
      onPhase?.({ phase: "recognizing", done: index, total: drawn.length });
      const result = await service.recognize(drawn[index]);
      transactions.push(...rowsFromOcr(result as { lines: [] }));
      onProgress?.(index + 1, drawn.length);
      // 페이지 사이에 렌더링을 한 번 양보한다. 안 그러면 진행률이 갱신되지 않고
      // 전부 끝난 뒤에 한꺼번에 튄다.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    return transactions.length > 0
      ? { status: "ok", transactions }
      : { status: "no-transactions" };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
