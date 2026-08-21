import Link from "next/link";
import { getSignals, getVisibility } from "@/lib/engine";
import { readCompanyId, withCompany } from "@/lib/company-link";
import { buildDiagnosis } from "@/lib/diagnosis";
import StepShell from "@/app/step-shell";

const statusLabel = {
  positive: "긍정",
  caution: "주의",
};

export default async function ComparePage(props: PageProps<"/compare">) {
  const companyId = readCompanyId((await props.searchParams).company);

  let visibility;
  let signalResult;

  try {
    [visibility, signalResult] = await Promise.all([
      getVisibility(companyId),
      getSignals(companyId),
    ]);
  } catch {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-12">
        <div className="rounded-lg border border-zinc-100 bg-white px-6 py-6 text-center">
          <h1 className="text-lg font-semibold text-zinc-900">
            비교 정보를 불러오지 못했습니다
          </h1>

          <p className="mt-2 text-sm text-zinc-500">잠시 후 다시 시도해 주세요.</p>

          <Link
            href={withCompany("/signals", companyId)}
            className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
          >
            이전으로
          </Link>
        </div>
      </div>
    );
  }

  // 외부 지표는 lib/visibility.ts 에서 건수에 맞는 해석과 tone까지 계산해서 온다.
  const externalMetrics = visibility.metrics;

  // 긍정/주의는 lib/signals.ts 가 값을 보고 판단한 결과(statuses)를 그대로 쓴다.
  const internalSignals = [
    {
      label: "거래처 증가율",
      value: `${signalResult.customerGrowthRate > 0 ? "+" : ""}${signalResult.customerGrowthRate}%`,
      tone: signalResult.statuses.customerGrowthRate,
    },
    {
      label: "재구매율",
      value: `${signalResult.repeatPurchaseRate}%`,
      tone: signalResult.statuses.repeatPurchaseRate,
    },
    {
      label: "최대 거래처 집중도",
      value: `${signalResult.topCustomerConcentration}%`,
      tone: signalResult.statuses.topCustomerConcentration,
    },
  ];

  const diagnosis = buildDiagnosis(visibility, signalResult);

  const diagnosisEvidence = [
    `이전 거래처 ${signalResult.previousCustomersCount}곳 → 현재 ${signalResult.customerCount}곳`,
    `재구매율 ${signalResult.repeatPurchaseRate}%`,
    `최대 거래처 집중도 ${signalResult.topCustomerConcentration}%`,
  ];

  return (
    <StepShell
      step="Step 05"
      title="외부와 내부 비교"
      description="공개 데이터와 내부 분석 결과를 함께 비교합니다."
      backTo={withCompany("/signals", companyId)}
      aside={
        <Link
          href={withCompany("/share", visibility.companyId)}
          className="inline-flex h-10 w-full items-center justify-center rounded-md bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
        >
          최종 진단 보기
        </Link>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* 외부 — 잉크 카드 */}
        <div
          className="flex flex-col rounded-lg p-7"
          style={{ backgroundColor: "#1B1917" }}
        >
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">
            External
          </p>
          <p
            className="mt-2 text-[20px] leading-tight text-white"
            style={{ fontFamily: "Nanum Myeongjo, serif" }}
          >
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
                      color: metric.tone === "warn" ? "#C0A46B" : "#71717A",
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
          style={{ backgroundColor: "#1E3A33" }}
        >
          <p
            className="font-mono text-[10px] font-bold uppercase tracking-[0.3em]"
            style={{ color: "#7FA396" }}
          >
            Internal
          </p>
          <p
            className="mt-2 text-[20px] leading-tight text-white"
            style={{ fontFamily: "Nanum Myeongjo, serif" }}
          >
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
                <span className="text-[12px]" style={{ color: "#A9C4B9" }}>
                  {signal.label}
                </span>
                <div className="flex items-baseline gap-3">
                  <span
                    className="text-[11px]"
                    style={{
                      color: signal.tone === "positive" ? "#8FB3A6" : "#C0A46B",
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
          <p className="mt-6 text-[12px] leading-6" style={{ color: "#8FB3A6" }}>
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
