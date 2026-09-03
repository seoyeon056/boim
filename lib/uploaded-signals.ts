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
export const SETTLEMENT_STORAGE_KEY = "boimSettlement";

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

// 진단 시점(오늘) 이후의 거래는 과거 실적이 아니다. YYYY-MM-DD 문자열 비교로
// 충분하다(둘 다 같은 형식).
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export type UploadedSignals = {
  signals: Signals;
  transactionCount: number;
  // 거래처나 날짜를 읽지 못해 계산에서 뺀 행의 수.
  //
  // 예전에는 그냥 버리고 아무 말도 하지 않았다. 그래서 Step 04 는 "거래 10건"
  // 이라고 하는데 Step 05 는 5건으로만 계산하는 일이 실제로 있었다(스캔 PDF 에서
  // OCR 이 "공급받는자"를 "공급받-는자"로 읽어 거래처가 빈 값이 됐다).
  // 몇 건이 빠졌는지 화면이 말할 수 있게 세어서 함께 돌려준다.
  excludedCount: number;
  // 진단일 이후 날짜라 과거 실적·성장 지표 계산에서 제외한 거래 건수.
  // (분석 기간은 signals.periodStart/periodEnd 에 이미 들어 있다.)
  futureExcludedCount: number;
};

// 업로드·검수된 거래가 있으면 그걸로 계산한 신호를, 없으면 null을 돌려준다.
// null이면 호출하는 화면이 "산정 불가"로 처리한다(합성 데이터로 대체하지 않는다).
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
    const all = rows
      .map((row) => toTransaction(row, companyId))
      .filter((item): item is Transaction => item !== null);

    // 거래처·날짜를 못 읽어 빠진 행. (rows = 원본, all = 읽기 성공)
    const excludedCount = rows.length - all.length;

    const cutoff = today();
    const past = all.filter((item) => item.date.slice(0, 10) <= cutoff);
    const futureExcludedCount = all.length - past.length;

    if (past.length === 0) {
      return null;
    }

    return {
      signals: calculateSignals(past),
      transactionCount: past.length,
      excludedCount,
      futureExcludedCount,
    };
  } catch {
    return null;
  }
}

export type SettlementSummary = { count: number; total: number };

// 입금내역에서 확인한 입금 건수·합계. 매출에는 합산하지 않고 곁들여 보여주기만 한다.
export function readSettlementSummary(): SettlementSummary | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = sessionStorage.getItem(SETTLEMENT_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<SettlementSummary>;
    const count = Number(parsed.count ?? 0);
    const total = Number(parsed.total ?? 0);
    return count > 0 ? { count, total } : null;
  } catch {
    return null;
  }
}
