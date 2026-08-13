"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// ─────────────────────────────────────────────
// 이 화면은 실제 OCR / AI / 서버 분석을 하지 않는다.
// 아래 13개의 상태를 순서대로 자동으로 바꿔가며
// "분석이 진행되는 것처럼" 보이는 합성(가짜) 진행 화면이다.
// ─────────────────────────────────────────────

function IconCheck({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <path
        d="M3 8.5l3 3 7-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconWarning({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 5.2v3.6M8 11h.01"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// 각 진행 단계가 가리키는 작업(=화면에 표시할 체크리스트 항목)
const TASKS = [
  "거래명세서 분석",
  "세금계산서 분석",
  "발주서 분석",
  "견적서 분석",
  "계약서 분석",
  "입금내역 분석",
  "성장 신호 계산",
];

// phase 의미
// - processing: 현재 확인 중 (강조 + 스피너)
// - done: 확인 완료 (체크 아이콘)
// - warning: 신뢰도 낮은 항목 발견 (경고 아이콘)
type Phase = "processing" | "done" | "warning";

// 순서대로 자동 변경할 13개의 상태.
// text 는 화면 상단에 그대로 보여줄 문구이고,
// task 는 이 상태가 어떤 체크리스트 항목에 해당하는지를 가리킨다.
const STEPS: { text: string; task: number; phase: Phase }[] = [
  { text: "거래명세서 확인 중...", task: 0, phase: "processing" },
  { text: "거래명세서 확인 완료", task: 0, phase: "done" },
  { text: "세금계산서 확인 중...", task: 1, phase: "processing" },
  { text: "세금계산서 확인 완료", task: 1, phase: "done" },
  { text: "발주서 확인 중...", task: 2, phase: "processing" },
  { text: "발주서 확인 완료", task: 2, phase: "done" },
  { text: "견적서 확인 중...", task: 3, phase: "processing" },
  { text: "견적서 확인 완료", task: 3, phase: "done" },
  { text: "계약서 확인 중...", task: 4, phase: "processing" },
  { text: "계약서에서 신뢰도 낮은 항목 발견", task: 4, phase: "warning" },
  { text: "입금내역 확인 완료", task: 5, phase: "done" },
  { text: "성장 신호 계산 중...", task: 6, phase: "processing" },
  { text: "분석 완료", task: 6, phase: "done" },
];

// 전체 과정이 약 8초 동안 진행되도록 단계 간격을 정한다.
// 마지막 "분석 완료" 상태를 잠시 보여준 뒤 /review 로 이동한다.
const STEP_MS = 600; // 상태 하나당 약 0.6초 → 13단계 ≈ 7.8초
const FINISH_HOLD_MS = 800; // 마지막 상태를 잠시 유지한 뒤 이동

// /review 화면이 기대하는 합성 분석 결과.
// 거래가 여러 건일 때도 검수 화면이 동작하는지 보여주기 위해 배열로 둔다.
// 실제 분석 대신, 계약서에서 신뢰도 낮은 항목을 발견했다는
// 이 화면의 이야기와 맞아떨어지도록 일부 항목의 신뢰도를 낮게 둔다.
const SYNTHETIC_RESULT = [
  {
    date: { value: "2026-03-15", confidence: 0.98 },
    customer: { value: "대한상사", confidence: 0.97 },
    item: { value: "산업용 부품 세트", confidence: 0.88 },
    amount: { value: 12500000, confidence: 0.62 },
  },
  {
    date: { value: "2026-04-02", confidence: 0.91 },
    customer: { value: "미래모터스", confidence: 0.99 },
    item: { value: "브레이크 센서", confidence: 0.7 },
    amount: { value: 14000000, confidence: 0.55 },
  },
];

// 각 작업(task)이 현재 어떤 상태인지 계산한다.
type TaskState = "pending" | "processing" | "done" | "warning";

function taskStateOf(taskIndex: number, stepIndex: number): TaskState {
  const current = STEPS[stepIndex];

  // 지금 진행 중인 상태가 바로 이 작업을 가리키면 그 phase를 그대로 쓴다.
  if (current.task === taskIndex) {
    return current.phase;
  }

  // 이 작업의 마지막(완료) 상태가 이미 지나갔으면 완료된 것으로 본다.
  let finalIndex = -1;
  for (let i = 0; i < STEPS.length; i += 1) {
    if (STEPS[i].task === taskIndex) finalIndex = i;
  }
  if (stepIndex > finalIndex) {
    return STEPS[finalIndex].phase; // "done" 또는 "warning"
  }

  // 아직 도달하지 않은 작업
  return "pending";
}

export default function ProcessingPage() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    // 상태를 일정 간격으로 다음 단계로 넘긴다.
    const timer = setInterval(() => {
      setStepIndex((prev) => {
        if (prev >= STEPS.length - 1) {
          clearInterval(timer);
          return prev;
        }
        return prev + 1;
      });
    }, STEP_MS);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // 마지막 "분석 완료" 상태에 도달하면 합성 결과를 저장하고
    // 잠시 뒤 자동으로 /review 화면으로 이동한다.
    if (stepIndex < STEPS.length - 1) return;

    sessionStorage.setItem(
      "boimAnalysisResult",
      JSON.stringify(SYNTHETIC_RESULT),
    );

    const timer = setTimeout(() => {
      router.push("/review");
    }, FINISH_HOLD_MS);

    return () => clearTimeout(timer);
  }, [stepIndex, router]);

  const current = STEPS[stepIndex];
  const isFinished = stepIndex >= STEPS.length - 1;
  // 진행률: 마지막 단계에서 100%가 되도록 계산한다.
  const progress = Math.round(((stepIndex + 1) / STEPS.length) * 100);

  return (
    <div className="flex flex-1 flex-col bg-slate-50 px-4 pb-16 pt-10">
      <div className="mx-auto w-full max-w-md">
        <main className="flex flex-col gap-3 text-center sm:text-left">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">
            <span className="h-px w-6 bg-zinc-900" aria-hidden="true" />
            STEP 3.5
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            내부 문서 분석 중
          </h1>
          <p className="text-base leading-7 text-zinc-500">
            업로드한 문서를 순서대로 확인하고 있습니다.
            <br />
            분석이 끝나면 자동으로 결과 확인 화면으로 이동합니다.
          </p>
        </main>

        {/* 현재 진행 상태 배너 */}
        <div className="mt-8 flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-6">
          {isFinished ? (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <IconCheck className="h-5 w-5" />
            </span>
          ) : current.phase === "warning" ? (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <IconWarning className="h-5 w-5" />
            </span>
          ) : (
            <span
              aria-hidden
              className="h-10 w-10 shrink-0 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-900"
            />
          )}
          <div className="min-w-0">
            <p className="text-lg font-bold text-zinc-900">{current.text}</p>
            <p className="mt-0.5 text-sm text-zinc-500">
              {isFinished
                ? "곧 결과 확인 화면으로 이동합니다."
                : "잠시만 기다려 주세요."}
            </p>
          </div>
        </div>

        {/* 진행률 바 */}
        <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-6">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm text-zinc-500">진행률</span>
            <span className="text-base font-semibold text-zinc-900">
              {progress}%
            </span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full rounded-full bg-zinc-900 transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* 항목별 체크리스트 */}
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-6">
          {TASKS.map((task, index) => {
            const state = taskStateOf(index, stepIndex);
            const isCurrent = current.task === index && !isFinished;

            return (
              <div
                key={task}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-colors ${
                  isCurrent ? "bg-zinc-100" : "bg-transparent"
                }`}
              >
                {/* 상태 아이콘 */}
                {state === "processing" && (
                  <span
                    aria-hidden
                    className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900"
                  />
                )}
                {state === "done" && (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <IconCheck className="h-3 w-3" />
                  </span>
                )}
                {state === "warning" && (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-600">
                    !
                  </span>
                )}
                {state === "pending" && (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-zinc-200 text-[11px] font-semibold text-zinc-400">
                    {index + 1}
                  </span>
                )}

                <span
                  className={`text-sm font-medium ${
                    state === "pending"
                      ? "text-zinc-400"
                      : state === "warning"
                        ? "text-amber-700"
                        : isCurrent
                          ? "text-zinc-900"
                          : "text-zinc-800"
                  }`}
                >
                  {task}
                </span>

                {/* 신뢰도 낮은 항목 안내 */}
                {state === "warning" && (
                  <span className="ml-auto text-xs font-semibold text-amber-600">
                    신뢰도 낮은 항목 발견
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-center text-xs leading-5 text-zinc-400">
          현재 시연 버전에서는 실제 문서를 분석하지 않으며, 진행 상태는 모두
          예시(합성) 데이터입니다.
        </p>
      </div>
    </div>
  );
}
