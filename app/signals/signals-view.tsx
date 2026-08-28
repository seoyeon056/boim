"use client";

import { useEffect, useState } from "react";
import type { Signals } from "@/lib/signals";
import { readUploadedSignals } from "@/lib/uploaded-signals";
import { describePaymentTerms, readDocumentTerms } from "@/lib/document-terms";
import { grantAiConsent } from "@/lib/ai-consent";
import { restoreCustomerName } from "@/lib/llm/customer-mask";
import { josa } from "@/lib/korean";
import { SignalsEvidence } from "./signals-evidence";
import { MetricCards, type MetricCardData } from "./metric-cards";
import { LoadingSteps } from "@/app/loading-steps";
import { GradeBadge } from "@/app/grade-badge";
import { gradeFromSignals } from "@/lib/diagnosis";

const statusLabel = {
  positive: "긍정",
  neutral: "보통",
  caution: "주의",
};

const AI_STEPS = [
  "지표를 정리하는 중",
  "거래처명을 가리고 비율만 추리는 중",
  "AI 가 해석을 쓰는 중",
];

// 규칙 기반 해석. LLM을 부르지 않는 기본 상태에서 쓴다.
//
// 세 지표를 나열하지 않고, 가장 눈에 띄는 것 하나를 골라 그게 무엇을 뜻하는지와
// 무엇을 해야 하는지를 두 문장으로 쓴다. 사람이 읽고 다음 행동을 정할 수 있어야
// 문장이 값을 한다.
function pickNotable(signals: Signals): string {
  const caution = signals.signals.find((item) => item.tone === "caution");

  // 주의 신호가 있으면 그것부터 말한다. 좋은 소식보다 먼저 알아야 할 일이다.
  if (caution) {
    const action =
      caution.key === "concentration"
        ? "이 거래처와의 계약 조건과 갱신 시점을 확인해 두시면, 비중이 더 오를 때 대응할 여지가 생깁니다."
        : caution.key === "continuity"
          ? "거래가 끊긴 달에 무슨 일이 있었는지 먼저 확인해 보시면 좋습니다."
          : caution.key === "trend"
            ? "최근 달에 무엇이 줄었는지 품목별로 짚어 보시는 편이 좋습니다."
            : caution.key === "repeatRate"
              ? "첫 거래 이후의 후속 접점을 만들어 두실 필요가 있습니다."
              : "이번 기간에 거래가 끊긴 곳이 있었는지 살펴보시는 편이 좋습니다.";

    return `${josa(caution.label, "이/가")} ${caution.prefix}${caution.value}${caution.suffix}로 ${caution.note}에 해당합니다. ${action}`;
  }

  // 주의가 없으면 가장 뚜렷한 긍정을 짚는다.
  const best = signals.signals.find((item) => item.tone === "positive");
  if (best) {
    return `${best.label} ${best.prefix}${best.value}${best.suffix}로 ${best.note}가 확인됩니다. 이 흐름이 다음 기간에도 이어지는지 같은 기준으로 다시 재보시면 좋습니다.`;
  }

  return "여섯 지표 모두 뚜렷한 방향이 확인되지 않습니다. 거래 기록이 더 쌓인 뒤에 다시 보시는 편이 정확합니다.";
}

