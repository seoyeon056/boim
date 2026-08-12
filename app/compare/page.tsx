import Link from "next/link";
import { getSignals, getVisibility } from "@/lib/engine";

const signalBadgeStyles = {
  positive: "bg-emerald-50 text-emerald-700",
  caution: "bg-amber-50 text-amber-700",
};

export default async function ComparePage() {
  let visibility;
  let signalResult;

  try {
    [visibility, signalResult] = await Promise.all([
      getVisibility(),
      getSignals(),
    ]);
  } catch {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-100 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-bold text-zinc-900">
            비교 정보를 불러오지 못했습니다
          </h1>

          <p className="mt-3 text-sm leading-6 text-zinc-600">
            잠시 후 다시 시도해 주세요.
          </p>

          <Link
            href="/signals"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-blue-600 px-6 font-semibold text-white"
          >
            이전으로
          </Link>
        </div>
      </div>
    );
  }

  const externalMetrics = [
    {
      label: "뉴스",
      value: `${visibility.newsCount}건`,
      interpretation: "언론 노출 부족",
    },
    {
      label: "특허",
      value: `${visibility.patentCount}건`,
      interpretation: "공개 기술 흔적 일부 확인",
    },
    {
      label: "채용공고",
      value: `${visibility.jobCount}건`,
      interpretation: "공개 채용 활동 없음",
    },
    {
      label: "가시성 점수",
      value: `${visibility.visibilityScore}점`,
      interpretation: "외부 정보 부족",
    },
  ];

  const internalSignals = [
    {
      label: "거래처 증가율",
      value: `+${signalResult.customerGrowthRate}%`,
      status: "긍정",
      tone: "positive" as const,
    },
    {
      label: "재구매율",
      value: `${signalResult.repeatPurchaseRate}%`,
      status: "긍정",
      tone: "positive" as const,
    },
    {
      label: "최대 거래처 집중도",
      value: `${signalResult.topCustomerConcentration}%`,
      status: "주의",
      tone: "caution" as const,
    },
  ];

  const diagnosisEvidence = [
    `이전 거래처 ${signalResult.previousCustomersCount}곳 → 현재 거래처 ${signalResult.customerCount}곳`,
    `재구매율 ${signalResult.repeatPurchaseRate}%`,
    `최대 거래처 집중도 ${signalResult.topCustomerConcentration}%`,
  ];

  return (
    <div className="flex flex-1 flex-col bg-zinc-100 px-4 py-16">
      <div className="mx-auto w-full max-w-4xl">
        <main className="flex flex-col gap-3 text-center sm:text-left">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            외부와 내부 비교
          </h1>

          <p className="text-base leading-7 text-zinc-500">
            공개 데이터와 내부 분석 결과를 함께 비교합니다.
          </p>
        </main>

        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-5 rounded-2xl bg-zinc-900 p-6 shadow-sm">
            <h2 className="text-xl font-bold text-white">
              외부에서 본 {visibility.company}
            </h2>

            <div className="flex flex-col gap-3">
              {externalMetrics.map((metric) => (
                <div
                  key={metric.label}
                  className="flex items-center justify-between gap-3 rounded-xl bg-zinc-800 p-4"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm text-zinc-400">
                      {metric.label}
                    </span>

                    <span className="text-lg font-bold text-white">
                      {metric.value}
                    </span>
                  </div>

                  <span className="rounded-full bg-zinc-700 px-3 py-1 text-xs font-medium text-zinc-300">
                    {metric.interpretation}
                  </span>
                </div>
              ))}
            </div>

            <p className="mt-auto rounded-xl bg-zinc-800 p-4 text-sm leading-6 text-zinc-300">
              외부 데이터만으로는 최근 성장 활동을 확인하기 어렵습니다.
            </p>
          </div>

          <div className="flex flex-col gap-5 rounded-2xl bg-blue-600 p-6 shadow-sm">
            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-bold text-white">
                내부에서 본 {visibility.company}
              </h2>

              <p className="text-sm leading-6 text-blue-100">
                거래명세서·세금계산서·발주서 등 여러 내부 문서를 종합
                분석했습니다.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {internalSignals.map((signal) => (
                <div
                  key={signal.label}
                  className="flex items-center justify-between gap-3 rounded-xl bg-blue-500 px-4 py-3"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm text-blue-50">
                      {signal.label}
                    </span>

                    <span className="text-lg font-bold text-white">
                      {signal.value}
                    </span>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      signalBadgeStyles[signal.tone]
                    }`}
                  >
                    {signal.status}
                  </span>
                </div>
              ))}
            </div>

            <p className="mt-auto rounded-xl bg-blue-700 p-4 text-sm leading-6 text-blue-50">
              반복 거래와 거래처 확장 신호가 확인되었습니다.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-5 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-zinc-900">BO:IM 진단</h2>

          <div className="flex flex-col gap-3 text-base leading-7 text-zinc-600">
            <p>
              외부에서는 공개 정보가 부족해 기업의 최근 성장 활동을 확인하기
              어렵습니다.
            </p>

            <p>
              내부 문서에서는 거래처 증가와 반복 거래 신호가 확인되었습니다.
            </p>

            <p>
              다만 최대 거래처인 {signalResult.topCustomerName}가 전체 매출의{" "}
              {signalResult.topCustomerConcentration}%를 차지해 특정 거래처 의존
              위험을 함께 살펴봐야 합니다.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-zinc-700">근거</span>

            <ul className="flex flex-col gap-2">
              {diagnosisEvidence.map((evidence) => (
                <li
                  key={evidence}
                  className="rounded-xl bg-zinc-100 px-4 py-3 text-sm font-medium text-zinc-800"
                >
                  {evidence}
                </li>
              ))}
            </ul>
          </div>

          <p className="rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-700">
            본 결과는 신용평가가 아닌 AI 기반 성장 진단 참고 자료입니다.
          </p>

          <Link
            href="/share"
            className="inline-flex h-12 items-center justify-center rounded-full bg-blue-600 px-6 text-base font-semibold text-white transition-colors hover:bg-blue-700"
          >
            공개 범위 설정하기
          </Link>
        </div>
      </div>
    </div>
  );
}