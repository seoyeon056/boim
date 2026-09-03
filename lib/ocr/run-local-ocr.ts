"use client";

// OCR 엔진과 PDF 래스터화를 감싼다. 전부 브라우저에서 돈다.
import { rowsFromOcr, termsFromOcr } from "@/lib/ocr/local-extract";
import type {
  DocumentTerms,
  ExtractedTransactionRow,
} from "@/lib/ocr/types";
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

// 인식을 한 번에 하나씩만 돌린다.
//
// 모델은 무거워서 한 번만 띄우고 계속 쓴다(servicePromise). 그런데 그 뒤에 있는
// ONNX 세션은 동시에 두 번 부를 수 없다. 겹치면 이렇게 죽는다.
//
//   Error during text detection: Session already started
//   Error during model inference: Session mismatch
//
// 실측: 개발 서버에서 스캔본을 올리면 위 오류가 네 개(파이프라인 2개 × 검출·인식
// 2단계) 뜨고 인식 결과가 0건이 됐다. React 개발 모드가 effect 를 두 번 실행해
// 파이프라인이 겹친 탓이다. 프로덕션 빌드에서는 재현되지 않았지만, 사용자가
// 분석 중에 뒤로 갔다가 다시 들어오면 프로덕션에서도 같은 일이 난다.
//
// 앞의 인식이 끝난 뒤에 다음 인식을 시작하도록 줄을 세운다. 실패해도 줄은
// 이어져야 하므로 대기용 프라미스에서는 오류를 삼킨다.
let recognizeQueue: Promise<unknown> = Promise.resolve();

function recognizeInTurn(
  service: { recognize: (canvas: HTMLCanvasElement) => Promise<unknown> },
  canvas: HTMLCanvasElement,
): Promise<unknown> {
  const next = recognizeQueue.then(
    () => service.recognize(canvas),
    () => service.recognize(canvas),
  );
  recognizeQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
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

export type SettlementSummary = { count: number; total: number };

export type LocalOcrOutcome =
  | {
      status: "ok";
      transactions: ExtractedTransactionRow[];
      terms: DocumentTerms;
      // 입금내역에서 확인한 입금 건수·합계. 매출에는 합산하지 않는다.
      settlement?: SettlementSummary;
    }
  | { status: "blank" }
  | { status: "no-transactions" }
  | { status: "error"; message: string };

export type OcrPhase =
  | { phase: "preparing" }
  | { phase: "rendering"; done: number; total: number }
  | { phase: "recognizing"; done: number; total: number };

// 실제로 일어난 거래(매출)를 증명하는 문서만 거래 실적으로 집계한다.
//
// 견적서는 아직 거래가 아니고(제안 단계), 계약서는 조건이지 거래 기록이 아니다.
// 발주서도 주문이지 이행의 증거는 아니다 — 전부 "미래 신호"로만 싣는다.
// 입금내역은 같은 대금이 명세서와 함께 잡혀 매출을 두 번 세게 하므로, 입금
// 여부만 확인하고 매출·거래처 계산에는 넣지 않는다.
export const TRANSACTION_CATEGORIES = ["transaction-statement", "tax-invoice"];

// 입금 확인 전용. 여기서 읽은 값은 "입금 N건 확인"으로만 곁들이고 거래로 세지 않는다.
export const SETTLEMENT_CATEGORIES = ["deposit-history"];

// 같은 거래가 명세서와 세금계산서에 함께 들어 있는 경우를 한 건으로 본다.
// 날짜·거래처·금액·품목을 모두 맞춰 본다(거래처가 다르면 다른 거래로 남긴다).
function dedupe(rows: ExtractedTransactionRow[]): ExtractedTransactionRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = [
      row.date.value,
      (row.customer.value ?? "").replace(/\s+/g, ""),
      row.amount.value,
      row.item.value.replace(/\s+/g, ""),
    ].join("|");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

// 입금내역 파일에서 입금 건수·합계만 뽑는다. 엑셀·텍스트 PDF만 본다(스캔본은
// 입금 확인이 주 목적이 아니라 OCR까지 돌리지 않는다). 매출 계산과 분리된 경로다.
async function summarizeSettlement(files: File[]): Promise<SettlementSummary> {
  let count = 0;
  let total = 0;
  for (const file of files) {
    try {
      const read = await readFile(file);
      if (read.kind !== "cells" || read.lines.length === 0) {
        continue;
      }
      for (const row of rowsFromOcr({ lines: read.lines })) {
        count += 1;
        total += row.amount.value;
      }
    } catch {
      // 입금 확인은 곁가지라, 한 파일이 안 읽혀도 전체를 실패로 보지 않는다.
    }
  }
  return { count, total };
}

export async function extractTransactionsLocally(
  files: File[],
  onProgress?: (done: number, total: number) => void,
  onPhase?: (phase: OcrPhase) => void,
  settlementFiles: File[] = [],
): Promise<LocalOcrOutcome> {
  if (files.length === 0) {
    return { status: "no-transactions" };
  }

  const settlement =
    settlementFiles.length > 0
      ? await summarizeSettlement(settlementFiles)
      : undefined;
  const withSettlement = (
    outcome: LocalOcrOutcome & { status: "ok" },
  ): LocalOcrOutcome =>
    settlement && settlement.count > 0 ? { ...outcome, settlement } : outcome;

  try {
    const transactions: ExtractedTransactionRow[] = [];
    const canvases: HTMLCanvasElement[] = [];
    // 문서마다 결제조건이 다를 수 있다. 먼저 나온 값을 쓰고 빈 칸만 뒤 문서로 채운다.
    const terms: DocumentTerms = {};
    let sawContent = false;

    function collectTerms(found: DocumentTerms) {
      terms.paymentTerms ??= found.paymentTerms;
      terms.paymentDays ??= found.paymentDays;
      terms.dueDate ??= found.dueDate;
    }

    for (let i = 0; i < files.length; i += 1) {
      onPhase?.({ phase: "rendering", done: i, total: files.length });
      const read = await readFile(files[i]);

      if (read.kind === "cells") {
        if (read.lines.length > 0) {
          sawContent = true;
          transactions.push(...rowsFromOcr({ lines: read.lines }));
          collectTerms(termsFromOcr({ lines: read.lines }));
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
        ? withSettlement({ status: "ok", transactions: unique, terms })
        : { status: "no-transactions" };
    }

    // 모델 다운로드 구간. 첫 방문은 여기서 7초 가까이 걸리는데, 알리지 않으면
    // 진행률이 0에 멈춰 있어 고장처럼 보인다.
    onPhase?.({ phase: "preparing" });
    const service = await getService();

    for (let index = 0; index < drawn.length; index += 1) {
      onPhase?.({ phase: "recognizing", done: index, total: drawn.length });
      const result = await recognizeInTurn(service, drawn[index]);
      transactions.push(...rowsFromOcr(result as { lines: [] }));
      collectTerms(termsFromOcr(result as { lines: [] }));
      onProgress?.(index + 1, drawn.length);
      // 페이지 사이에 렌더링을 한 번 양보한다. 안 그러면 진행률이 갱신되지 않고
      // 전부 끝난 뒤에 한꺼번에 튄다.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const unique = dedupe(transactions);
    return unique.length > 0
      ? withSettlement({ status: "ok", transactions: unique, terms })
      : { status: "no-transactions" };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
