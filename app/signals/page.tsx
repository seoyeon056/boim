import Link from "next/link";
import { getSignals } from "@/lib/engine";
import { readCompanyId, withCompany } from "@/lib/company-link";
import StepShell from "@/app/step-shell";
import { SignalsEvidence } from "./signals-evidence";
import { MetricCards, type MetricCardData } from "./metric-cards";
import { generateSignalsInsight } from "@/lib/llm/insights";

const statusLabel = {
  positive: "긍정",
  caution: "주의",
};

export default async function SignalsPage(props: PageProps<"/signals">) {
  const companyId = readCompanyId((await props.searchParams).company);

  let result;

  try {
    result = await getSignals(companyId);
  } catch {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-12">
        <div className="rounded-lg border border-zinc-100 bg-white px-6 py-6 text-center">
          <h1 className="text-lg font-semibold text-zinc-900">
            성장 신호를 불러오지 못했습니다
          </h1>

          <p className="mt-2 text-sm text-zinc-500">잠시 후 다시 시도해 주세요.</p>

          <Link
            href={withCompany("/review", companyId)}
            className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
          >
            이전으로
          </Link>
        </div>
      </div>
    );
  }

  // 긍정/주의는 lib/signals.ts 가 값을 보고 판단한 결과(statuses)를 그대로 쓴다.
  const metrics: MetricCardData[] = [
    {
      label: "거래처 증가율",
      target: result.customerGrowthRate,
      prefix: result.customerGrowthRate > 0 ? "+" : "",
      description: `${result.previousCustomersCount}곳 → ${result.customerCount}곳`,
      status: statusLabel[result.statuses.customerGrowthRate],
      caution: result.statuses.customerGrowthRate === "caution",
    },
    {
      label: "재구매율",
      target: result.repeatPurchaseRate,
      description: "두 번 이상 거래한 비율",
      status: statusLabel[result.statuses.repeatPurchaseRate],
      caution: result.statuses.repeatPurchaseRate === "caution",
    },
    {
      label: "최대 거래처 집중도",
      target: result.topCustomerConcentration,
      description: `${result.topCustomerName} 의존`,
      status: statusLabel[result.statuses.topCustomerConcentration],
      caution: result.statuses.topCustomerConcentration === "caution",
    },
  ];

  const isConcentrationRisky =
    result.statuses.topCustomerConcentration === "caution";

  // 기존 규칙 기반 문장을 fallback으로 두고, LLM 호출이 성공하면 그걸로 대체한다.
  const fallbackNotice = isConcentrationRisky
    ? `${result.topCustomerName}에 대한 거래 집중도(${result.topCustomerConcentration}%)는 리스크 요인으로 관리가 필요합니다.`
    : `${result.topCustomerName}에 대한 거래 집중도는 ${result.topCustomerConcentration}%로, 특정 거래처 의존 위험은 크지 않습니다.`;

  const notice = await generateSignalsInsight(result).catch(
    () => fallbackNotice,
  );

  return (
    <StepShell
      step="Step 05"
      title="내부 성장 신호"
      description="내부 거래 문서에서 확인된 핵심 지표입니다."
      backTo={withCompany("/review", companyId)}
      footer={
        <Link
          href={withCompany("/compare", companyId)}
          className="inline-flex h-11 items-center justify-center rounded-md bg-zinc-900 px-8 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
        >
          외부와 내부 비교하기
        </Link>
      }
    >
      <MetricCards metrics={metrics} />

      <p
        className="mt-3 max-w-3xl text-[13px] leading-6"
        style={{ color: isConcentrationRisky ? "#8A4A2E" : "#736861" }}
      >
        {notice}
      </p>

      <SignalsEvidence
        customerCount={result.customerCount}
        previousCustomersCount={result.previousCustomersCount}
        repeatPurchaseRate={result.repeatPurchaseRate}
      />
    </StepShell>
  );
}
