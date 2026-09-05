"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { withCompany } from "@/lib/company-link";
import { todayInKorea } from "@/lib/today";
import {
  buildReviewGuidance,
  type ReviewStats,
} from "@/lib/llm/review-insight";
import StepShell from "@/app/step-shell";
import { SampleDataBadge } from "@/app/sample-badge";

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

const TODAY = todayInKorea();

// 진단일(오늘) 이후 날짜인지. 과거 실적·성장 지표 계산에서 빠진다.
function isFutureDate(raw: string): boolean {
  const value = raw.trim();
  return isValidDate(value) && value.slice(0, 10) > TODAY;
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
    if (list.length === 0) return { status: "empty", result: null };
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
  // 자동 확인된 항목은 기본으로 접어 둔다.
  const [showAuto, setShowAuto] = useState(false);

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

  // 비어 있는 값은 "확인했다"고 할 수 없다.
  //
  // 거래처나 거래일이 비면 그 거래는 지표 계산에서 통째로 빠진다
  // (lib/uploaded-signals.ts). 그런데 [전부 확인 처리]가 빈 값까지 확정해 버려서,
  // 사용자는 다 확인했다고 여기고 넘어가는데 계산에서는 사라졌다. 빈 값은
  // 확정 대상에서 빼고 검수 목록에 남겨 둔다.
  function isFilled(tx: Transaction, key: (typeof FIELD_META)[number]["key"]) {
    return String(tx[key].value ?? "").trim() !== "";
  }

  // 한 거래 줄에서 아직 확인 안 된 낮은 신뢰도 필드를 한꺼번에 확인 처리한다.
  function confirmRow(txIndex: number, tx: Transaction) {
    FIELD_META.forEach(({ key }) => {
      if (requiresConfirmation(tx[key].confidence) && isFilled(tx, key)) {
        confirmField(txIndex, key);
      }
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
    const noDocs = !extractionOutcome;
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
            {noDocs ? (
              <>
                분석 결과를 찾을 수 없습니다.
                <br />
                거래명세서를 먼저 업로드하세요.
              </>
            ) : extractionOutcome === "blank" ? (
              <>
                제출한 PDF가 브라우저에서 백지로 열려 거래를 읽지 못했습니다.
                <br />
                이미지(PNG·JPG)로 다시 올려 주세요.
              </>
            ) : (
              <>
                제출한 문서에서 거래 실적을 찾지 못했습니다.
                <br />
                거래명세서·세금계산서를 확인해 다시 올려 주세요.
              </>
            )}
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

  // 확인이 필요한 항목을 두 가지로 나눈다.
  //
  //   값이 있는데 신뢰도가 낮다  → 사람이 확인해야 넘어갈 수 있다
  //   값을 아예 읽지 못했다      → 채우면 좋지만, 못 채워도 넘어갈 수 있어야 한다
  //
  // 둘을 같이 묶으면 막다른 길이 된다. 문서에 거래처 라벨이 없어 이름을 못 읽으면
  // 사용자도 채울 수 없는데 진행 버튼이 영영 잠긴다. 대신 그 거래가 지표 계산에서
  // 빠진다는 사실을 아래에 적고, Step 05 도 같은 사실을 다시 알린다.
  const blockedFields = transactions.reduce((count, tx, txIndex) => {
    return (
      count +
      FIELD_META.filter(
        ({ key }) =>
          requiresConfirmation(tx[key].confidence) &&
          isFilled(tx, key) &&
          !confirmed.has(confirmKey(txIndex, key)),
      ).length
    );
  }, 0);

  // 읽지 못해 계산에서 빠질 거래. 값을 채우면 사라진다.
  const unreadableRows = transactions.filter(
    (tx) => !isFilled(tx, "customer") || !isValidDate(String(tx.date.value)),
  ).length;

  const allConfirmed = blockedFields === 0;

  const canProceed = allConfirmed;

  const futureCount = transactions.filter((tx) =>
    isFutureDate(String(tx.date.value)),
  ).length;

  // 이 거래가 원래 확인 대상이었는가(신뢰도 기준). 확인 여부와는 무관하다 —
  // 확인을 마쳤다고 목록에서 빼면, 방금 확인한 줄이 접힌 영역으로 내려가 버려서
  // 다시 고치려면 그 안을 뒤져야 한다. 확인 대상이었던 줄은 확인 후에도 자리를
  // 지키고, 상태 칸만 "확인함"(눌러서 재수정)으로 바뀐다.
  const rowHadFlag = (tx: Transaction) =>
    FIELD_META.some(({ key }) => requiresConfirmation(tx[key].confidence));

  // 접힘/펼침을 가르는 기준. 확인이 끝났는지가 아니라 애초에 확인 대상이었는지로 정한다.
  const rowNeedsAttention = (tx: Transaction) =>
    rowHadFlag(tx) || !isValidDate(String(tx.date.value));

  const indexed = transactions.map((tx, txIndex) => ({ tx, txIndex }));
  const attentionRows = indexed.filter(({ tx }) => rowNeedsAttention(tx));
  const autoRows = indexed.filter(({ tx }) => !rowNeedsAttention(tx));

  const renderRow = ({ tx, txIndex }: { tx: Transaction; txIndex: number }) => {
    const pending = pendingOf(tx, txIndex);
    const rowDateBad = !isValidDate(String(tx.date.value));
    const rowFuture = isFutureDate(String(tx.date.value));
    const rowReviewed = rowHadFlag(tx) && pending === 0 && !rowDateBad;

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
          const flag = requiresConfirmation(field.confidence) && !isConfirmed;
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
                // 품목처럼 긴 값은 입력창 너비를 넘어가 잘린다. 트랙패드는 두
                // 손가락 가로 스와이프로 잘린 글자를 볼 수 있지만, 마우스 휠은
                // 위아래(deltaY)만 보내서 아무 반응이 없었다. 휠로도 같은 걸
                // 할 수 있게, 넘친 입력창에서는 세로 스크롤 양을 가로로 돌려준다.
                onWheel={(event) => {
                  const el = event.currentTarget;
                  if (el.scrollWidth > el.clientWidth) {
                    event.preventDefault();
                    el.scrollLeft += event.deltaY;
                  }
                }}
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
          ) : rowFuture ? (
            <span className="text-[11px] font-medium text-amber-600">
              진단일 이후
            </span>
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
  };

  const TableHead = (
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
  );

  return (
    <StepShell
      step="Step 04"
      title="AI 분석 결과 확인"
      description="신뢰도가 낮은 항목만 직접 확인해 주세요. 어느 값이든 눌러서 바로 고칠 수 있습니다."
      backTo={withCompany("/upload", companyId)}
      companyId={companyId}
      footer={
        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canProceed}
            className="inline-flex h-[50px] items-center justify-center rounded-md bg-[#2A211C] px-10 text-[16px] font-semibold text-white transition-colors hover:bg-[#12100E] disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
          >
            내용 확인 완료
          </button>
          {unreadableRows > 0 && (
            <p className="mt-2 text-[12px] leading-5 text-amber-700">
              거래처나 거래일을 읽지 못한 {unreadableRows}건이 있습니다. 값을
              채우지 않고 진행하면 이 {unreadableRows}건은 성장 신호 계산에서
              제외됩니다.
            </p>
          )}
        </div>
      }
    >
      <div className="mb-3">
        <SampleDataBadge />
      </div>

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

      {/* 진단일 이후 거래는 과거 실적·성장 지표 계산에서 빠진다는 것을 알린다. */}
      {futureCount > 0 && (
        <p className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-[13px] leading-6 text-amber-700">
          진단일({TODAY}) 이후 날짜의 거래 {futureCount}건은 과거 실적과 성장 지표
          계산에서 제외됩니다. 발주·견적 등 예정된 거래라면 그대로 두셔도 됩니다.
        </p>
      )}

      {/* 거래 목록 — 확인이 필요한 항목만 먼저, 자동 확인된 항목은 접어 둔다. */}
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

      {/* 확인이 필요한 줄 */}
      {attentionRows.length > 0 ? (
        <div className="mt-2 max-h-[420px] overflow-auto rounded-lg border border-zinc-200">
          <table className="w-full min-w-[660px] border-collapse text-left">
            {TableHead}
            <tbody>{attentionRows.map(renderRow)}</tbody>
          </table>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-[13px] text-emerald-700">
          <IconCheck className="h-3 w-3" />
          확인이 필요한 항목이 없습니다. 모든 값이 자동으로 확인되었습니다.
        </div>
      )}

      {/* 자동 확인된 줄 — 기본 접힘 */}
      {autoRows.length > 0 && (
        <div className="mt-3 rounded-lg border border-zinc-200">
          <button
            type="button"
            onClick={() => setShowAuto((prev) => !prev)}
            className="flex w-full items-center justify-between px-4 py-3 text-[13px] text-zinc-600 transition-colors hover:bg-zinc-50"
            aria-expanded={showAuto}
          >
            <span className="inline-flex items-center gap-2">
              <IconCheck className="h-3 w-3 text-emerald-500" />
              자동 확인된 거래 {autoRows.length}건
            </span>
            <span className="text-zinc-400">{showAuto ? "접기" : "펼치기"}</span>
          </button>
          {showAuto && (
            <div className="max-h-[360px] overflow-auto border-t border-zinc-200">
              <table className="w-full min-w-[660px] border-collapse text-left">
                {TableHead}
                <tbody>{autoRows.map(renderRow)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </StepShell>
  );
}
