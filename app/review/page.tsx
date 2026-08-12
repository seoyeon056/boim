"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// AI가 각 항목마다 값과 함께 신뢰도(confidence)를 돌려줬다고 가정한다.
type ConfidenceField = {
  value: string | number;
  confidence: number;
};

type FieldKey = "date" | "customer" | "item" | "amount";

type AnalysisResult = Record<FieldKey, ConfidenceField> & {
  isFallback?: boolean;
};

const STORAGE_KEY = "boimAnalysisResult";

// 화면에 표시할 항목 정의 (순서 · 라벨 · 입력 타입)
const FIELD_META: { key: FieldKey; label: string; type: "text" | "number" }[] =
  [
    { key: "date", label: "거래 날짜", type: "text" },
    { key: "customer", label: "거래처", type: "text" },
    { key: "item", label: "품목", type: "text" },
    { key: "amount", label: "거래금액", type: "number" },
  ];

// 신뢰도 임계값
// - 0.95 이상: 자동 확인 완료 (초록)
// - 0.80 이상 0.95 미만: 확인 권장 (노랑) — 자동 확인으로 처리하되 눈에 띄게 표시
// - 0.80 미만: 반드시 확인 (빨강) — 사용자가 직접 수정
const AUTO_CONFIRM = 0.95;
const REVIEW_SUGGESTED = 0.8;

type Tier = "high" | "medium" | "low";

function tierOf(confidence: number): Tier {
  if (confidence >= AUTO_CONFIRM) return "high";
  if (confidence >= REVIEW_SUGGESTED) return "medium";
  return "low";
}

// 자동 확인 완료(high)를 제외한 모든 항목은 사용자가 직접 수정하고 확인해야 한다.
// - 확인 권장(medium): 수정 가능 + '이 값이 맞습니다' 버튼
// - 확인 필요(low): 수정 가능 + '이 값이 맞습니다' 버튼
function requiresConfirmation(confidence: number): boolean {
  return confidence < AUTO_CONFIRM;
}

// 읽기 전용으로 보여줄 때의 표시 문자열
function displayValue(key: FieldKey, value: string | number): string {
  if (key === "amount") {
    const num = Number(value);
    return `${Number.isFinite(num) ? num.toLocaleString("ko-KR") : value}원`;
  }
  return String(value);
}

// sessionStorage에서 읽은 임의의 값을 안전하게 ConfidenceField로 변환한다.
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
  // 신뢰도 없이 값만 저장돼 있으면 확신한 값으로 간주한다.
  if (typeof raw === "number" || typeof raw === "string") {
    return { value: raw, confidence: 1 };
  }
  return { value: "", confidence: 1 };
}

type ViewStatus = "loading" | "empty" | "ready";

function loadResult(): { status: ViewStatus; result: AnalysisResult | null } {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { status: "empty", result: null };
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      status: "ready",
      result: {
        date: toField(parsed.date),
        customer: toField(parsed.customer),
        item: toField(parsed.item),
        amount: toField(parsed.amount),
        isFallback: Boolean(parsed.isFallback),
      },
    };
  } catch {
    return { status: "empty", result: null };
  }
}

