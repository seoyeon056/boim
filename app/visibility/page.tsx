import Link from "next/link";
import { getVisibility } from "@/lib/engine";
import { readCompanyId, withCompany } from "@/lib/company-link";
import StepShell from "@/app/step-shell";

const toneStyles = {
  warn: "bg-amber-50 text-amber-600",
  muted: "bg-zinc-100 text-zinc-500",
};

export default async function VisibilityPage(props: PageProps<"/visibility">) {
  const companyId = readCompanyId((await props.searchParams).company);

  let visibility;

  try {
    visibility = await getVisibility(companyId);
  } catch {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-12">
        <div className="rounded-lg border border-zinc-100 bg-white px-6 py-6 text-center">
          <h1 className="text-lg font-semibold text-zinc-900">
            외부 정보를 불러오지 못했습니다
          </h1>

          <p className="mt-2 text-sm text-zinc-500">잠시 후 다시 시도해 주세요.</p>

          <Link
            href="/company"
            className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
          >
            이전으로
          </Link>
        </div>
      </div>
    );
  }

  const score = visibility.visibilityScore;
  const pct = Math.min(100, Math.max(0, score));

  // 상단 점수 카드는 종합 점수만 쓰고, 아래 목록은 뉴스·특허·채용만 나눠 보여준다.
  const scoreMetric = visibility.metrics.find((m) => m.key === "visibility");
  const breakdown = visibility.metrics.filter((m) => m.key !== "visibility");

  return (
    <StepShell
      step="Step 02"
      title="외부 가시성 점수"
      description={`${visibility.company}의 뉴스·특허·채용 공개 정보를 기반으로 측정합니다.`}
      backTo="/company"
      aside={
        <Link
          href={withCompany("/upload", visibility.companyId)}
          className="inline-flex h-10 w-full items-center justify-center rounded-md bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
        >
          내부 거래로 증명하기
        </Link>
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 점수 카드 */}
        <div className="rounded-lg border border-zinc-100 bg-white px-6 py-6">
          <div className="flex items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold tracking-tight text-zinc-400">
                가시성 점수
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-5xl font-semibold tabular-nums text-zinc-900">
                  {score}
                </span>
                <span className="text-sm text-zinc-400">/ 100</span>
              </div>
            </div>
            {scoreMetric && (
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  toneStyles[scoreMetric.tone]
                }`}
              >
                {scoreMetric.interpretation}
              </span>
            )}
          </div>

          {/* 점수 바 */}
          <div className="mt-5 flex flex-col gap-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full bg-amber-400 transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex justify-between">
              <span className="font-mono text-[10px] text-zinc-300">0</span>
              <span className="font-mono text-[10px] text-zinc-300">100</span>
            </div>
          </div>
        </div>

        {/* 항목별 내역 */}
        <div className="flex flex-col gap-px overflow-hidden rounded-lg border border-zinc-100">
          {breakdown.map((metric, i) => (
            <div
              key={metric.key}
              className={`flex items-center justify-between gap-4 bg-white px-5 py-3.5 ${
                i < breakdown.length - 1 ? "border-b border-zinc-100" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="w-12 text-xs text-zinc-400">
                  {metric.label}
                </span>
                <span className="font-mono text-sm font-semibold tabular-nums text-zinc-900">
                  {metric.value}
                </span>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                  toneStyles[metric.tone]
                }`}
              >
                {metric.interpretation}
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-4 max-w-3xl text-[13px] leading-[1.7] text-zinc-500">
        {visibility.summary}
      </p>

      <div className="mt-3 max-w-3xl rounded-md border border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-700">
        {visibility.notice} 정보가 적다는 것이 성장하지 않는다는 뜻은 아닙니다.
      </div>
    </StepShell>
  );
}
