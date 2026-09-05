import Link from "next/link";
import { getVisibility } from "@/lib/engine";
import { readCompanyId, withCompany } from "@/lib/company-link";
import StepShell from "@/app/step-shell";
import { ScoreCard } from "./score-card";
import { generateVisibilityInsight } from "@/lib/llm/insights";

// 국민연금 사업장명 검색이 공공데이터포털 쪽 사정으로 느려질 때가 있다.
// 배포본 실측(2026-09-05): LG전자 29.6초, SK하이닉스 19.2초, 삼성전자 17.2초.
// 상한이 30초면 가장 느린 조회가 상한에 닿아 고용 축만 "확인 불가"가 되는 게
// 아니라 화면 전체가 죽는다. 여유를 조금 두되, 사람이 기다릴 수 있는 선을
// 넘지 않도록 40초로 둔다.
//
// 이 값은 상한일 뿐이라 평소 속도에는 영향이 없다. 3초에 끝나는 조회는 3초에
// 끝난다.
export const maxDuration = 40;

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
  // 기존 규칙 기반 문장(visibility.summary)을 fallback 으로 둔다.
  //
  // 예전에는 이 문장만 <Suspense> 로 흘려보내 점수부터 보여 줬는데, 그러면
  // 라우트가 스트리밍으로 쪼개진다. 이 Next 버전에서는 쪼개진 조각을 화면에
  // 붙이는 단계가 끝내 실행되지 않아, 주소를 직접 열거나 새로고침하면 화면이
  // "불러오는 중"에서 멈췄다(내용은 DOM 안에 숨어 있었다). 링크로 이동할 때만
  // 정상이었다. 쪼개지지 않게 여기서 함께 기다린다.
  const summary = await generateVisibilityInsight(visibility).catch(
    () => visibility.summary,
  );

  const score = visibility.visibilityScore;

  // 상단 점수 카드는 종합 점수만 쓰고, 아래 목록은 뉴스·특허·고용·공시로 나눠 보여준다.
  const scoreMetric = visibility.metrics.find((m) => m.key === "visibility");
  const breakdown = visibility.metrics.filter((m) => m.key !== "visibility");

  return (
    <StepShell
      step="Step 02"
      title="외부 가시성 점수"
      description={
        visibility.company
          ? `${visibility.company}의 뉴스·특허·고용·공시 공개 정보를 기반으로 측정합니다.`
          : "기업 정보를 확인하지 못했습니다. 처음 화면에서 기업을 다시 선택해 주세요."
      }
      backTo="/company"
      companyId={visibility.companyId}
      footer={
        <Link
          href={withCompany("/upload", visibility.companyId)}
          className="inline-flex h-[50px] items-center justify-center rounded-md bg-[#2A211C] px-10 text-[16px] font-semibold text-white transition-colors hover:bg-[#12100E]"
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
                <span className="w-16 text-[15px] text-zinc-600">
                  {metric.label}
                </span>
                <span className="font-mono text-[26px] font-medium tabular-nums text-zinc-900">
                  {metric.value}
                </span>
              </div>
              {/* 멀리서도 읽히도록 한 단계 키우고 색을 진하게 잡는다.
                  기존 #E8A87F / #ADA29A 는 흰 배경에서 대비가 너무 낮았다. */}
              <span
                className="text-[13px]"
                style={{
                  color: metric.tone === "warn" ? "#B4653C" : "#6B6259",
                }}
              >
                {metric.interpretation}
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-5 max-w-3xl text-[16px] leading-[1.75] text-zinc-700">
        {summary}
      </p>

      <p className="mt-3 max-w-3xl text-[15px] leading-[1.75] text-zinc-600">
        {visibility.notice} 정보가 적다는 것이 성장하지 않는다는 뜻은 아닙니다.
      </p>
    </StepShell>
  );
}
