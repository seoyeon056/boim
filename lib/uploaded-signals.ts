import type { Transaction } from "@/data/transactions";
import { calculateSignals, type Signals } from "@/lib/signals";

// 사용자가 올린 문서에서 뽑아 Step 04에서 검수까지 마친 거래로 성장 신호를 계산한다.
//
// 지금까지는 /signals·/compare·/share가 서버에서 getSignals()를 불렀고, 그건
// data/transactions.ts(합성 데이터)만 읽었다. 정작 사용자가 올린 문서는
// sessionStorage에 저장된 뒤 아무 데도 쓰이지 않았다. 그래서 어떤 문서를 올려도
// 거래처 증가율 +150% / 반복거래율 80% / 집중도 45%가 똑같이 나왔다.
//
// 추출 결과는 브라우저에만 있고 서버는 볼 수 없다. 그래서 계산도 브라우저에서 한다.
// lib/signals.ts는 순수 함수라 그대로 쓸 수 있다.
export const ANALYSIS_STORAGE_KEY = "boimAnalysisResult";

// Step 04가 저장하는 형태: 필드마다 {value, confidence}가 붙어 있다.
type ReviewedField = { value?: unknown };
type ReviewedRow = Record<string, ReviewedField | undefined>;

function fieldValue(row: ReviewedRow, key: string): unknown {
  return row[key]?.value;
}

// calculateSignals는 date(YYYY-MM-DD 문자열)·customer·amount만 본다.
// companyId와 item은 계산에 안 쓰이지만 타입을 맞추기 위해 채운다.
function toTransaction(raw: unknown, companyId: string): Transaction | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const row = raw as ReviewedRow;
  const date = String(fieldValue(row, "date") ?? "");
  const customer = String(fieldValue(row, "customer") ?? "").trim();
  const amount = Number(fieldValue(row, "amount") ?? 0);

  // 거래처명과 날짜가 없으면 어떤 지표도 계산할 수 없다.
  // (증가율은 날짜로 기간을 나누고, 집중도·반복거래율은 거래처명으로 묶는다.)
  if (!customer || !/^\d{4}-\d{2}/.test(date)) {
    return null;
  }

  return {
    companyId,
    date,
    customer,
    item: String(fieldValue(row, "item") ?? ""),
    amount: Number.isFinite(amount) ? amount : 0,
  };
}

export type UploadedSignals = {
  signals: Signals;
  transactionCount: number;
};

// 업로드·검수된 거래가 있으면 그걸로 계산한 신호를, 없으면 null을 돌려준다.
// null이면 호출하는 화면이 서버가 계산한 합성 데이터를 그대로 쓴다.
export function readUploadedSignals(
  companyId: string,
): UploadedSignals | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = sessionStorage.getItem(ANALYSIS_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const transactions = rows
      .map((row) => toTransaction(row, companyId))
      .filter((item): item is Transaction => item !== null);

    if (transactions.length === 0) {
      return null;
    }

    return {
      signals: calculateSignals(transactions),
      transactionCount: transactions.length,
    };
  } catch {
    return null;
  }
}
