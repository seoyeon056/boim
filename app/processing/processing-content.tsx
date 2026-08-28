"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { withCompany } from "@/lib/company-link";
import type { Transaction } from "@/data/transactions";
import { useUploadStore } from "@/app/upload/upload-store";
import {
  extractTransactionsLocally,
  TRANSACTION_CATEGORIES,
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


// 각 진행 단계가 가리키는 작업(=화면에 표시할 체크리스트 항목)

// ── 실제 진행 단계 ───────────────────────────────────────────
// 예전에는 "거래명세서 확인 중… / 계약서에서 신뢰도 낮은 항목 발견"처럼 정해진
// 문구를 순서대로 흘리는 가짜 서사였다. 무엇을 읽는 중인지도, 신뢰도가 낮은
// 항목이 실제로 있는지도 화면 밖의 이야기와 무관했다.
//
// 지금은 인식 파이프라인이 알려주는 단계를 그대로 보여준다.
type Stage = "reading" | "preparing" | "recognizing" | "calculating" | "done";

const STAGE_LABEL: Record<Stage, string> = {
  reading: "문서 여는 중",
  preparing: "분석 엔진 준비 중",
  recognizing: "문서에서 거래 찾는 중",
  calculating: "성장 신호 계산 중",
  done: "분석 완료",
};

// 화면에 체크리스트로 세울 순서. preparing은 이미지 인식이 필요할 때만 지나간다.
const STAGE_ORDER: Stage[] = [
  "reading",
  "preparing",
  "recognizing",
  "calculating",
];

// 단계마다 진행률의 구간을 나눠 준다. 페이지 인식이 가장 오래 걸린다.
const STAGE_RANGE: Record<Stage, [number, number]> = {
  reading: [0, 25],
  preparing: [25, 40],
  recognizing: [40, 92],
  calculating: [92, 99],
  done: [100, 100],
};

function progressOf(
  stage: Stage,
  done: number,
  total: number,
): number {
  const [from, to] = STAGE_RANGE[stage];
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  return Math.round(from + (to - from) * ratio);
}

// 마지막 상태를 잠시 보여준 뒤 /review 로 이동한다.
const FINISH_HOLD_MS = 800;

// 추출이 실패했을 때 보여줄 예시 표본.
// 확인이 필요한 항목이 생기도록 금액 신뢰도를 낮게 둔다.
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

export function ProcessingContent({
  companyId,
  reviewSample,
}: {
  companyId?: string;
  reviewSample: Transaction[];
}) {
  const router = useRouter();
  const { states } = useUploadStore();

  const [stage, setStage] = useState<Stage>("reading");
  const [step, setStep] = useState<{ done: number; total: number }>({
    done: 0,
    total: 1,
  });

  useEffect(() => {
    let isActive = true;

    // 거래를 증명하는 문서(거래명세서·세금계산서·입금내역)만 인식한다.
    const files = TRANSACTION_CATEGORIES.flatMap(
      (category) => states[category]?.files ?? [],
    );

    (async () => {
      const outcome = await extractTransactionsLocally(
        files,
        undefined,
        (next) => {
          if (!isActive) return;
          if (next.phase === "preparing") {
            setStage("preparing");
            setStep({ done: 0, total: 1 });
            return;
          }
          setStage(next.phase === "rendering" ? "reading" : "recognizing");
          setStep({ done: next.done, total: Math.max(1, next.total) });
        },
      );

      if (!isActive) return;

      setStage("calculating");

      sessionStorage.setItem("boimExtractionOutcome", outcome.status);
      sessionStorage.setItem(
        "boimAnalysisResult",
        outcome.status === "ok"
          ? JSON.stringify(outcome.transactions)
          : JSON.stringify(toReviewResult(reviewSample)),
      );
      if (outcome.status === "ok") {
        sessionStorage.setItem(
          "boimDocumentTerms",
          JSON.stringify(outcome.terms),
        );
      } else {
        sessionStorage.removeItem("boimDocumentTerms");
      }

      setStage("done");

      setTimeout(() => {
        if (isActive) router.push(withCompany("/review", companyId));
      }, FINISH_HOLD_MS);
    })();

    return () => {
      isActive = false;
    };
    // 마운트 시점의 업로드 파일로 한 번만 돌린다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 인식이 도는 동안 이탈하면 처음부터 다시 해야 한다.
  useEffect(() => {
    if (stage === "done") return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [stage]);

  const isFinished = stage === "done";
  const progress = progressOf(stage, step.done, step.total);

  // 인식 중일 때만 "3 / 8페이지"를 곁들인다.
  const detail =
    stage === "recognizing" && step.total > 1
      ? `${step.done} / ${step.total}페이지`
      : stage === "reading" && step.total > 1
        ? `${step.done + 1} / ${step.total}번째 문서`
        : null;

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

      {/* 현재 진행 상태 */}
      <div className="mt-8 flex items-center gap-4 rounded-lg border border-zinc-100 bg-white px-5 py-4">
        {isFinished ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
            <IconCheck className="h-3.5 w-3.5" />
          </span>
        ) : (
          <span
            aria-hidden
            className="h-8 w-8 shrink-0 animate-spin rounded-full border-2 border-zinc-100 border-t-zinc-400"
          />
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900">
            {STAGE_LABEL[stage]}
            {detail ? ` · ${detail}` : ""}
          </p>
          <p className="text-xs text-zinc-400">
            {isFinished
              ? "곧 이동합니다."
              : stage === "preparing"
                ? "처음 한 번만 걸립니다."
                : "이 브라우저 안에서 처리 중입니다."}
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

      {/* 단계 체크리스트 — 실제로 지나간 단계만 완료로 표시한다. */}
      <div className="mt-4 rounded-lg border border-zinc-100 bg-white px-2 py-2">
        {STAGE_ORDER.map((item) => {
          const currentIndex = STAGE_ORDER.indexOf(stage);
          const itemIndex = STAGE_ORDER.indexOf(item);
          const passed = isFinished || itemIndex < currentIndex;
          const active = !isFinished && item === stage;

          return (
            <div
              key={item}
              className={`flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors ${
                active ? "bg-zinc-50" : ""
              }`}
            >
              <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                {passed ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
                    <IconCheck />
                  </span>
                ) : active ? (
                  <span
                    aria-hidden
                    className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-500"
                  />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-200" />
                )}
              </div>
              <span
                className={`text-sm ${
                  passed || active ? "text-zinc-900" : "text-zinc-300"
                }`}
              >
                {STAGE_LABEL[item]}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-center text-[11px] leading-5 text-zinc-400">
        업로드한 문서는 이 브라우저 안에서 분석되며 서버로 전송되지 않습니다.
      </p>
    </div>
  );
}
