import Link from "next/link";
import { getVisibility } from "@/lib/engine";

const badgeStyles = {
  warn: "bg-amber-50 text-amber-700",
  muted: "bg-zinc-100 text-zinc-500",
};

export default async function VisibilityPage() {
  let visibility;

  try {
    visibility = await getVisibility();
  } catch {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 text-center">
          <h1 className="text-xl font-bold text-zinc-900">
            외부 정보를 불러오지 못했습니다
          </h1>

          <p className="mt-3 text-sm leading-6 text-zinc-600">
            잠시 후 다시 시도해 주세요.
          </p>

          <Link
            href="/company"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-zinc-900 px-6 font-semibold text-white"
          >
            이전으로
          </Link>
        </div>
      </div>
    );
  }

  const metrics = [
    {
      label: "뉴스",
      value: `${visibility.newsCount}건`,
      interpretation: "언론 노출 부족",
      tone: "warn" as const,
    },
    {
      label: "특허",
      value: `${visibility.patentCount}건`,
      interpretation: "공개 기술 흔적 일부 확인",
      tone: "muted" as const,
    },
    {
      label: "채용공고",
      value: `${visibility.jobCount}건`,
      interpretation: "공개 채용 활동 없음",
      tone: "muted" as const,
    },
    {
      label: "가시성 점수",
      value: `${visibility.visibilityScore}점`,
      interpretation: "외부 정보 부족",
      tone: "warn" as const,
    },
  ];

  return (
    <div className="flex flex-1 flex-col bg-slate-50 px-4 pb-16 pt-10">
      <div className="mx-auto w-full max-w-md">
        <Link
          href="/company"
          className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-800"
        >
          ← 이전으로
        </Link>

        <main className="mt-8 flex flex-col gap-6 text-center sm:text-left">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">
            <span className="h-px w-6 bg-zinc-900" aria-hidden="true" />
            STEP 2
          </p>

          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            외부 가시성 점수
          </h1>

          <div className="flex flex-col gap-3">
            {metrics.map((metric) => (
              <div
                key={metric.label}
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-5"
              >
                <div className="flex flex-col gap-1 text-left">
                  <span className="text-sm text-zinc-500">{metric.label}</span>

                  <span className="text-2xl font-bold text-zinc-900">
                    {metric.value}
                  </span>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    badgeStyles[metric.tone]
                  }`}
                >
                  {metric.interpretation}
                </span>
              </div>
            ))}
          </div>

          <p className="text-base leading-7 text-zinc-600">
            외부 데이터만으로는 최근 성장 활동을 확인하기 어렵습니다.
            <br />
            정보가 적다는 사실이 성장하지 않는다는 뜻은 아닙니다.
          </p>

          <p className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-700">
            가시성 점수는 기업의 성장성을 평가한 점수가 아니라, 외부에서 확인
            가능한 공개 정보의 수준을 나타냅니다.
          </p>

          <Link
            href="/upload"
            className="inline-flex h-12 items-center justify-center rounded-lg bg-zinc-900 px-6 text-base font-semibold text-white transition-colors hover:bg-zinc-800"
          >
            내부 거래로 증명하기
          </Link>
        </main>
      </div>
    </div>
  );
}
