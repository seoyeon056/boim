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

// 규칙 기반 문장. LLM을 부르지 않는 기본 상태에서 쓴다.
function ruleNotice(signals: Signals): string {
  const risky = signals.statuses.topCustomerConcentration === "caution";
  const name = signals.topCustomerName ?? "최대 거래처";
  return risky
    ? `${name}에 대한 거래 집중도(${signals.topCustomerConcentration}%)는 리스크 요인으로 관리가 필요합니다.`
    : `${name}에 대한 거래 집중도는 ${signals.topCustomerConcentration}%로, 특정 거래처 의존 위험은 크지 않습니다.`;
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
        {aiNotice ?? ruleNotice(signals)}
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
              : "비율 수치만 전송되며, 거래처명은 전송되지 않습니다."}
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
