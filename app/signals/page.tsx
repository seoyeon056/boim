import Link from "next/link";
import { getSignals } from "@/lib/engine";
import { readCompanyId, withCompany } from "@/lib/company-link";

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
      description: `이전 거래처 ${result.previousCustomersCount}곳 → 현재 ${result.customerCount}곳`,
    },
    {
      label: "재구매율",
      value: `${result.repeatPurchaseRate}%`,
      status: statusLabel[result.statuses.repeatPurchaseRate],
      tone: result.statuses.repeatPurchaseRate,
      description: "전체 거래처 중 두 번 이상 거래한 곳의 비율",
    },
    {
      label: "최대 거래처 집중도",
      value: `${result.topCustomerConcentration}%`,
      status: statusLabel[result.statuses.topCustomerConcentration],
      tone: result.statuses.topCustomerConcentration,
      description: `${result.topCustomerName}가 전체 매출에서 차지하는 비중`,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-lg px-6 py-12">
      <Link
        href={withCompany("/review", companyId)}
        className="inline-flex items-center gap-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-600"
      >
        ← 이전으로
      </Link>

      <div className="mt-8 flex flex-col gap-1">
        <span className="font-mono text-xs font-medium uppercase tracking-widest text-zinc-400">
          Step 05
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          내부 성장 신호
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          내부 거래 문서에서 확인한 핵심 지표입니다.
        </p>
      </div>

      {/* 지표 카드 */}
      <div className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-zinc-100 bg-zinc-100">
        {signals.map((signal) => (
          <div
            key={signal.label}
            className={`flex items-center justify-between gap-4 px-6 py-5 ${
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
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                badgeStyles[signal.tone]
              }`}
            >
              {signal.status}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-md border border-amber-100 bg-amber-50 px-3 py-2.5 text-[11px] leading-5 text-amber-700">
        {result.topCustomerName}에 대한 거래 집중도(
        {result.topCustomerConcentration}%)는 리스크 요인으로 관리가 필요합니다.
      </div>

      <div className="mt-6">
        <Link
          href={withCompany("/compare", companyId)}
          className="inline-flex h-10 w-full items-center justify-center rounded-md bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
        >
          외부와 내부 비교하기
        </Link>
      </div>
    </div>
  );
}