export default function ReviewPage() {
  const router = useRouter();

  // 서버 렌더 시점에는 sessionStorage가 없으므로 loading으로 시작하고
  // 마운트 이후 브라우저에서 한 번만 실제 값을 읽어 온다.
  const [status, setStatus] = useState<ViewStatus>("loading");
  const [form, setForm] = useState<AnalysisResult | null>(null);
  // 사용자가 '이 값이 맞습니다'로 확인 완료 처리한 항목들
  const [confirmed, setConfirmed] = useState<Set<FieldKey>>(new Set());

  useEffect(() => {
    // 브라우저 전용 API(sessionStorage)를 마운트 후 한 번만 읽어 초기화한다.
    // React 19의 set-state-in-effect 규칙은 이 일회성 초기화를 과하게 막으므로 예외 처리한다.
    const { status: nextStatus, result } = loadResult();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus(nextStatus);
    if (result) {
      setForm(result);
    }
  }, []);

  // 수정 가능한 항목의 값을 갱신한다.
  function updateValue(key: FieldKey, raw: string) {
    setForm((prev) => {
      if (!prev) return prev;
      const nextValue =
        key === "amount" ? (raw === "" ? 0 : Number(raw)) : raw;
      return {
        ...prev,
        [key]: { ...prev[key], value: nextValue },
      };
    });
  }

  // 수정한 값을 확정하고 해당 항목을 확인 완료 상태로 바꾼다.
  function confirmField(key: FieldKey) {
    setConfirmed((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }

  function handleConfirm() {
    if (!form) return;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    router.push("/signals");
  }

  // 저장된 결과를 확인하기 전에는 아무것도 확정하지 않는다.
  if (status === "loading") {
    return null;
  }

  // 저장된 결과가 없으면 업로드 화면으로 돌아가라고 안내한다.
  if (status === "empty" || !form) {
    return (
      <div className="flex flex-1 flex-col bg-zinc-100 px-4 py-16">
        <div className="mx-auto w-full max-w-md">
          <main className="mt-8 flex flex-col gap-3 text-center sm:text-left">
            <p className="text-sm font-semibold text-blue-600">STEP 4</p>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
              AI 분석 결과 확인
            </h1>
          </main>

          <div className="mt-8 rounded-2xl bg-white p-6 text-center shadow-sm">
            <p className="text-base leading-7 text-zinc-600">
              분석 결과를 찾을 수 없습니다.
              <br />
              거래명세서를 먼저 업로드하세요.
            </p>

            <Link
              href="/upload"
              className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-blue-600 px-6 text-base font-semibold text-white transition-colors hover:bg-blue-700"
            >
              업로드 화면으로 돌아가기
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 요약 카드 숫자 계산
  const total = FIELD_META.length;
  const needReview = FIELD_META.filter(
    ({ key }) => requiresConfirmation(form[key].confidence),
  ).length;
  const autoConfirmed = total - needReview;

  // 확인이 필요한 항목이 아직 남아 있으면 '내용 확인 완료'를 비활성화한다.
  const allConfirmed = FIELD_META.every(
    ({ key }) => !requiresConfirmation(form[key].confidence) || confirmed.has(key),
  );

  return (
    <div className="flex flex-1 flex-col bg-zinc-100 px-4 py-16">
      <div className="mx-auto w-full max-w-md">
        <Link
          href="/upload"
          className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-800"
        >
          ← 이전으로
        </Link>

        <main className="mt-8 flex flex-col gap-3 text-center sm:text-left">
          <p className="text-sm font-semibold text-blue-600">STEP 4</p>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            AI 분석 결과 확인
          </h1>
          <p className="text-base leading-7 text-zinc-500">
            AI는 대부분의 항목을 자동으로 분석했습니다.
            <br />
            신뢰도가 낮은 항목만 확인해 주세요.
          </p>
        </main>

        {/* 요약 카드 */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white p-4 text-center shadow-sm">
            <p className="text-xs font-medium text-zinc-500">총 분석 항목</p>
            <p className="mt-1 text-2xl font-bold text-zinc-900">{total}개</p>
          </div>
          <div className="rounded-2xl bg-white p-4 text-center shadow-sm">
            <p className="text-xs font-medium text-zinc-500">자동 확인 완료</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">
              {autoConfirmed}개
            </p>
          </div>
          <div className="rounded-2xl bg-white p-4 text-center shadow-sm">
            <p className="text-xs font-medium text-zinc-500">확인이 필요한 항목</p>
            <p className="mt-1 text-2xl font-bold text-red-600">{needReview}개</p>
          </div>
        </div>

        {/* 항목 목록 (한 줄씩 배치) */}
        <div className="mt-6 flex flex-col gap-4">
          {FIELD_META.map(({ key, label, type }) => {
            const field = form[key];
            const tier = tierOf(field.confidence);
            // high(자동 확인)를 제외한 항목은 사용자가 확인 완료하기 전까지 수정 가능하다.
            const isConfirmed = confirmed.has(key);
            const editable = requiresConfirmation(field.confidence) && !isConfirmed;

            return (
              <div
                key={key}
                className="flex flex-col gap-2 rounded-2xl bg-white p-5 shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-zinc-700">
                    {label}
                  </span>

                  {tier === "high" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      ✅ 자동 확인 완료
                    </span>
                  )}
                  {tier !== "high" && isConfirmed && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      ✅ 확인 완료
                    </span>
                  )}
                  {tier === "medium" && !isConfirmed && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                      ⚠ 확인 권장
                    </span>
                  )}
                  {tier === "low" && !isConfirmed && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                      ⚠ 확인 필요
                    </span>
                  )}
                </div>

                {/* 아직 확인 완료 전인 항목에만 안내 문구를 보여준다. */}
                {tier === "low" && !isConfirmed && (
                  <p className="rounded-xl bg-red-50 px-4 py-2 text-sm font-medium leading-6 text-red-700">
                    AI가 정확하게 읽지 못했습니다. 값을 확인하고 수정해 주세요.
                  </p>
                )}
                {tier === "medium" && !isConfirmed && (
                  <p className="rounded-xl bg-amber-50 px-4 py-2 text-sm font-medium leading-6 text-amber-700">
                    한 번 더 확인하는 것을 권장합니다.
                  </p>
                )}

                {editable ? (
                  <>
                    <input
                      type={type}
                      value={field.value}
                      onChange={(event) => updateValue(key, event.target.value)}
                      className="h-11 rounded-xl border border-zinc-300 bg-white px-4 text-base text-zinc-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                    <button
                      type="button"
                      onClick={() => confirmField(key)}
                      className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-zinc-700"
                    >
                      이 값이 맞습니다
                    </button>
                  </>
                ) : (
                  // 읽기 전용: 회색 배경으로 수정 불가임을 나타낸다.
                  <p className="rounded-xl bg-zinc-100 px-4 py-3 text-base font-semibold text-zinc-800">
                    {displayValue(key, field.value)}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={!allConfirmed}
          className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-blue-600 px-6 text-base font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 disabled:hover:bg-zinc-300"
        >
          내용 확인 완료
        </button>
      </div>
    </div>
  );
}
