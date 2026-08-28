"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { withCompany } from "@/lib/company-link";
import { buildDiagnosis } from "@/lib/diagnosis";
import StepShell from "@/app/step-shell";
import type { Signals } from "@/lib/signals";
import type { Visibility } from "@/lib/visibility";
import { readUploadedSignals } from "@/lib/uploaded-signals";

const statusLabel = {
  positive: "긍정",
  neutral: "보통",
  caution: "주의",
};

export function CompareView({
  companyId,
  visibility,
  serverSignals,
}: {
  companyId?: string;
  visibility: Visibility;
  serverSignals: Signals;
}) {
  // 서버는 sessionStorage를 못 본다. 업로드·검수한 거래가 있으면 그걸 우선한다.
  const [signalResult, setSignalResult] = useState<Signals>(serverSignals);
  const [fromUpload, setFromUpload] = useState(false);

  useEffect(() => {
    const uploaded = readUploadedSignals(companyId ?? "");
    if (!uploaded) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSignalResult(uploaded.signals);
     
    setFromUpload(true);
  }, [companyId]);

  const externalMetrics = visibility.metrics;

  // 긍정/주의는 lib/signals.ts 가 값을 보고 판단한 결과(statuses)를 그대로 쓴다.
  const internalSignals = signalResult.signals.map((item) => ({
    label: item.label,
    value: `${item.prefix}${item.value}${item.suffix}`,
    tone: item.tone,
  }));

  const diagnosis = buildDiagnosis(visibility, signalResult);

  const diagnosisEvidence = [
    fromUpload
      ? "제출한 문서에서 확인된 거래 기준"
      : "예시 데이터 기준 (제출 문서에서 거래 내역 미확인)",
    `이전 거래처 ${signalResult.previousCustomersCount}곳 → 현재 ${signalResult.recentCustomersCount}곳`,
    `재구매율 ${signalResult.repeatPurchaseRate}%`,
    `최대 거래처 집중도 ${signalResult.topCustomerConcentration}%`,
  ];

  return (
    <StepShell
      step="Step 05"
      title="외부와 내부 비교"
      description="공개 데이터와 내부 분석 결과를 함께 비교합니다."
      backTo={withCompany("/signals", companyId)}
      footer={
        <Link
          href={withCompany("/share", visibility.companyId)}
          className="inline-flex h-11 items-center justify-center rounded-md bg-zinc-900 px-8 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
        >
          최종 진단 보기
        </Link>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* 외부 — 잉크 카드 */}
        <div
          className="flex flex-col rounded-lg p-7"
          style={{ backgroundColor: "#3A2C25" }}
        >
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">
            External
          </p>
          <p className="mt-2 text-[20px] font-semibold leading-tight tracking-tight text-white">
            외부에서 본 {visibility.company}
          </p>
          <div className="mt-6 flex flex-col">
            {externalMetrics.map((metric, i) => (
              <div
                key={metric.key}
                className="flex items-baseline justify-between gap-4 py-4"
                style={{
                  borderTop:
                    i === 0
                      ? "1px solid rgba(255,255,255,0.14)"
                      : "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <span className="text-[12px] text-zinc-400">
                  {metric.label}
                </span>
                <div className="flex items-baseline gap-3">
                  <span
                    className="text-[11px]"
                    style={{
                      color: metric.tone === "warn" ? "#E8A87F" : "#ADA29A",
                    }}
                  >
                    {metric.interpretation}
                  </span>
                  <span className="font-mono text-[22px] font-medium tabular-nums text-white">
                    {metric.value}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-[12px] leading-6 text-zinc-500">
            {visibility.summary}
          </p>
        </div>

        {/* 내부 — 파인 카드 */}
        <div
          className="flex flex-col rounded-lg p-7"
          style={{ backgroundColor: "#1D4533" }}
        >
          <p
            className="font-mono text-[10px] font-bold uppercase tracking-[0.3em]"
            style={{ color: "#9DB8A4" }}
          >
            Internal
          </p>
          <p className="mt-2 text-[20px] font-semibold leading-tight tracking-tight text-white">
            내부에서 본 {visibility.company}
          </p>
          <div className="mt-6 flex flex-col">
            {internalSignals.map((signal, i) => (
              <div
                key={signal.label}
                className="flex items-baseline justify-between gap-4 py-4"
                style={{
                  borderTop:
                    i === 0
                      ? "1px solid rgba(255,255,255,0.16)"
                      : "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <span className="text-[12px]" style={{ color: "#A9C0AC" }}>
                  {signal.label}
                </span>
                <div className="flex items-baseline gap-3">
                  <span
                    className="text-[11px]"
                    style={{
                      color: signal.tone === "positive" ? "#9DB8A4" : "#E8A87F",
                    }}
                  >
                    {statusLabel[signal.tone]}
                  </span>
                  <span className="font-mono text-[22px] font-medium tabular-nums text-white">
                    {signal.value}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-[12px] leading-6" style={{ color: "#A9C0AC" }}>
            {diagnosis.internalCardNote}
          </p>
        </div>
      </div>

      {/* BO:IM 진단 */}
      <div className="mt-4 rounded-lg border border-zinc-100 bg-white p-5">
        <p className="text-xs font-semibold tracking-tight text-zinc-400">
          BO:IM 진단
        </p>

        {/* 한 줄 요약 — 강조 */}
        <div className="mt-3 rounded-md bg-zinc-900 px-4 py-3">
          <p className="text-sm font-semibold leading-6 text-white">
            {diagnosis.headline}
          </p>
        </div>

        <div className="mt-3 flex flex-col gap-1.5">
          {diagnosisEvidence.map((evidence) => (
            <div
              key={evidence}
              className="flex items-center gap-2 rounded-md bg-zinc-50 px-3 py-2"
            >
              <span className="h-1 w-1 shrink-0 rounded-full bg-zinc-400" />
              <span className="text-xs font-medium text-zinc-700">
                {evidence}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-3 rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-700">
          본 결과는 신용평가가 아닌 AI 기반 성장 진단 참고 자료입니다.
        </div>
      </div>
    </StepShell>
  );
}
