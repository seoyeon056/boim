import Link from "next/link";
import { getSignals } from "@/lib/engine";
import { readCompanyId, withCompany } from "@/lib/company-link";
import StepShell from "@/app/step-shell";
import { generateSignalsInsight } from "@/lib/llm/insights";

const valueStyles = {
  positive: "text-emerald-600",
  caution: "text-amber-500",
};

const badgeStyles = {
  positive: "bg-emerald-50 text-emerald-600",
  caution: "bg-amber-50 text-amber-600",
};

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
  const signals = [
    {
      label: "거래처 증가율",
      value: `${result.customerGrowthRate > 0 ? "+" : ""}${result.customerGrowthRate}%`,
      status: statusLabel[result.statuses.customerGrowthRate],
      tone: result.statuses.customerGrowthRate,
      description: `${result.previousCustomersCount}곳 → ${result.customerCount}곳`,
    },
    {
      label: "재구매율",
      value: `${result.repeatPurchaseRate}%`,
      status: statusLabel[result.statuses.repeatPurchaseRate],
      tone: result.statuses.repeatPurchaseRate,
      description: "두 번 이상 거래한 비율",
    },
    {
      label: "최대 거래처 집중도",
      value: `${result.topCustomerConcentration}%`,
      status: statusLabel[result.statuses.topCustomerConcentration],
      tone: result.statuses.topCustomerConcentration,
      description: `${result.topCustomerName} 의존`,
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
      aside={
        <Link
          href={withCompany("/compare", companyId)}
          className="inline-flex h-10 w-full items-center justify-center rounded-md bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
        >
          외부와 내부 비교하기
        </Link>
      }
    >
      {/* 지표 카드 */}
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-zinc-100 bg-zinc-100 md:grid-cols-3">
        {signals.map((signal) => (
          <div
            key={signal.label}
            className={`flex flex-col justify-between gap-6 px-6 py-5 ${
              signal.tone === "caution" ? "bg-amber-50/30" : "bg-white"
            }`}
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-zinc-400">{signal.label}</span>
              <span
                className={`font-mono text-4xl font-semibold leading-none tabular-nums ${
                  valueStyles[signal.tone]
                }`}
              >
                {signal.value}
              </span>
              <span className="mt-1 text-[12px] text-zinc-400">
                {signal.description}
              </span>
            </div>
            <span
              className={`shrink-0 self-start rounded-full px-2.5 py-1 text-[11px] font-medium ${
                badgeStyles[signal.tone]
              }`}
            >
              {signal.status}
            </span>
          </div>
        ))}
      </div>

      <div
        className={`mt-3 max-w-3xl rounded-md border px-3 py-2.5 text-[11px] leading-5 ${
          isConcentrationRisky
            ? "border-amber-100 bg-amber-50 text-amber-700"
            : "border-zinc-100 bg-zinc-50 text-zinc-500"
        }`}
      >
        {notice}
      </div>
    </StepShell>
  );
}