export function SignalsView({ serverSignals }: { serverSignals: Signals }) {
  // 서버는 sessionStorage를 못 본다. 업로드·검수한 거래가 있으면 그걸 우선한다.
  const [signals, setSignals] = useState<Signals>(serverSignals);
  const [fromUpload, setFromUpload] = useState(false);
  const [transactionCount, setTransactionCount] = useState(0);
  // 결제조건은 거래 건수·금액에 잡히지 않는 정보라 따로 읽어 덧붙인다.
  const [paymentNote, setPaymentNote] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [aiState, setAiState] = useState<"idle" | "loading" | "failed">("idle");

  useEffect(() => {
    const terms = readDocumentTerms();
    if (terms) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPaymentNote(describePaymentTerms(terms));
    }

    const uploaded = readUploadedSignals("");
    if (!uploaded) return;
     
    setSignals(uploaded.signals);
     
    setFromUpload(true);
     
    setTransactionCount(uploaded.transactionCount);
  }, []);

  async function requestAiNotice() {
    // 여기서 한 번 동의하면 리포트에서 다시 묻지 않는다.
    grantAiConsent();
    setAiState("loading");
    try {
      // 거래처명은 보내지 않는다. 비율 숫자만 나가고, 응답의 마스킹 라벨을
      // 여기서 실명으로 되돌린다.
      const response = await fetch("/api/signals-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionCount,
          positiveCount: signals.positiveCount,
          cautionCount: signals.cautionCount,
          activityLevel: signals.activityLevel,
          // 판정까지 코드가 끝낸 결과만 보낸다. 거래처명은 담지 않는다.
          signals: signals.signals.map((item) => ({
            label: item.label,
            value: item.value,
            tone: statusLabel[item.tone],
            note: item.note,
          })),
        }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const { insight } = (await response.json()) as { insight: string };
      setAiNotice(restoreCustomerName(insight, signals.topCustomerName));
      setAiState("idle");
    } catch {
      setAiState("failed");
    }
  }

  const risky = signals.statuses.topCustomerConcentration === "caution";

  // 지표 정의는 lib/signals.ts 가 갖는다. 화면은 계산 결과를 그리기만 한다.
  const metrics: MetricCardData[] = signals.signals.map((item) => ({
    label: item.label,
    target: item.value,
    prefix: item.prefix,
    suffix: item.suffix,
    description: item.detail,
    status: statusLabel[item.tone],
    tone: item.tone,
  }));

  // 등급은 세 지표의 긍정 개수로 정해지므로 이 화면에서도 그대로 보여준다.
  const grade = gradeFromSignals(signals);

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-4">
        <span className="text-[11px] text-zinc-400">
          내부 거래에서 확인한 지표
        </span>
        <GradeBadge grade={grade} />
      </div>

      <MetricCards metrics={metrics} />

      {/* 여섯 신호를 세어 한 줄로 요약한다. LLM이 아니라 규칙이 정한 결론이다. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-zinc-100 bg-zinc-50 px-4 py-3">
        <span className="text-[13px] text-zinc-500">
          긍정 신호{" "}
          <span className="font-mono font-semibold text-emerald-600">
            {signals.positiveCount}개
          </span>
        </span>
        <span className="text-[13px] text-zinc-500">
          주의 신호{" "}
          <span className="font-mono font-semibold text-amber-600">
            {signals.cautionCount}개
          </span>
        </span>
        <span className="text-[13px] font-semibold text-zinc-900">
          → 내부 거래 활동: {signals.activityLevel}
        </span>
      </div>

      {/* 이 수치가 어디서 나왔는지 밝힌다. 예전에는 예시 데이터가 실제 분석
          결과인 것처럼 보였다. */}
      <p className="mt-2 text-[11px] leading-5 text-zinc-400">
        {fromUpload
          ? "제출한 문서에서 확인된 거래를 근거로 산출한 수치입니다."
          : "제출한 문서에서 거래 내역을 확인하지 못해 예시 데이터로 산출한 수치입니다."}
      </p>

      <p
        className="mt-3 max-w-3xl text-[13px] leading-6"
        style={{ color: risky ? "#8A4A2E" : "#736861" }}
      >
        {aiNotice ?? pickNotable(signals)}
      </p>

      {/* 문서에서 읽어낸 결제조건. 브라우저 안에서만 계산되고 전송되지 않는다. */}
      {paymentNote && (
        <p className="mt-2 max-w-3xl text-[12px] leading-6 text-zinc-500">
          {paymentNote}
        </p>
      )}

      {/*
        AI 해석은 기본으로 부르지 않는다. 이 수치는 사용자가 올린 문서에서 나온
        값이라, 외부 모델로 보낼지를 사용자가 정하게 한다. 보내는 것은 비율
        숫자뿐이고 거래처명은 브라우저를 벗어나지 않는다.
      */}
      {!aiNotice && aiState === "loading" && (
        <div className="mt-2 max-w-md">
          <LoadingSteps title="AI 해석을 받는 중" steps={AI_STEPS} />
        </div>
      )}

      {!aiNotice && aiState !== "loading" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={requestAiNotice}
            className="inline-flex h-8 items-center rounded-md border border-zinc-200 px-3 text-[12px] text-zinc-600 transition-colors hover:bg-zinc-50"
          >
            AI 해석 받기
          </button>
          <span className="text-[11px] text-zinc-400">
            {aiState === "failed"
              ? "해석을 받지 못했습니다. 위 문장은 규칙 기반입니다."
              : "누르면 위 비율 수치가 외부 AI로 전송됩니다. 기업명·거래처명·문서는 전송되지 않지만, 비율 자체도 이 기업의 영업 정보입니다."}
          </span>
        </div>
      )}

      <SignalsEvidence
        customerCount={signals.customerCount}
        previousCustomersCount={signals.previousCustomersCount}
        repeatPurchaseRate={signals.repeatPurchaseRate}
      />

    </>
  );
}
