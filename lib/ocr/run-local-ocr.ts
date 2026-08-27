"use client";

// OCR 엔진과 PDF 래스터화를 감싼다. 전부 브라우저에서 돈다.
import { rowsFromOcr } from "@/lib/ocr/local-extract";
import type { ExtractedTransactionRow } from "@/lib/ocr/types";
import type { Cell } from "@/lib/ocr/cells";
import { cellsFromXlsx } from "@/lib/ocr/xlsx";
import { cellsFromPdfText, openPdf, type PdfDocumentLike } from "@/lib/ocr/pdf-text";

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

async function canvasesFromPdf(doc: PdfDocumentLike): Promise<HTMLCanvasElement[]> {
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

function isPdf(file: File): boolean {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

function isSpreadsheet(file: File): boolean {
  return /\.xlsx$/i.test(file.name);
}

// 파일 한 개를 어떻게 읽을지 정한다.
//
// 엑셀과 텍스트가 살아 있는 PDF는 글자가 이미 문자로 들어 있다. 이걸 이미지로
// 만들어 OCR을 돌리면 멀쩡한 값을 흐리게 만든 뒤 다시 알아맞히는 셈이다.
// OCR은 스캔본과 사진에만 쓴다.
type ReadResult =
  | { kind: "cells"; lines: Cell[][] }
  | { kind: "canvases"; canvases: HTMLCanvasElement[] };

async function readFile(file: File): Promise<ReadResult> {
  if (isSpreadsheet(file)) {
    return { kind: "cells", lines: await cellsFromXlsx(file) };
  }

  if (isPdf(file)) {
    const doc = await openPdf(file);
    const lines = await cellsFromPdfText(doc);
    if (lines.length > 0) {
      return { kind: "cells", lines };
    }
    // 텍스트 레이어가 없다 = 스캔본. 그림으로 그려서 OCR로 넘긴다.
    return { kind: "canvases", canvases: await canvasesFromPdf(doc) };
  }

  return { kind: "canvases", canvases: [canvasFromBitmap(await createImageBitmap(file))] };
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

// 실제로 일어난 거래를 증명하는 문서만 거래로 집계한다.
//
// 견적서는 아직 거래가 아니고(제안 단계), 계약서는 조건이지 거래 기록이 아니다.
// 발주서도 주문이지 이행의 증거는 아니다. 이것들까지 세면 같은 건이 여러 번
// 잡혀서 거래처 수와 금액이 부풀려진다 — 실제로 실측 5개 파일에서 동일한
// 라이선스 건이 견적서·명세서에 중복으로 잡혔다.
//
// 나머지 문서도 읽기는 한다. 다만 "판단 근거 문서"로만 쓰고 거래로는 세지 않는다.
export const TRANSACTION_CATEGORIES = [
  "transaction-statement",
  "tax-invoice",
  "deposit-history",
];

// 같은 거래가 명세서와 세금계산서에 함께 들어 있는 경우를 한 건으로 본다.
function dedupe(rows: ExtractedTransactionRow[]): ExtractedTransactionRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.date.value}|${row.amount.value}|${row.item.value.replace(/\s+/g, "")}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export async function extractTransactionsLocally(
  files: File[],
  onProgress?: (done: number, total: number) => void,
  onPhase?: (phase: OcrPhase) => void,
): Promise<LocalOcrOutcome> {
  if (files.length === 0) {
    return { status: "no-transactions" };
  }

  try {
    const transactions: ExtractedTransactionRow[] = [];
    const canvases: HTMLCanvasElement[] = [];
    let sawContent = false;

    for (let i = 0; i < files.length; i += 1) {
      onPhase?.({ phase: "rendering", done: i, total: files.length });
      const read = await readFile(files[i]);

      if (read.kind === "cells") {
        if (read.lines.length > 0) {
          sawContent = true;
          transactions.push(...rowsFromOcr({ lines: read.lines }));
        }
      } else {
        canvases.push(...read.canvases);
      }
    }

    const drawn = canvases.filter((canvas) => !isBlank(canvas));
    if (drawn.length > 0) {
      sawContent = true;
    }

    // 읽을 내용이 아무 데도 없었다 = 전부 백지였다.
    if (!sawContent) {
      return { status: "blank" };
    }

    // 인식할 그림이 하나도 없으면 모델을 받을 이유가 없다. 엑셀이나 텍스트가
    // 살아 있는 PDF만 올린 경우가 여기 해당한다(첫 방문 7초를 아낀다).
    if (drawn.length === 0) {
      const unique = dedupe(transactions);
      return unique.length > 0
        ? { status: "ok", transactions: unique }
        : { status: "no-transactions" };
    }

    // 모델 다운로드 구간. 첫 방문은 여기서 7초 가까이 걸리는데, 알리지 않으면
    // 진행률이 0에 멈춰 있어 고장처럼 보인다.
    onPhase?.({ phase: "preparing" });
    const service = await getService();

    for (let index = 0; index < drawn.length; index += 1) {
      onPhase?.({ phase: "recognizing", done: index, total: drawn.length });
      const result = await service.recognize(drawn[index]);
      transactions.push(...rowsFromOcr(result as { lines: [] }));
      onProgress?.(index + 1, drawn.length);
      // 페이지 사이에 렌더링을 한 번 양보한다. 안 그러면 진행률이 갱신되지 않고
      // 전부 끝난 뒤에 한꺼번에 튄다.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const unique = dedupe(transactions);
    return unique.length > 0
      ? { status: "ok", transactions: unique }
      : { status: "no-transactions" };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
