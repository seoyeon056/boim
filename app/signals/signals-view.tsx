"use client";

import { useEffect, useState } from "react";
import type { Signals } from "@/lib/signals";
import { readUploadedSignals } from "@/lib/uploaded-signals";
import { restoreCustomerName } from "@/lib/llm/customer-mask";
import { SignalsEvidence } from "./signals-evidence";

const valueStyles = { positive: "text-emerald-600", caution: "text-amber-500" };
const badgeStyles = {
  positive: "bg-emerald-50 text-emerald-600",
  caution: "bg-amber-50 text-amber-600",
};
const statusLabel = { positive: "긍정", caution: "주의" };

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
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [aiState, setAiState] = useState<"idle" | "loading" | "failed">("idle");

  useEffect(() => {
    const uploaded = readUploadedSignals("");
    if (!uploaded) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSignals(uploaded.signals);
     
    setFromUpload(true);
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
          customerGrowthRate: signals.customerGrowthRate,
          previousCustomersCount: signals.previousCustomersCount,
          recentCustomersCount: signals.recentCustomersCount,
          repeatPurchaseRate: signals.repeatPurchaseRate,
          topCustomerConcentration: signals.topCustomerConcentration,
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

  const cards = [
    {
      label: "거래처 증가율",
      value: `${signals.customerGrowthRate > 0 ? "+" : ""}${signals.customerGrowthRate}%`,
      tone: signals.statuses.customerGrowthRate,
      description: `${signals.previousCustomersCount}곳 → ${signals.recentCustomersCount}곳`,
    },
    {
      label: "재구매율",
      value: `${signals.repeatPurchaseRate}%`,
      tone: signals.statuses.repeatPurchaseRate,
      description: "두 번 이상 거래한 비율",
    },
    {
      label: "최대 거래처 집중도",
      value: `${signals.topCustomerConcentration}%`,
      tone: signals.statuses.topCustomerConcentration,
      description: `${signals.topCustomerName ?? "최대 거래처"} 의존`,
    },
  ];

  return (
    <>
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-zinc-100 bg-zinc-100 md:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`flex flex-col justify-between gap-6 px-6 py-5 ${
              card.tone === "caution" ? "bg-amber-50/30" : "bg-white"
            }`}
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-zinc-400">{card.label}</span>
              <span
                className={`font-mono text-4xl font-semibold leading-none tabular-nums ${valueStyles[card.tone]}`}
              >
                {card.value}
              </span>
              <span className="mt-1 text-[12px] text-zinc-400">
                {card.description}
              </span>
            </div>
            <span
              className={`shrink-0 self-start rounded-full px-2.5 py-1 text-[11px] font-medium ${badgeStyles[card.tone]}`}
            >
              {statusLabel[card.tone]}
            </span>
          </div>
        ))}
      </div>

      {/* 이 수치가 어디서 나왔는지 밝힌다. 예전에는 예시 데이터가 실제 분석
          결과인 것처럼 보였다. */}
      <p className="mt-2 text-[11px] leading-5 text-zinc-400">
        {fromUpload
          ? "제출한 문서에서 확인된 거래를 근거로 산출한 수치입니다."
          : "제출한 문서에서 거래 내역을 확인하지 못해 예시 데이터로 산출한 수치입니다."}
      </p>

      <div
        className={`mt-3 max-w-3xl rounded-md border px-3 py-2.5 text-[11px] leading-5 ${
          risky
            ? "border-amber-100 bg-amber-50 text-amber-700"
            : "border-zinc-100 bg-zinc-50 text-zinc-500"
        }`}
      >
        {aiNotice ?? ruleNotice(signals)}
      </div>

      {/*
        AI 해석은 기본으로 부르지 않는다. 이 수치는 사용자가 올린 문서에서 나온
        값이라, 외부 모델로 보낼지를 사용자가 정하게 한다. 보내는 것은 비율
        숫자뿐이고 거래처명은 브라우저를 벗어나지 않는다.
      */}
      {!aiNotice && (
        <div className="mt-2 flex items-center gap-2">
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
