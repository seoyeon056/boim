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
import type { ExtractedTransactionRow } from "@/lib/ocr/types";

// ─────────────────────────────────────────────
// 실제 인식이 여기서 일어난다. 전부 이 브라우저 안에서 돌고 파일은 서버로
// 전송되지 않는다.
//
// 진행률은 최소 시간(MIN_RUN_MS) 동안 자연스럽게 차오르다가, 실제 인식이
// 끝나 있으면 100 으로 마무리한다. 문서가 많아 인식이 더 걸리면 그만큼 기다린다.
// 단계 문구는 진행률 구간에서 파생된다(stageFromProgress).
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

// 진행률 하나가 화면 전체를 몬다. 단계는 진행률 구간에서 파생된다.
function stageFromProgress(p: number): Stage {
  if (p >= 100) return "done";
  if (p < 20) return "reading";
  if (p < 42) return "preparing";
  if (p < 90) return "recognizing";
  return "calculating";
}

// 표본이 작으면 실제 인식은 순식간이라 "뭔가 돌아간다"고 느낄 틈이 없다.
// 실제 작업과 별개로 최소 이 시간 동안 진행률이 차오르고, 그 뒤 실제 작업까지
// 끝나 있으면 100 으로 마무리한다. 문서가 많아 더 오래 걸리면 그만큼 기다린다.
const MIN_RUN_MS = 4800;
// 실제 작업이 아직이면 여기서 숨을 고르며 대기한다.
const CRUISE_CAP = 93;
// 마지막(분석 완료) 상태를 잠깐 보여준 뒤 /review 로 이동한다.
const FINISH_HOLD_MS = 900;

// 시작과 끝을 부드럽게. 0~1 을 받아 0~1 을 돌려준다.
function easeInOutSine(t: number): number {
  return 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, t)));
}

// 추출이 실패했을 때 보여줄 예시 표본.
// 다섯 줄 모두 필드 하나씩만 0.80~0.95 구간(="확인 권장")에 둔다. 줄마다
// "확인 1"이 떠서 검수할 게 다섯 줄 나온다. 0.80 미만(=빨강 "확인 필요")은 없다.
const SAMPLE_CONFIDENCE = [
  { date: 0.99, customer: 0.98, item: 0.88, amount: 0.98 },
  { date: 0.99, customer: 0.98, item: 0.98, amount: 0.86 },
  { date: 0.99, customer: 0.9, item: 0.98, amount: 0.98 },
  { date: 0.91, customer: 0.98, item: 0.98, amount: 0.98 },
  { date: 0.99, customer: 0.98, item: 0.92, amount: 0.98 },
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

// 데모 보정: xlsx 표는 값을 전부 확신(신뢰도 1)으로 읽어서 검수 화면에 확인할
// 항목이 하나도 안 뜬다. 진단 흐름을 보여주려면 몇 개는 있어야 하므로, 앞
// 다섯 줄의 필드 하나씩을 확인 권장(0.80~0.95) 구간으로 낮춘다. 값은 안 바꾼다.
const DEMO_REVIEW_MARKS: {
  row: number;
  field: "date" | "customer" | "item" | "amount";
  confidence: number;
}[] = [
  { row: 0, field: "item", confidence: 0.88 },
  { row: 1, field: "amount", confidence: 0.86 },
  { row: 2, field: "customer", confidence: 0.9 },
  { row: 3, field: "date", confidence: 0.91 },
  { row: 4, field: "item", confidence: 0.92 },
];

function withDemoReviewMarks(
  rows: ExtractedTransactionRow[],
): ExtractedTransactionRow[] {
  return rows.map((tx, index) => {
    const mark = DEMO_REVIEW_MARKS.find((m) => m.row === index);
    if (!mark) return tx;

    const patched: ExtractedTransactionRow = { ...tx };
    if (mark.field === "amount") {
      patched.amount = { ...tx.amount, confidence: mark.confidence };
    } else {
      patched[mark.field] = {
        ...tx[mark.field],
        confidence: mark.confidence,
      };
    }
    return patched;
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
  const [displayProgress, setDisplayProgress] = useState(0);

  useEffect(() => {
    let isActive = true;
    let raf = 0;
    const start = performance.now();
    // 실제 인식이 끝난 시각. 0 이면 아직 진행 중.
    let workDoneAt = 0;
    let current = 0;
    let stageNow: Stage = "reading";

    // 거래를 증명하는 문서(거래명세서·세금계산서·입금내역)만 인식한다.
    const files = TRANSACTION_CATEGORIES.flatMap(
      (category) => states[category]?.files ?? [],
    );

    // 실제 인식은 뒤에서 계속 돈다. 페이지 카운트만 받아 둔다.
    extractTransactionsLocally(files, undefined, (next) => {
      if (!isActive || next.phase === "preparing") return;
      setStep({ done: next.done, total: Math.max(1, next.total) });
    }).then((outcome) => {
      if (!isActive) return;

      sessionStorage.setItem("boimExtractionOutcome", outcome.status);
      sessionStorage.setItem(
        "boimAnalysisResult",
        outcome.status === "ok"
          ? JSON.stringify(withDemoReviewMarks(outcome.transactions))
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

      workDoneAt = performance.now();
    });

    function frame(now: number) {
      if (!isActive) return;
      const elapsed = now - start;
      const timeUp = elapsed >= MIN_RUN_MS;

      // 목표 진행률: 최소 시간 전에는 CRUISE_CAP 까지만 부드럽게 차오르고,
      // 인식도 끝나고 최소 시간도 지났으면 100 으로 마무리한다.
      const target =
        workDoneAt > 0 && timeUp
          ? 100
          : CRUISE_CAP * easeInOutSine(elapsed / MIN_RUN_MS);

      const gap = target - current;
      if (gap > 0.05) {
        const rate = target >= 100 ? 0.16 : 0.045;
        // 기계적으로 매끈하지 않게 프레임마다 조금씩 흔든다.
        const jitter = 0.7 + Math.random() * 0.6;
        current = Math.min(target, current + Math.max(0.12, gap * rate * jitter));
        setDisplayProgress(current);
      }

      const nextStage = stageFromProgress(current);
      if (nextStage !== stageNow) {
        stageNow = nextStage;
        setStage(nextStage);
      }

      if (current >= 99.9 && workDoneAt > 0) {
        setDisplayProgress(100);
        if (stageNow !== "done") {
          stageNow = "done";
          setStage("done");
        }
        window.setTimeout(() => {
          if (isActive) router.push(withCompany("/review", companyId));
        }, FINISH_HOLD_MS);
        return;
      }

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      isActive = false;
      cancelAnimationFrame(raf);
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
  const progress = Math.round(displayProgress);

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
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
          {/* rAF 루프가 프레임마다 값을 밀어 올리므로 CSS transition 은 두지
              않는다(둘이 겹치면 막대가 숫자보다 한참 뒤처진다). 막대 폭과 표시
              숫자를 같은 정수값에 묶어 항상 일치시킨다. */}
          <div
            className="h-full rounded-full bg-zinc-900"
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
