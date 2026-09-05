import Link from "next/link";
import { getVisibility } from "@/lib/engine";
import { readCompanyId, withCompany } from "@/lib/company-link";
import { CompareView } from "./compare-view";

// 국민연금 사업장명 검색이 공공데이터포털 쪽 사정으로 느려질 때가 있다.
// 배포본 실측(2026-09-05): LG전자 29.6초, SK하이닉스 19.2초, 삼성전자 17.2초.
// 상한이 30초면 가장 느린 조회가 상한에 닿아 고용 축만 "확인 불가"가 되는 게
// 아니라 화면 전체가 죽는다. 여유를 조금 두되, 사람이 기다릴 수 있는 선을
// 넘지 않도록 40초로 둔다.
//
// 이 값은 상한일 뿐이라 평소 속도에는 영향이 없다. 3초에 끝나는 조회는 3초에
// 끝난다.
export const maxDuration = 40;

export default async function ComparePage(props: PageProps<"/compare">) {
  const companyId = readCompanyId((await props.searchParams).company);

  let visibility;

  try {
    visibility = await getVisibility(companyId);
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
  // 내부 성장 신호는 브라우저의 검수 결과에서만 나오므로 CompareView가 직접 읽는다.
  return <CompareView companyId={companyId} visibility={visibility} />;
}
