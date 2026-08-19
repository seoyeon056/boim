"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { withCompany } from "@/lib/company-link";

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

function tierOf(confidence: number): Tier {
  if (confidence >= AUTO_CONFIRM) return "high";
  if (confidence >= REVIEW_SUGGESTED) return "medium";
  return "low";
}

function requiresConfirmation(confidence: number): boolean {
  return confidence < AUTO_CONFIRM;
}

function displayValue(key: FieldKey, value: string | number): string {
  if (key === "amount") {
    const num = Number(value);
    return `${Number.isFinite(num) ? num.toLocaleString("ko-KR") : value}원`;
  }
  return String(value);
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

export function ReviewContent({ companyId }: { companyId?: string }) {
  const router = useRouter();

  const [status, setStatus] = useState<ViewStatus>("loading");
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const { status: nextStatus, result } = loadResult();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus(nextStatus);
    if (result) setTransactions(result);
  }, []);

  function updateValue(txIndex: number, key: FieldKey, raw: string) {
    setTransactions((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const nextValue = key === "amount" ? (raw === "" ? 0 : Number(raw)) : raw;
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

  function handleConfirm() {
    if (!transactions) return;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
    router.push(withCompany("/signals", companyId));
  }

  if (status === "loading") return null;

  if (status === "empty" || !transactions) {
    return (
      <div className="mx-auto w-full max-w-lg px-6 py-12">
        <div className="flex flex-col gap-1">
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

  return (
    <div className="mx-auto w-full max-w-lg px-6 py-12">
      <Link
        href={withCompany("/upload", companyId)}
        className="inline-flex items-center gap-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-600"
      >
        ← 이전으로
      </Link>

      <div className="mt-8 flex flex-col gap-1">
        <span className="font-mono text-xs font-medium uppercase tracking-widest text-zinc-400">
          Step 04
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          AI 분석 결과 확인
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          AI는 대부분의 항목을 자동으로 분석했습니다. 신뢰도가 낮은 항목만
          확인해 주세요.
        </p>
      </div>

      {/* 요약 통계 */}
      <div className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-zinc-100 bg-zinc-100">
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
            className="flex flex-col gap-1 bg-white px-4 py-3 text-center"
          >
            <span className="text-[10px] text-zinc-400">{stat.label}</span>
            <span className={`font-mono text-lg font-semibold ${stat.color}`}>
              {stat.value}
            </span>
          </div>
        ))}
      </div>

      {/* 거래 여러 건을 순서대로 렌더링 */}
      {transactions.map((tx, txIndex) => (
        <div key={txIndex} className="mt-6 flex flex-col gap-2">
          {transactions.length > 1 && (
            <p className="font-mono text-xs text-zinc-400">
              거래 {txIndex + 1} / {transactions.length}
            </p>
          )}

          {FIELD_META.map(({ key, label, type }) => {
            const field = tx[key];
            const tier = tierOf(field.confidence);
            const isConfirmed = confirmed.has(confirmKey(txIndex, key));
            const editable =
              requiresConfirmation(field.confidence) && !isConfirmed;

            return (
              <div
                key={key}
                className="rounded-lg border border-zinc-100 bg-white px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-zinc-500">
                    {label}
                  </span>

                  {tier === "high" && (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-500">
                      <IconCheck /> 자동 확인
                    </span>
                  )}
                  {tier !== "high" && isConfirmed && (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-500">
                      <IconCheck /> 확인 완료
                    </span>
                  )}
                  {tier === "medium" && !isConfirmed && (
                    <span className="text-[11px] text-amber-500">확인 권장</span>
                  )}
                  {tier === "low" && !isConfirmed && (
                    <span className="text-[11px] text-red-500">확인 필요</span>
                  )}
                </div>

                {editable ? (
                  <div className="mt-2 flex flex-col gap-2">
                    {tier === "low" && (
                      <p className="text-xs leading-5 text-red-400">
                        AI가 정확하게 읽지 못했습니다. 값을 확인하고 수정해
                        주세요.
                      </p>
                    )}
                    {tier === "medium" && (
                      <p className="text-xs leading-5 text-amber-500">
                        한 번 더 확인하는 것을 권장합니다.
                      </p>
                    )}
                    <input
                      type={type}
                      value={field.value}
                      onChange={(event) =>
                        updateValue(txIndex, key, event.target.value)
                      }
                      className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-400"
                    />
                    <button
                      type="button"
                      onClick={() => confirmField(txIndex, key)}
                      className="h-9 rounded-md bg-zinc-900 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
                    >
                      이 값이 맞습니다
                    </button>
                  </div>
                ) : tier === "high" ? (
                  // 자동 확인된 항목은 읽기 전용으로 둔다.
                  <p className="mt-1.5 font-mono text-sm font-medium text-zinc-900">
                    {displayValue(key, field.value)}
                  </p>
                ) : (
                  // 한 번 확인한 항목도 다시 만지면 바로 수정 상태로 돌아간다.
                  // (수정 버튼을 따로 누르게 하면 오타를 발견해도 한 단계 더 걸린다.)
                  <input
                    type={type}
                    value={field.value}
                    onChange={(event) =>
                      updateValue(txIndex, key, event.target.value)
                    }
                    onFocus={() => reEditField(txIndex, key)}
                    className="mt-1 w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 font-mono text-sm font-medium text-zinc-900 outline-none transition-colors focus:border-zinc-400"
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}

      <div className="mt-6">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!allConfirmed}
          className="inline-flex h-10 w-full items-center justify-center rounded-md bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
        >
          내용 확인 완료
        </button>
      </div>
    </div>
  );
}
