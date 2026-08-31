"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { withCompany } from "@/lib/company-link";
import {
  buildReviewGuidance,
  type ReviewStats,
} from "@/lib/llm/review-insight";
import StepShell from "@/app/step-shell";

function IconCheck({ className = "h-2.5 w-2.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M3 8.5l3 3 7-7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type ConfidenceField = { value: string | number; confidence: number };
type FieldKey = "date" | "customer" | "item" | "amount";
type Transaction = Record<FieldKey, ConfidenceField>;

const STORAGE_KEY = "boimAnalysisResult";

const FIELD_META: { key: FieldKey; label: string; type: "text" | "number" }[] = [
  { key: "date", label: "거래 날짜", type: "text" },
  { key: "customer", label: "거래처", type: "text" },
  { key: "item", label: "품목", type: "text" },
  { key: "amount", label: "거래금액", type: "number" },
];

// 신뢰도 임계값
// - 0.95 이상: 자동 확인 완료 (초록)
// - 0.80 이상 0.95 미만: 확인 권장 (노랑)
// - 0.80 미만: 반드시 확인 (빨강)
const AUTO_CONFIRM = 0.95;
const REVIEW_SUGGESTED = 0.8;

type Tier = "high" | "medium" | "low";

// 2026 / 2026-02 / 2026-02-08 세 형식만 허용한다.
const DATE_RE = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;

function isValidDate(raw: string): boolean {
  const value = raw.trim();
  if (!DATE_RE.test(value)) return false;

  const parts = value.split("-").map(Number);
  if (parts[0] < 1900 || parts[0] > 2100) return false;

  // 2026-02-31 처럼 실제로 없는 날짜를 걸러낸다.
  if (parts.length === 3) {
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    if (date.getMonth() !== parts[1] - 1 || date.getDate() !== parts[2]) {
      return false;
    }
  }

  return true;
}

function tierOf(confidence: number): Tier {
  if (confidence >= AUTO_CONFIRM) return "high";
  if (confidence >= REVIEW_SUGGESTED) return "medium";
  return "low";
}

function requiresConfirmation(confidence: number): boolean {
  return confidence < AUTO_CONFIRM;
}

function toField(raw: unknown): ConfidenceField {
  if (raw && typeof raw === "object" && "value" in raw) {
    const obj = raw as { value?: unknown; confidence?: unknown };
    return {
      value:
        typeof obj.value === "number" || typeof obj.value === "string"
          ? obj.value
          : "",
      confidence: typeof obj.confidence === "number" ? obj.confidence : 1,
    };
  }
  if (typeof raw === "number" || typeof raw === "string") {
    return { value: raw, confidence: 1 };
  }
  return { value: "", confidence: 1 };
}

function toTransaction(raw: unknown): Transaction {
  const obj = (raw ?? {}) as Record<string, unknown>;
  return {
    date: toField(obj.date),
    customer: toField(obj.customer),
    item: toField(obj.item),
    amount: toField(obj.amount),
  };
}

type ViewStatus = "loading" | "empty" | "ready";

function loadResult(): { status: ViewStatus; result: Transaction[] | null } {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return { status: "empty", result: null };

  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return { status: "ready", result: list.map(toTransaction) };
  } catch {
    return { status: "empty", result: null };
  }
}

// 거래 인덱스 + 필드 키를 하나의 문자열 키로 합쳐서 확인 여부를 관리한다.
function confirmKey(txIndex: number, field: FieldKey) {
  return `${txIndex}:${field}`;
}

// LLM에 보낼 집계. 값(거래처명·금액 등)은 하나도 담지 않고 개수만 센다.
function buildReviewStats(transactions: Transaction[]): ReviewStats {
  const byField = FIELD_META.map(({ key, label }) => ({
    label,
    needReview: transactions.filter((tx) =>
      requiresConfirmation(tx[key].confidence),
    ).length,
  }));

  const needReview = byField.reduce((sum, field) => sum + field.needReview, 0);

  const lowConfidenceCount = transactions.reduce(
    (sum, tx) =>
      sum +
      FIELD_META.filter(({ key }) => tierOf(tx[key].confidence) === "low")
        .length,
    0,
  );

  return {
    transactionCount: transactions.length,
    totalFields: transactions.length * FIELD_META.length,
    needReview,
    lowConfidenceCount,
    byField,
  };
}

export function ReviewContent({ companyId }: { companyId?: string }) {
  const router = useRouter();

  const [status, setStatus] = useState<ViewStatus>("loading");
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [insight, setInsight] = useState<string | null>(null);
  const [extractionOutcome, setExtractionOutcome] = useState<string | null>(null);

  useEffect(() => {
    const { status: nextStatus, result } = loadResult();
    const outcome = sessionStorage.getItem("boimExtractionOutcome");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus(nextStatus);

    setExtractionOutcome(outcome);
    if (!result) return;

    setTransactions(result);

    // 안내 문장은 서버를 거치지 않고 여기서 만든다.

    setInsight(buildReviewGuidance(buildReviewStats(result)));
  }, []);

  // 금액은 자릿수가 커서 쉼표 없이는 5000000 이 얼마인지 바로 안 읽힌다.
  // 입력창에는 쉼표를 넣어 보여주고, 상태에는 숫자만 저장한다.
  function fieldText(key: FieldKey, value: string | number): string {
    if (key !== "amount") {
      return String(value);
    }

    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString("ko-KR") : String(value);
  }

  function updateValue(txIndex: number, key: FieldKey, raw: string) {
    setTransactions((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      // 쉼표를 지우고 숫자만 남긴다.
      const digits = raw.replace(/[^\d]/g, "");
      const nextValue = key === "amount" ? (digits === "" ? 0 : Number(digits)) : raw;
      next[txIndex] = {
        ...next[txIndex],
        [key]: { ...next[txIndex][key], value: nextValue },
      };
      return next;
    });
  }

  function confirmField(txIndex: number, key: FieldKey) {
    setConfirmed((prev) => new Set(prev).add(confirmKey(txIndex, key)));
  }

  // 재수정: 이미 확인 완료한 필드를 다시 수정 가능하게 되돌린다.
  function reEditField(txIndex: number, key: FieldKey) {
    setConfirmed((prev) => {
      const next = new Set(prev);
      next.delete(confirmKey(txIndex, key));
      return next;
    });
  }

  // 이 거래에 아직 손볼 게 남았는가. 표의 상태 칸에 쓴다.
  function pendingOf(tx: Transaction, txIndex: number): number {
    return FIELD_META.filter(
      ({ key }) =>
        requiresConfirmation(tx[key].confidence) &&
        !confirmed.has(confirmKey(txIndex, key)),
    ).length;
  }

  // 한 거래 줄에서 아직 확인 안 된 낮은 신뢰도 필드를 한꺼번에 확인 처리한다.
  function confirmRow(txIndex: number, tx: Transaction) {
    FIELD_META.forEach(({ key }) => {
      if (requiresConfirmation(tx[key].confidence)) confirmField(txIndex, key);
    });
  }

  function confirmAll() {
    if (!transactions) return;
    transactions.forEach((tx, txIndex) => confirmRow(txIndex, tx));
  }

  // 확인 처리한 줄(또는 전체)을 다시 검토 대상으로 되돌린다.
  function reEditRow(txIndex: number, tx: Transaction) {
    setConfirmed((prev) => {
      const next = new Set(prev);
      FIELD_META.forEach(({ key }) => {
        if (requiresConfirmation(tx[key].confidence)) {
          next.delete(confirmKey(txIndex, key));
        }
      });
      return next;
    });
  }

  function reEditAll() {
    if (!transactions) return;
    setConfirmed((prev) => {
      const next = new Set(prev);
      transactions.forEach((tx, txIndex) => {
        FIELD_META.forEach(({ key }) => {
          if (requiresConfirmation(tx[key].confidence)) {
            next.delete(confirmKey(txIndex, key));
          }
        });
      });
      return next;
    });
  }

  function handleConfirm() {
    if (!transactions) return;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
    router.push(withCompany("/signals", companyId));
  }

  if (status === "loading") return null;

  if (status === "empty" || !transactions) {
    return (
      <div className="mx-auto w-full max-w-lg px-6 py-12">
        <div className="mt-8 flex flex-col gap-1">
          <span className="font-mono text-xs font-medium uppercase tracking-widest text-zinc-400">
            Step 04
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            AI 분석 결과 확인
          </h1>
        </div>

        <div className="mt-8 rounded-lg border border-zinc-100 bg-zinc-50 p-6 text-center">
          <p className="text-sm leading-6 text-zinc-500">
            분석 결과를 찾을 수 없습니다.
            <br />
            거래명세서를 먼저 업로드하세요.
          </p>

          <Link
            href={withCompany("/upload", companyId)}
            className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-zinc-900 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
          >
            업로드 화면으로
          </Link>
        </div>
      </div>
    );
  }

  const totalFields = transactions.length * FIELD_META.length;
  let needReview = 0;
  transactions.forEach((tx) => {
    FIELD_META.forEach(({ key }) => {
      if (requiresConfirmation(tx[key].confidence)) needReview += 1;
    });
  });
  const autoConfirmed = totalFields - needReview;

  const allConfirmed = transactions.every((tx, txIndex) =>
    FIELD_META.every(
      ({ key }) =>
        !requiresConfirmation(tx[key].confidence) ||
        confirmed.has(confirmKey(txIndex, key)),
    ),
  );

  const datesValid = transactions.every((tx) =>
    isValidDate(String(tx.date.value)),
  );
  const canProceed = allConfirmed && datesValid;

  return (
    <StepShell
      step="Step 04"
      title="AI 분석 결과 확인"
      description="신뢰도가 낮은 항목만 직접 확인해 주세요. 어느 값이든 눌러서 바로 고칠 수 있습니다."
      backTo={withCompany("/upload", companyId)}
      companyId={companyId}
      footer={
        <div className="flex flex-col items-end gap-2">
          {!datesValid && (
            <p className="text-xs text-red-500">
              거래 날짜 형식을 확인해 주세요.
            </p>
          )}
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canProceed}
            className="inline-flex h-[50px] items-center justify-center rounded-md bg-[#2A211C] px-10 text-[16px] font-semibold text-white transition-colors hover:bg-[#12100E] disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
          >
            내용 확인 완료
          </button>
        </div>
      }
    >
      {/* 요약 통계 */}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-zinc-100 bg-zinc-100">
        {[
          {
            label: "총 분석 항목",
            value: `${totalFields}개`,
            color: "text-zinc-900",
          },
          {
            label: "자동 확인",
            value: `${autoConfirmed}개`,
            color: "text-emerald-600",
          },
          {
            label: "확인 필요",
            value: `${needReview}개`,
            color: "text-red-500",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col gap-1 bg-white px-4 py-3.5 text-center"
          >
            <span className="text-[11px] text-zinc-400">{stat.label}</span>
            <span className={`font-mono text-[20px] font-medium tabular-nums ${stat.color}`}>
              {stat.value}
            </span>
          </div>
        ))}
      </div>

      {/* AI 안내 문장. 도착 전에는 자리만 비워 두고 레이아웃은 흔들지 않는다. */}
      {insight && (
        <p className="mt-3 rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3 text-[13px] leading-6 text-zinc-600">
          {insight}
        </p>
      )}

      {/*
        추출이 실패해 예시 데이터로 대체된 경우를 사용자에게 알린다. 예전에는
        아무 표시 없이 바뀌어서, 자기 문서가 읽힌 줄 알게 됐다.
      */}
      {extractionOutcome && extractionOutcome !== "ok" && (
        <p className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-[13px] leading-6 text-amber-700">
          {extractionOutcome === "blank"
            ? "제출한 PDF가 브라우저에서 백지로 열립니다. 한글 폰트가 파일에 포함되지 않은 경우입니다. 아래 값은 예시 데이터이니, 이미지로 다시 올려 주세요."
            : extractionOutcome === "no-transactions"
              ? "제출한 문서에서 거래 내역을 찾지 못했습니다. 아래 값은 예시 데이터입니다."
              : "문서를 분석하지 못했습니다. 아래 값은 예시 데이터입니다."}
        </p>
      )}

      {/* 거래 목록 — 표.
          예전에는 거래마다 필드 카드 네 장을 세로로 쌓아서, 21건이면 화면이
          한없이 길어졌다(그래서 줄마다 펼침/접힘 토글을 달았다). 이제 한 줄에
          한 거래를 놓고, 건수가 많아도 스크롤 영역 안에 가둬 화면 길이를
          고정한다. 값은 셀에서 바로 고친다. */}
      <div className="mt-6 flex items-center justify-between gap-4">
        <span className="text-[13px] text-zinc-500">
          거래 {transactions.length}건
          {needReview > 0
            ? ` · 확인이 필요한 항목 ${needReview}개`
            : " · 모두 자동 확인되었습니다"}
        </span>
        {needReview > 0 && (
          <button
            type="button"
            onClick={allConfirmed ? reEditAll : confirmAll}
            className="h-8 shrink-0 rounded-md border border-zinc-200 px-3 text-[13px] text-zinc-600 transition-colors hover:border-zinc-400 hover:text-zinc-900"
          >
            {allConfirmed ? "다시 확인하기" : "전부 확인 처리"}
          </button>
        )}
      </div>

      <div className="mt-2 max-h-[460px] overflow-auto rounded-lg border border-zinc-200">
        <table className="w-full min-w-[660px] border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-zinc-50">
            <tr className="text-[11px] uppercase tracking-wide text-zinc-400">
              <th className="w-10 px-2 py-2 text-center font-medium">#</th>
              <th className="w-32 px-2 py-2 font-medium">거래 날짜</th>
              <th className="w-44 px-2 py-2 font-medium">거래처</th>
              <th className="px-2 py-2 font-medium">품목</th>
              <th className="w-36 px-2 py-2 text-right font-medium">거래금액</th>
              <th className="w-24 px-2 py-2 text-center font-medium">상태</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx, txIndex) => {
              const pending = pendingOf(tx, txIndex);
              const rowDateBad = !isValidDate(String(tx.date.value));
              const rowHadFlag = FIELD_META.some(({ key }) =>
                requiresConfirmation(tx[key].confidence),
              );
              const rowReviewed = rowHadFlag && pending === 0 && !rowDateBad;

              return (
                <tr
                  key={txIndex}
                  className={`border-t border-zinc-100 align-middle ${
                    pending > 0 || rowDateBad
                      ? "bg-amber-50/40"
                      : rowReviewed
                        ? "bg-emerald-50/30"
                        : "bg-white"
                  }`}
                >
                  <td className="px-2 py-1.5 text-center font-mono text-[11px] text-zinc-400">
                    {txIndex + 1}
                  </td>

                  {FIELD_META.map(({ key, type }) => {
                    const field = tx[key];
                    const tier = tierOf(field.confidence);
                    const isConfirmed = confirmed.has(confirmKey(txIndex, key));
                    const flag =
                      requiresConfirmation(field.confidence) && !isConfirmed;
                    const bad = key === "date" && !isValidDate(String(field.value));
                    const align = key === "amount" ? "text-right" : "text-left";

                    return (
                      <td key={key} className="px-2 py-1.5">
                        <input
                          type={key === "amount" ? "text" : type}
                          inputMode={
                            key === "amount"
                              ? "numeric"
                              : key === "date"
                                ? "numeric"
                                : undefined
                          }
                          value={fieldText(key, field.value)}
                          placeholder={key === "date" ? "2026-02-08" : undefined}
                          onChange={(event) =>
                            updateValue(txIndex, key, event.target.value)
                          }
                          onFocus={() => reEditField(txIndex, key)}
                          title={
                            tier === "low"
                              ? "AI가 정확하게 읽지 못했습니다. 값을 확인해 주세요."
                              : tier === "medium"
                                ? "한 번 더 확인하는 것을 권장합니다."
                                : undefined
                          }
                          className={`h-8 w-full rounded border bg-transparent px-2 font-mono text-[13px] text-zinc-900 outline-none transition-colors focus:border-solid focus:border-zinc-500 focus:bg-white ${align} ${
                            bad
                              ? "border-dashed border-red-400 bg-white"
                              : flag
                                ? tier === "low"
                                  ? "border-dashed border-red-400 bg-white"
                                  : "border-dashed border-amber-400 bg-white"
                                : "border-transparent hover:border-zinc-200"
                          }`}
                        />
                      </td>
                    );
                  })}

                  <td className="px-2 py-1.5 text-center">
                    {rowDateBad ? (
                      <span className="text-[11px] font-medium text-red-500">
                        날짜 확인
                      </span>
                    ) : pending > 0 ? (
                      <button
                        type="button"
                        onClick={() => confirmRow(txIndex, tx)}
                        className="inline-flex items-center gap-1 rounded-md bg-[#7e4d39] px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-[#5f3a2b]"
                      >
                        확인 {pending}
                      </button>
                    ) : rowReviewed ? (
                      <button
                        type="button"
                        onClick={() => reEditRow(txIndex, tx)}
                        title="다시 확인하기"
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 py-0.5 text-[11px] font-medium text-emerald-600 transition-colors hover:bg-emerald-50"
                      >
                        <IconCheck /> 확인함
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-500">
                        <IconCheck /> 자동
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </StepShell>
  );
}
