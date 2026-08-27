import Link from "next/link";
import { getVisibility } from "@/lib/engine";
import { readCompanyId, withCompany } from "@/lib/company-link";
import StepShell from "@/app/step-shell";
import { ScoreCard } from "./score-card";
import { generateVisibilityInsight } from "@/lib/llm/insights";

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

  // LLM 호출이 실패해도(키 미등록, 네트워크 오류 등) 화면이 깨지지 않도록
  // 기존 규칙 기반 문장(visibility.summary)을 fallback으로 둔다.
  const summary = await generateVisibilityInsight(visibility).catch(
    () => visibility.summary,
  );

  const score = visibility.visibilityScore;

  // 상단 점수 카드는 종합 점수만 쓰고, 아래 목록은 뉴스·특허·채용·공시로 나눠 보여준다.
  const scoreMetric = visibility.metrics.find((m) => m.key === "visibility");
  const breakdown = visibility.metrics.filter((m) => m.key !== "visibility");

  return (
    <StepShell
      step="Step 02"
      title="외부 가시성 점수"
      description={`${visibility.company}의 뉴스·특허·채용·공시 공개 정보를 기반으로 측정합니다.`}
      backTo="/company"
      footer={
        <Link
          href={withCompany("/upload", visibility.companyId)}
          className="inline-flex h-11 items-center justify-center rounded-md bg-zinc-900 px-8 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
        >
          내부 거래로 증명하기
        </Link>
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ScoreCard
          score={score}
          interpretation={scoreMetric?.interpretation ?? ""}
        />

        {/* 항목별 내역 */}
        <div className="flex flex-col overflow-hidden rounded-lg bg-white">
          {breakdown.map((metric, i) => (
            <div
              key={metric.key}
              className={`flex flex-1 items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-zinc-50 ${
                i < breakdown.length - 1 ? "border-b border-zinc-100" : ""
              }`}
            >
              <div className="flex items-baseline gap-4">
                <span className="w-14 text-[13px] text-zinc-500">
                  {metric.label}
                </span>
                <span className="font-mono text-[20px] font-medium tabular-nums text-zinc-900">
                  {metric.value}
                </span>
              </div>
              <span
                className="text-[11px]"
                style={{
                  color: metric.tone === "warn" ? "#E8A87F" : "#ADA29A",
                }}
              >
                {metric.interpretation}
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-4 max-w-3xl text-[13px] leading-6 text-zinc-500">
        {summary}
      </p>

      <p className="mt-3 max-w-3xl text-[13px] leading-6 text-zinc-500">
        {visibility.notice} 정보가 적다는 것이 성장하지 않는다는 뜻은 아닙니다.
      </p>
    </StepShell>
  );
}
