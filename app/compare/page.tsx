import Link from "next/link";
import { getVisibility } from "@/lib/engine";
import { readCompanyId, withCompany } from "@/lib/company-link";
import { CompareView } from "./compare-view";

// 국민연금 사업장명 검색이 9초 안팎으로 고정 지연이 있다(공공데이터포털 쪽
// 응답 속도이고, 페이지 크기를 줄여도 같다). 배포 환경의 기본 함수 타임아웃에
// 걸리면 고용 축만 "확인 불가"가 되는 게 아니라 화면 전체가 죽는다.
export const maxDuration = 30;

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
