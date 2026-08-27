import Link from "next/link";
import { getSignals, getVisibility } from "@/lib/engine";
import { readCompanyId, withCompany } from "@/lib/company-link";
import { CompareView } from "./compare-view";

export default async function ComparePage(props: PageProps<"/compare">) {
  const companyId = readCompanyId((await props.searchParams).company);

  let visibility;
  let signalResult;

  try {
    [visibility, signalResult] = await Promise.all([
      getVisibility(companyId),
      getSignals(companyId),
    ]);
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
  return (
    <CompareView
      companyId={companyId}
      visibility={visibility}
      serverSignals={signalResult}
    />
  );
}
