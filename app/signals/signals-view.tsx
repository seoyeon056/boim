"use client";

import { useEffect, useState } from "react";
import type { Signals } from "@/lib/signals";
import { readUploadedSignals } from "@/lib/uploaded-signals";
import { restoreCustomerName } from "@/lib/llm/customer-mask";
import { SignalsEvidence } from "./signals-evidence";
import { MetricCards, type MetricCardData } from "./metric-cards";

const statusLabel = {
  positive: "긍정",
  caution: "주의",
};

// 규칙 기반 해석. LLM을 부르지 않는 기본 상태에서 쓴다.
//
// 세 지표를 나열하지 않고, 가장 눈에 띄는 것 하나를 골라 그게 무엇을 뜻하는지와
// 무엇을 해야 하는지를 두 문장으로 쓴다. 사람이 읽고 다음 행동을 정할 수 있어야
// 문장이 값을 한다.
function pickNotable(signals: Signals): string {
  const share = signals.topCustomerConcentration;
  const name = signals.topCustomerName ?? "최대 거래처";
  const growing = signals.statuses.customerGrowthRate === "positive";
  const repeating = signals.statuses.repeatPurchaseRate === "positive";

  // 집중도가 높으면 나머지가 좋아도 이게 먼저다.
  if (share >= 70) {
    return `매출의 ${share}%가 ${name} 한 곳에서 나옵니다. 이 거래처의 사정 변화가 곧 전체 매출의 변화가 되므로, 다음 분기에 다른 판로를 확보할 계획이 있는지부터 정리해 두시는 편이 좋습니다.`;
  }

  if (share >= 40) {
    return `${name}의 비중이 ${share}%로 의존 위험 기준을 넘었습니다. 이 거래처와의 계약 조건과 갱신 시점을 확인해 두시면, 비중이 더 오를 때 대응할 여지가 생깁니다.`;
  }

  // 확보도 유지도 안 되는 상태가 그다음으로 급하다.
  if (!growing && !repeating) {
    return `거래처는 ${signals.previousCustomersCount}곳에서 ${signals.recentCustomersCount}곳으로 바뀌었고 재구매율은 ${signals.repeatPurchaseRate}%입니다. 신규 확보와 관계 유지 어느 쪽도 확인되지 않으니, 이번 기간에 거래가 끊긴 거래처가 있었는지 먼저 살펴보시는 편이 좋습니다.`;
  }

  if (growing && !repeating) {
    return `거래처는 ${signals.previousCustomersCount}곳에서 ${signals.recentCustomersCount}곳으로 늘었지만 재구매율이 ${signals.repeatPurchaseRate}%에 그칩니다. 새로 들어온 거래처가 한 번에 그치지 않도록, 첫 거래 이후의 후속 접점을 만들어 두실 필요가 있습니다.`;
  }

  if (!growing && repeating) {
    return `재구매율 ${signals.repeatPurchaseRate}%로 기존 거래처와의 관계는 이어지고 있지만, 거래처 수는 ${signals.previousCustomersCount}곳에서 ${signals.recentCustomersCount}곳으로 늘지 않았습니다. 지금의 관계 유지 역량을 신규 확보로 옮길 수 있는지 살펴보실 만합니다.`;
  }

  return `거래처가 ${signals.previousCustomersCount}곳에서 ${signals.recentCustomersCount}곳으로 늘고 재구매율도 ${signals.repeatPurchaseRate}%로 이어져, 확보와 유지가 함께 확인됩니다. 이 흐름이 다음 기간에도 이어지는지 같은 기준으로 다시 재보시면 좋습니다.`;
}

export function SignalsView({ serverSignals }: { serverSignals: Signals }) {
  // 서버는 sessionStorage를 못 본다. 업로드·검수한 거래가 있으면 그걸 우선한다.
  const [signals, setSignals] = useState<Signals>(serverSignals);
  const [fromUpload, setFromUpload] = useState(false);
  const [transactionCount, setTransactionCount] = useState(0);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [aiState, setAiState] = useState<"idle" | "loading" | "failed">("idle");

  useEffect(() => {
    const uploaded = readUploadedSignals("");
    if (!uploaded) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSignals(uploaded.signals);
     
    setFromUpload(true);
     
    setTransactionCount(uploaded.transactionCount);
  }, []);

  async function requestAiNotice() {
    setAiState("loading");
    try {
      // 거래처명은 보내지 않는다. 비율 숫자만 나가고, 응답의 마스킹 라벨을
      // 여기서 실명으로 되돌린다.
      const response = await fetch("/api/signals-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionCount,
          customerGrowthRate: signals.customerGrowthRate,
          previousCustomersCount: signals.previousCustomersCount,
          recentCustomersCount: signals.recentCustomersCount,
          growthStatus: statusLabel[signals.statuses.customerGrowthRate],
          repeatPurchaseRate: signals.repeatPurchaseRate,
          repeatStatus: statusLabel[signals.statuses.repeatPurchaseRate],
          topCustomerConcentration: signals.topCustomerConcentration,
          concentrationStatus:
            statusLabel[signals.statuses.topCustomerConcentration],
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

  const metrics: MetricCardData[] = [
    {
      label: "거래처 증가율",
      target: signals.customerGrowthRate,
      prefix: signals.customerGrowthRate > 0 ? "+" : "",
      description: `${signals.previousCustomersCount}곳 → ${signals.recentCustomersCount}곳`,
      status: statusLabel[signals.statuses.customerGrowthRate],
      caution: signals.statuses.customerGrowthRate === "caution",
    },
    {
      label: "재구매율",
      target: signals.repeatPurchaseRate,
      description: "두 번 이상 거래한 비율",
      status: statusLabel[signals.statuses.repeatPurchaseRate],
      caution: signals.statuses.repeatPurchaseRate === "caution",
    },
    {
      label: "최대 거래처 집중도",
      target: signals.topCustomerConcentration,
      description: `${signals.topCustomerName ?? "최대 거래처"} 의존`,
      status: statusLabel[signals.statuses.topCustomerConcentration],
      caution: signals.statuses.topCustomerConcentration === "caution",
    },
  ];

  return (
    <>
      <MetricCards metrics={metrics} />

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

      {/*
        AI 해석은 기본으로 부르지 않는다. 이 수치는 사용자가 올린 문서에서 나온
        값이라, 외부 모델로 보낼지를 사용자가 정하게 한다. 보내는 것은 비율
        숫자뿐이고 거래처명은 브라우저를 벗어나지 않는다.
      */}
      {!aiNotice && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={requestAiNotice}
            disabled={aiState === "loading"}
            className="inline-flex h-8 items-center rounded-md border border-zinc-200 px-3 text-[12px] text-zinc-600 transition-colors hover:bg-zinc-50 disabled:text-zinc-300"
          >
            {aiState === "loading" ? "해석 중…" : "AI 해석 받기"}
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
