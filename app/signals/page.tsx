import Link from "next/link";
import { getSignals } from "@/lib/engine";

const valueStyles = {
  positive: "text-emerald-600",
  caution: "text-amber-600",
};

const badgeStyles = {
  positive: "bg-emerald-50 text-emerald-700",
  caution: "bg-amber-50 text-amber-700",
};

export default async function SignalsPage() {
  let result;

  try {
    result = await getSignals();
  } catch {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-100 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-bold text-zinc-900">
            성장 신호를 불러오지 못했습니다
          </h1>

          <p className="mt-3 text-sm leading-6 text-zinc-600">
            잠시 후 다시 시도해 주세요.
          </p>

          <Link
            href="/review"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-blue-600 px-6 font-semibold text-white"
          >
            이전으로
          </Link>
        </div>
      </div>
    );
  }

  const signals = [
    {
      label: "거래처 증가율",
      value: `+${result.customerGrowthRate}%`,
      status: "긍정",
      tone: "positive" as const,
      description: `이전 거래처 ${result.previousCustomersCount}곳에서 현재 ${result.customerCount}곳으로 증가했습니다.`,
    },
    {
      label: "재구매율",
      value: `${result.repeatPurchaseRate}%`,
      status: "긍정",
      tone: "positive" as const,
      description: "전체 거래처 중 두 번 이상 거래한 곳의 비율입니다.",
    },
    {
      label: "최대 거래처 집중도",
      value: `${result.topCustomerConcentration}%`,
      status: "주의",
      tone: "caution" as const,
      description: `${result.topCustomerName}가 전체 매출의 ${result.topCustomerConcentration}%를 차지합니다. 특정 거래처 의존 위험을 함께 확인해야 합니다.`,
    },
  ];

  return (
    <div className="flex flex-1 flex-col bg-zinc-100 px-4 py-16">
      <div className="mx-auto w-full max-w-md">
        <Link
          href="/review"
          className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-800"
        >
          ← 이전으로
        </Link>

        <main className="mt-8 flex flex-col gap-3 text-center sm:text-left">
          <p className="text-sm font-semibold text-blue-600">STEP 5</p>

          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            내부 성장 신호
          </h1>

          <p className="text-base leading-7 text-zinc-500">
            내부 거래 문서에서 확인한 성장 신호를 보여줍니다.
          </p>
        </main>

        <div className="mt-6 flex flex-col gap-4">
          {signals.map((signal) => (
            <div
              key={signal.label}
              className="flex flex-col gap-2 rounded-2xl bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-zinc-700">
                  {signal.label}
                </span>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    badgeStyles[signal.tone]
                  }`}
                >
                  {signal.status}
                </span>
              </div>

              <span
                className={`text-2xl font-bold ${valueStyles[signal.tone]}`}
              >
                {signal.value}
              </span>

              <p className="text-sm leading-6 text-zinc-500">
                {signal.description}
              </p>
            </div>
          ))}
        </div>

        <Link
          href="/compare"
          className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-blue-600 px-6 text-base font-semibold text-white transition-colors hover:bg-blue-700"
        >
          외부와 내부 비교하기
        </Link>
      </div>
    </div>
  );
}