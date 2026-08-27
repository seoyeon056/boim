"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { withCompany } from "@/lib/company-link";
import { fetchReviewInsight } from "@/lib/api";
import {
  buildReviewFallback,
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

// 수기 입력과 달력 선택을 모두 허용하는 날짜 필드.
// 네이티브 date 피커는 브라우저마다 모양이 달라, 직접 만든 달력 팝업을 쓴다.
function DateInput({
  value,
  invalid,
  onChange,
  onFocus,
  tone = "plain",
}: {
  value: string;
  invalid: boolean;
  onChange: (v: string) => void;
  onFocus?: () => void;
  tone?: "plain" | "muted";
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const base0 = isValidDate(value) && value.length === 10 ? new Date(value) : new Date();
  const [view, setView] = useState({ y: base0.getFullYear(), m: base0.getMonth() });

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  function openPicker() {
    onFocus?.();
    const b = isValidDate(value) && value.length === 10 ? new Date(value) : new Date();
    setView({ y: b.getFullYear(), m: b.getMonth() });
    setOpen((v) => !v);
  }

  function pick(day: number) {
    onChange(`${view.y}-${String(view.m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    setOpen(false);
  }

  const firstDay = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const selected = isValidDate(value) && value.length === 10 ? new Date(value) : null;
  const today = new Date();

  return (
    <div className="relative" ref={wrapRef}>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        placeholder="2026-02-08"
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        className={`h-10 w-full rounded-md border px-3 pr-10 font-mono text-sm font-medium text-zinc-900 outline-none transition-colors focus:border-zinc-500 ${
          invalid ? "border-[#8a4a2e]" : "border-zinc-200"
        } ${tone === "muted" ? "bg-zinc-50" : "bg-white"}`}
      />
      <button
        type="button"
        onClick={openPicker}
        aria-label="달력에서 선택"
        aria-expanded={open}
        className={`absolute right-1 top-1 z-10 flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-zinc-100 hover:text-zinc-700 ${open ? "bg-zinc-100 text-zinc-700" : "text-zinc-400"}`}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="3.5" width="12" height="10.5" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M2 6.75h12M5.5 2v2.5M10.5 2v2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-30 w-[248px] rounded-lg border border-zinc-200 bg-white p-3 shadow-lg">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))}
              className="flex h-7 w-7 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
              aria-label="이전 달"
            >
              ‹
            </button>
            <span className="font-mono text-[13px] font-semibold text-zinc-900">
              {view.y}. {String(view.m + 1).padStart(2, "0")}
            </span>
            <button
              type="button"
              onClick={() => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))}
              className="flex h-7 w-7 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
              aria-label="다음 달"
            >
              ›
            </button>
          </div>

          <div className="mt-2.5 grid grid-cols-7 gap-y-0.5">
            {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
              <span key={d} className="flex h-6 items-center justify-center text-[10px] text-zinc-400">{d}</span>
            ))}
            {cells.map((day, i) => {
              if (day === null) return <span key={`e${i}`} />;
              const isSel = selected !== null && selected.getFullYear() === view.y && selected.getMonth() === view.m && selected.getDate() === day;
              const isToday = today.getFullYear() === view.y && today.getMonth() === view.m && today.getDate() === day;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => pick(day)}
                  className={`mx-auto flex h-7 w-7 items-center justify-center rounded font-mono text-[12px] transition-colors ${
                    isSel
                      ? "bg-zinc-900 font-semibold text-white"
                      : isToday
                        ? "font-semibold text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:bg-zinc-100"
                        : "text-zinc-600 hover:bg-zinc-100"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="mt-2.5 flex items-center justify-between border-t border-zinc-100 pt-2">
            <button
              type="button"
              onClick={() => {
                const t = new Date();
                onChange(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`);
                setOpen(false);
              }}
              className="text-[11px] text-zinc-500 transition-colors hover:text-zinc-900"
            >
              오늘로 설정
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-zinc-400 transition-colors hover:text-zinc-700">
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

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

    // 안내 문장은 처음 불러온 추출 결과 기준으로 한 번만 만든다. 사용자가 값을
    // 고칠 때마다 다시 부르면 호출만 늘고 문장은 거의 그대로다.
    let isActive = true;
    const stats = buildReviewStats(result);

    fetchReviewInsight(stats)
      .then(({ insight: text }) => {
        if (isActive) setInsight(text);
      })
      .catch(() => {
        if (isActive) setInsight(buildReviewFallback(stats));
      });

    return () => {
      isActive = false;
    };
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
      description="신뢰도가 낮은 항목만 직접 확인해 주세요."
      backTo={withCompany("/upload", companyId)}
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
            className="inline-flex h-11 items-center justify-center rounded-md bg-zinc-900 px-8 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
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

      {/* 거래 여러 건을 순서대로 렌더링 */}
      {transactions.map((tx, txIndex) => (
        <div key={txIndex} className="mt-6">
          {transactions.length > 1 && (
            <p className="mb-2 font-mono text-xs text-zinc-400">
              거래 {txIndex + 1} / {transactions.length}
            </p>
          )}

          <div className="grid auto-rows-fr grid-cols-1 gap-2 md:grid-cols-2">
          {FIELD_META.map(({ key, label, type }) => {
            const field = tx[key];
            const tier = tierOf(field.confidence);
            const isConfirmed = confirmed.has(confirmKey(txIndex, key));
            const editable =
              requiresConfirmation(field.confidence) && !isConfirmed;
            const isDate = key === "date";
            const dateBad = isDate && !isValidDate(String(field.value));

            return (
              <div
                key={key}
                className="rounded-lg border border-zinc-100 bg-white px-4 py-3 transition-colors hover:border-zinc-200"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] text-zinc-500">
                    {label}
                  </span>

                  {tier === "high" && (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-500">
                      <IconCheck /> 자동 확인
                    </span>
                  )}
                  {tier !== "high" && isConfirmed && (
                    <button
                      type="button"
                      onClick={() => reEditField(txIndex, key)}
                      className="flex items-center gap-1 text-[11px] text-emerald-500 transition-colors hover:text-emerald-700"
                    >
                      <IconCheck /> 확인 완료 · 수정
                    </button>
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
                    {isDate ? (
                      <DateInput
                        value={String(field.value)}
                        invalid={dateBad}
                        onChange={(next) => updateValue(txIndex, key, next)}
                      />
                    ) : (
                      <input
                        type={type}
                        value={field.value}
                        onChange={(event) =>
                          updateValue(txIndex, key, event.target.value)
                        }
                        className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-400"
                      />
                    )}
                    {dateBad && (
                      <p className="text-[11px] text-red-500">
                        2026 / 2026-02 / 2026-02-08 형식으로 입력해 주세요.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => confirmField(txIndex, key)}
                      disabled={dateBad}
                      className="h-9 rounded-md bg-zinc-900 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
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
                  <div className="mt-1 flex flex-col gap-1.5">
                    {isDate ? (
                      <DateInput
                        value={String(field.value)}
                        invalid={dateBad}
                        onChange={(next) => updateValue(txIndex, key, next)}
                        onFocus={() => reEditField(txIndex, key)}
                        tone="muted"
                      />
                    ) : (
                      <input
                        type={type}
                        value={field.value}
                        onChange={(event) =>
                          updateValue(txIndex, key, event.target.value)
                        }
                        onFocus={() => reEditField(txIndex, key)}
                        className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 font-mono text-sm font-medium text-zinc-900 outline-none transition-colors focus:border-zinc-400"
                      />
                    )}
                    {dateBad && (
                      <p className="text-[11px] text-red-500">
                        2026 / 2026-02 / 2026-02-08 형식으로 입력해 주세요.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          </div>
        </div>
      ))}
    </StepShell>
  );
}
