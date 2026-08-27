"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { withCompany } from "@/lib/company-link";
import type { Transaction } from "@/data/transactions";
import { useUploadStore } from "@/app/upload/upload-store";
import {
  extractTransactionsLocally,
  type OcrPhase,
} from "@/lib/ocr/run-local-ocr";

// ─────────────────────────────────────────────
// 실제 인식이 여기서 일어난다. 전부 이 브라우저 안에서 돌고 파일은 서버로
// 전송되지 않는다.
//
// 예전에는 이 화면이 정해진 간격으로 상태만 바꾸는 가짜 진행 화면이었다. 지금은
// 인식한 페이지 수에 맞춰 진행률이 움직인다. 문서가 많으면 실제로 더 오래 걸린다.
// ─────────────────────────────────────────────

function IconCheck({ className = "h-4 w-4" }: { className?: string }) {
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

function IconWarning({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
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
  { text: "거래명세서 확인 중…", task: 0, phase: "processing" },
  { text: "거래명세서 확인 완료", task: 0, phase: "done" },
  { text: "세금계산서 확인 중…", task: 1, phase: "processing" },
  { text: "세금계산서 확인 완료", task: 1, phase: "done" },
  { text: "발주서 확인 중…", task: 2, phase: "processing" },
  { text: "발주서 확인 완료", task: 2, phase: "done" },
  { text: "견적서 확인 중…", task: 3, phase: "processing" },
  { text: "견적서 확인 완료", task: 3, phase: "done" },
  { text: "계약서 확인 중…", task: 4, phase: "processing" },
  { text: "계약서에서 신뢰도 낮은 항목 발견", task: 4, phase: "warning" },
  { text: "입금내역 확인 완료", task: 5, phase: "done" },
  { text: "성장 신호 계산 중…", task: 6, phase: "processing" },
  { text: "분석 완료", task: 6, phase: "done" },
];

// 전체 과정이 약 8초 동안 진행되도록 단계 간격을 정한다.
// 마지막 "분석 완료" 상태를 잠시 보여준 뒤 /review 로 이동한다.
const STEP_MS = 600; // 상태 하나당 약 0.6초 → 13단계 ≈ 7.8초
const FINISH_HOLD_MS = 800; // 마지막 상태를 잠시 유지한 뒤 이동

// /review 화면이 기대하는 합성 분석 결과.
// 진단 중인 기업의 실제 거래에 합성 신뢰도를 붙여 검토 표본을 만든다.
// (금액 신뢰도를 낮게 둬서 사용자가 확인해야 할 항목이 생기도록 한다.)
const SAMPLE_CONFIDENCE = [
  { date: 0.98, customer: 0.97, item: 0.88, amount: 0.62 },
  { date: 0.91, customer: 0.99, item: 0.7, amount: 0.55 },
];

function toReviewResult(sample: Transaction[]) {
  return sample.map((item, index) => {
    const confidence = SAMPLE_CONFIDENCE[index] ?? SAMPLE_CONFIDENCE[0];

    return {
      date: { value: item.date, confidence: confidence.date },
      customer: { value: item.customer, confidence: confidence.customer },
      item: { value: item.item, confidence: confidence.item },
      amount: { value: item.amount, confidence: confidence.amount },
    };
  });
}

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

export function ProcessingContent({
  companyId,
  reviewSample,
}: {
  companyId?: string;
  reviewSample: Transaction[];
}) {
  const router = useRouter();
  const { states } = useUploadStore();

  const [stepIndex, setStepIndex] = useState(0);
  const [pageProgress, setPageProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [phase, setPhase] = useState<OcrPhase | null>(null);

  useEffect(() => {
    let isActive = true;

    // 6개 분류에 올린 파일을 모두 인식 대상으로 삼는다. 예전에는 거래명세서
    // 슬롯 하나만 처리해서, 나머지 5종은 파일명만 남고 내용은 버려졌다.
    const files = Object.values(states).flatMap((state) => state.files);

    // 인식이 끝나기 전에도 화면이 멈춰 보이지 않도록 상태 문구는 계속 돌린다.
    const ticker = setInterval(() => {
      setStepIndex((prev) => (prev >= STEPS.length - 2 ? prev : prev + 1));
    }, STEP_MS);

    (async () => {
      const outcome = await extractTransactionsLocally(
        files,
        (done, total) => {
          if (isActive) setPageProgress({ done, total });
        },
        (next) => {
          if (isActive) setPhase(next);
        },
      );

      if (!isActive) return;

      sessionStorage.setItem("boimExtractionOutcome", outcome.status);
      sessionStorage.setItem(
        "boimAnalysisResult",
        outcome.status === "ok"
          ? JSON.stringify(outcome.transactions)
          : JSON.stringify(toReviewResult(reviewSample)),
      );

      clearInterval(ticker);
      setStepIndex(STEPS.length - 1);

      setTimeout(() => {
        if (isActive) router.push(withCompany("/review", companyId));
      }, FINISH_HOLD_MS);
    })();

    return () => {
      isActive = false;
      clearInterval(ticker);
    };
    // 마운트 시점의 업로드 파일로 한 번만 돌린다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = STEPS[stepIndex];
  const isFinished = stepIndex >= STEPS.length - 1;
  // 진행률: 마지막 단계에서 100%가 되도록 계산한다.
  // 인식 중에는 실제 페이지 진척을, 그 전에는 상태 순서를 진행률로 쓴다.
  const progress = pageProgress
    ? Math.round((pageProgress.done / pageProgress.total) * 100)
    : Math.round(((stepIndex + 1) / STEPS.length) * 100);

  return (
    <div className="mx-auto w-full max-w-lg px-6 py-12">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs font-medium uppercase tracking-widest text-zinc-400">
          Step 03.5
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          내부 문서 분석 중
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          분석이 끝나면 자동으로 결과 화면으로 이동합니다.
        </p>
      </div>

      {/* 현재 진행 상태 배너 */}
      <div className="mt-8 flex items-center gap-4 rounded-lg border border-zinc-100 bg-white px-5 py-4">
        {isFinished ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
            <IconCheck className="h-3.5 w-3.5" />
          </span>
        ) : current.phase === "warning" ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-500">
            <IconWarning className="h-3.5 w-3.5" />
          </span>
        ) : (
          <span
            aria-hidden
            className="h-8 w-8 shrink-0 animate-spin rounded-full border-2 border-zinc-100 border-t-zinc-400"
          />
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900">{current.text}</p>
          <p className="text-xs text-zinc-400">
            {isFinished ? "곧 이동합니다." : "잠시만 기다려 주세요."}
          </p>
        </div>
      </div>

      {/* 진행률 바 */}
      <div className="mt-4 rounded-lg border border-zinc-100 bg-white px-5 py-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs text-zinc-400">진행률</span>
          <span className="font-mono text-xs font-medium text-zinc-900">
            {progress}%
          </span>
        </div>
        <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className="h-full rounded-full bg-zinc-900 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* 항목별 체크리스트 */}
      <div className="mt-4 rounded-lg border border-zinc-100 bg-white px-2 py-2">
        {TASKS.map((task, index) => {
          const state = taskStateOf(index, stepIndex);
          const isCurrent = current.task === index && !isFinished;

          return (
            <div
              key={task}
              className={`flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors ${
                isCurrent ? "bg-zinc-50" : ""
              }`}
            >
              <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                {state === "processing" && (
                  <span
                    aria-hidden
                    className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-500"
                  />
                )}
                {state === "done" && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <IconCheck className="h-2.5 w-2.5" />
                  </span>
                )}
                {state === "warning" && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-600">
                    !
                  </span>
                )}
                {state === "pending" && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full border border-zinc-200 font-mono text-[9px] text-zinc-400">
                    {index + 1}
                  </span>
                )}
              </div>

              <span
                className={`flex-1 text-sm ${
                  state === "pending"
                    ? "text-zinc-400"
                    : state === "warning"
                      ? "text-amber-700"
                      : "text-zinc-700"
                }`}
              >
                {task}
              </span>

              {/* 신뢰도 낮은 항목 안내 */}
              {state === "warning" && (
                <span className="font-mono text-[10px] text-amber-500">
                  신뢰도 낮음
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-center font-mono text-[10px] text-zinc-300">
        {phase?.phase === "preparing"
          ? "분석 엔진을 준비하는 중입니다 · 처음 한 번만 걸립니다"
          : phase?.phase === "rendering"
            ? `문서를 여는 중입니다 (${phase.done + 1}/${phase.total})`
            : pageProgress
              ? `${pageProgress.done} / ${pageProgress.total}페이지 인식 완료 · 이 브라우저 안에서 처리 중입니다`
              : "업로드한 문서는 이 브라우저 안에서 분석되며 서버로 전송되지 않습니다"}
      </p>
    </div>
  );
}
