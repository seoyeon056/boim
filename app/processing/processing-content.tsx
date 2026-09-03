"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { withCompany } from "@/lib/company-link";
import { useUploadStore } from "@/app/upload/upload-store";
import {
  extractTransactionsLocally,
  SETTLEMENT_CATEGORIES,
  TRANSACTION_CATEGORIES,
} from "@/lib/ocr/run-local-ocr";

// ─────────────────────────────────────────────
// 실제 인식이 여기서 일어난다. 전부 이 브라우저 안에서 돌고 파일은 서버로
// 전송되지 않는다.
//
// 진행률은 최소 시간(MIN_RUN_MS) 동안 자연스럽게 차오르다가, 실제 인식이
// 끝나 있으면 100 으로 마무리한다. 문서가 많아 인식이 더 걸리면 그만큼 기다린다.
// 단계 문구는 진행률 구간에서 파생된다(stageFromProgress).
//
// 추출이 실패하거나 거래를 한 건도 못 찾으면 예시 데이터로 대체하지 않는다.
// 결과를 비운 채 넘겨서 다음 화면이 "산정 불가"로 처리하게 한다.
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
// CRUISE_CAP 에서 100 까지 달려가는 데 쓰는 시간.
const FINISH_MS = 700;
// 마지막(분석 완료) 상태를 잠깐 보여준 뒤 /review 로 이동한다.
const FINISH_HOLD_MS = 900;

// 시작과 끝을 부드럽게. 0~1 을 받아 0~1 을 돌려준다.
function easeInOutSine(t: number): number {
  return 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, t)));
}

// 검수 대상은 실제 신뢰도로만 정한다. 예전에는 앞 다섯 줄의 필드 하나씩을
// 0.80~0.95 로 낮춰 "확인 권장"을 만들었는데, 그 보정이 추출에 성공한 모든
// 경우에 걸려 실제 기업 문서에도 임의 항목이 찍혔다. 지금은 조작을 걷어내고,
// 묶기가 추측인 경로(PDF 텍스트 레이어)의 신뢰도만 사실대로 낮춰서 진짜
// 의심스러운 값이 검수에 걸리게 했다. lib/ocr/pdf-text.ts 의 TEXT_LAYER_CONFIDENCE 참고.
//
// 추출이 실패하거나 거래를 한 건도 못 찾으면 예시 데이터로 대체하지 않는다.
// 결과를 비운 채 넘겨 다음 화면이 "산정 불가"로 처리하게 한다.

export function ProcessingContent({
  companyId,
}: {
  companyId?: string;
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
    const timers: number[] = [];
    const start = performance.now();
    // 실제 인식이 끝난 시각. 0 이면 아직 진행 중.
    let workDoneAt = 0;
    // 100 까지 달려가기 시작한 시각. 0 이면 아직 순항 중.
    let finishFrom = 0;
    let stageNow: Stage = "reading";

    // 매출을 증명하는 문서(거래명세서·세금계산서)만 거래로 인식한다.
    // 입금내역은 입금 확인용이라 별도 경로로 건수만 센다.
    const files = TRANSACTION_CATEGORIES.flatMap(
      (category) => states[category]?.files ?? [],
    );
    const settlementFiles = SETTLEMENT_CATEGORIES.flatMap(
      (category) => states[category]?.files ?? [],
    );

    // 진행률은 프레임마다 더하지 않고 경과 시간만으로 계산한다.
    //
    // 예전에는 프레임마다 조금씩 더해 나갔다. 그런데 브라우저는 탭이 화면에서
    // 벗어나면 requestAnimationFrame 을 멈춘다. 그래서 인식을 기다리는 동안
    // 다른 탭을 보고 오면 그동안의 진행이 통째로 사라졌다. 실제로 인식은 이미
    // 끝났는데(sessionStorage 에 결과까지 들어 있는데) 화면만 72% 에 멈춰
    // 다음 단계로 넘어가지 않는 일이 배포본에서 재현됐다.
    //
    // 시각의 함수로 두면 프레임을 몇 번 걸렀는지와 무관하게 값이 정해진다.
    // 화면이 돌아왔을 때 있어야 할 자리로 바로 따라잡는다.
    function cruiseAt(now: number): number {
      return CRUISE_CAP * easeInOutSine((now - start) / MIN_RUN_MS);
    }

    function progressAt(now: number): number {
      if (finishFrom === 0) {
        return cruiseAt(now);
      }
      const cruise = cruiseAt(finishFrom);
      const ratio = (now - finishFrom) / FINISH_MS;
      return cruise + (100 - cruise) * easeInOutSine(ratio);
    }

    // 인식이 끝났고 최소 시간도 지났으면 마무리 구간을 연다.
    //
    // 이동 시각은 진행률이 아니라 타이머로 잡는다. 타이머는 탭이 숨어 있으면
    // 느려질 뿐 결국 실행되므로, 화면이 안 보이는 동안 인식이 끝나도 흐름이
    // 멈추지 않는다. 진행률에 걸어 두면 프레임이 오지 않는 동안 영영 멈춘다.
    function scheduleFinish() {
      if (finishFrom > 0 || workDoneAt === 0) {
        return;
      }

      const wait = Math.max(0, start + MIN_RUN_MS - performance.now());

      timers.push(
        window.setTimeout(() => {
          if (!isActive) {
            return;
          }
          finishFrom = performance.now();

          timers.push(
            window.setTimeout(() => {
              if (isActive) {
                router.push(withCompany("/review", companyId));
              }
            }, FINISH_MS + FINISH_HOLD_MS),
          );
        }, wait),
      );
    }

    // 실제 인식은 뒤에서 계속 돈다. 페이지 카운트만 받아 둔다.
    extractTransactionsLocally(
      files,
      undefined,
      (next) => {
        if (!isActive || next.phase === "preparing") return;
        setStep({ done: next.done, total: Math.max(1, next.total) });
      },
      settlementFiles,
    ).then((outcome) => {
      if (!isActive) return;

      sessionStorage.setItem("boimExtractionOutcome", outcome.status);

      if (outcome.status === "ok") {
        sessionStorage.setItem(
          "boimAnalysisResult",
          JSON.stringify(outcome.transactions),
        );
        sessionStorage.setItem(
          "boimDocumentTerms",
          JSON.stringify(outcome.terms),
        );
        if (outcome.settlement) {
          sessionStorage.setItem(
            "boimSettlement",
            JSON.stringify(outcome.settlement),
          );
        } else {
          sessionStorage.removeItem("boimSettlement");
        }
      } else {
        // 예시 데이터로 대체하지 않는다. 결과를 비워 다음 화면이 산정 불가로 처리한다.
        sessionStorage.removeItem("boimAnalysisResult");
        sessionStorage.removeItem("boimDocumentTerms");
        sessionStorage.removeItem("boimSettlement");
      }

      workDoneAt = performance.now();
      scheduleFinish();
    });

    // 프레임 루프는 그리기만 한다. 흐름을 진행시키는 책임은 없다.
    function frame(now: number) {
      if (!isActive) return;

      const value = Math.min(100, progressAt(now));
      setDisplayProgress(value);

      const nextStage = stageFromProgress(value);
      if (nextStage !== stageNow) {
        stageNow = nextStage;
        setStage(nextStage);
      }

      if (value >= 100) {
        return;
      }

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      isActive = false;
      cancelAnimationFrame(raf);
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
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
