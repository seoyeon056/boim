import Link from "next/link";
import { getSignals, getVisibility } from "@/lib/engine";
import { readCompanyId, withCompany } from "@/lib/company-link";
import { buildDiagnosis } from "@/lib/diagnosis";

const externalBadgeStyles = {
  warn: "bg-amber-900/60 text-amber-400",
  muted: "bg-zinc-700 text-zinc-400",
};

const signalBadgeStyles = {
  positive: "bg-emerald-700 text-emerald-200",
  caution: "bg-amber-900/60 text-amber-400",
};

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
  // tone: "warn"(주황, 강조) = 정보 부족 / "muted"(회색) = 흔적 일부 확인
  const externalMetrics = visibility.metrics;

  // 긍정/주의는 lib/signals.ts 가 값을 보고 판단한 결과(statuses)를 그대로 쓴다.
  const internalSignals = [
    {
      label: "거래처 증가율",
      value: `${signalResult.customerGrowthRate > 0 ? "+" : ""}${signalResult.customerGrowthRate}%`,
      status: statusLabel[signalResult.statuses.customerGrowthRate],
      tone: signalResult.statuses.customerGrowthRate,
    },
    {
      label: "재구매율",
      value: `${signalResult.repeatPurchaseRate}%`,
      status: statusLabel[signalResult.statuses.repeatPurchaseRate],
      tone: signalResult.statuses.repeatPurchaseRate,
    },
    {
      label: "최대 거래처 집중도",
      value: `${signalResult.topCustomerConcentration}%`,
      status: statusLabel[signalResult.statuses.topCustomerConcentration],
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
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link
        href={withCompany("/signals", companyId)}
        className="inline-flex items-center gap-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-600"
      >
        ← 이전으로
      </Link>

      <div className="mt-8 flex flex-col gap-1">
        <span className="font-mono text-xs font-medium uppercase tracking-widest text-zinc-400">
          Step 05
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          외부와 내부 비교
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          공개 데이터와 내부 분석 결과를 함께 비교합니다.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* 왼쪽: 외부에서 본 모습 (어두운 카드) */}
        <div className="flex flex-col gap-4 rounded-lg bg-zinc-900 p-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              외부에서 본
            </p>
            <p className="mt-0.5 text-sm font-semibold text-white">
              {visibility.company}
            </p>
          </div>

          <div className="flex flex-col gap-px overflow-hidden rounded-md border border-zinc-700">
            {externalMetrics.map((metric, i) => (
              <div
                key={metric.key}
                className={`flex items-center justify-between gap-3 bg-zinc-800 px-4 py-3 ${
                  i < externalMetrics.length - 1
                    ? "border-b border-zinc-700"
                    : ""
                }`}
              >
                <div>
                  <p className="text-[10px] text-zinc-500">{metric.label}</p>
                  <p className="font-mono text-base font-semibold text-white">
                    {metric.value}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    externalBadgeStyles[metric.tone]
                  }`}
                >
                  {metric.interpretation}
                </span>
              </div>
            ))}
          </div>

          <p className="mt-auto text-xs leading-5 text-zinc-500">
            {visibility.summary}
          </p>
        </div>

        {/* 오른쪽: 내부에서 본 모습 (초록 카드 — 외부는 가려짐(검정), 내부는 성장(초록)이라는 대비) */}
        <div className="flex flex-col gap-4 rounded-lg bg-emerald-900 p-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-emerald-600">
              내부에서 본
            </p>
            <p className="mt-0.5 text-sm font-semibold text-white">
              {visibility.company}
            </p>
          </div>

          <div className="flex flex-col gap-px overflow-hidden rounded-md border border-emerald-700">
            {internalSignals.map((signal, i) => (
              <div
                key={signal.label}
                className={`flex items-center justify-between gap-3 bg-emerald-800 px-4 py-3 ${
                  i < internalSignals.length - 1
                    ? "border-b border-emerald-700"
                    : ""
                }`}
              >
                <div>
                  <p className="text-[10px] text-emerald-400">{signal.label}</p>
                  <p className="font-mono text-base font-semibold text-white">
                    {signal.value}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    signalBadgeStyles[signal.tone]
                  }`}
                >
                  {signal.status}
                </span>
              </div>
            ))}
          </div>

          <p className="mt-auto text-xs leading-5 text-emerald-400">
            {diagnosis.internalCardNote}
          </p>
        </div>
      </div>

      {/* BO:IM 진단 */}
      <div className="mt-4 rounded-lg border border-zinc-100 bg-white p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
          BO:IM 진단
        </p>

        {/* 한 줄 요약 — 어두운 박스로 강조 */}
        <div className="mt-3 rounded-md bg-zinc-900 px-4 py-3">
          <p className="text-sm font-semibold leading-6 text-white">
            {diagnosis.headline}
          </p>
        </div>

        <div className="mt-3 flex flex-col gap-2 text-[13px] leading-[1.7] text-zinc-500">
          <p>{diagnosis.external}</p>
          <p>{diagnosis.internal}</p>
          <p>{diagnosis.risk}</p>
        </div>

        <div className="mt-3 flex flex-col gap-1.5">
          {diagnosisEvidence.map((evidence) => (
            <div
              key={evidence}
              className="flex items-center gap-2 rounded-md bg-zinc-50 px-3 py-2"
            >
              <span className="h-1 w-1 shrink-0 rounded-full bg-zinc-400" />
              <span className="text-xs font-medium text-zinc-700">{evidence}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-700">
          본 결과는 신용평가가 아닌 AI 기반 성장 진단 참고 자료입니다.
        </div>
      </div>

      <div className="mt-4">
        <Link
          href={withCompany("/share", visibility.companyId)}
          className="inline-flex h-10 w-full items-center justify-center rounded-md bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
        >
          최종 진단 보기
        </Link>
      </div>
    </div>
  );
}
