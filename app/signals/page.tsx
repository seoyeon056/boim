import Link from "next/link";
import { getSignals } from "@/lib/engine";
import { readCompanyId, withCompany } from "@/lib/company-link";
import StepShell from "@/app/step-shell";
import { SignalsView } from "./signals-view";




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

  return (
    <StepShell
      step="Step 05"
      title="내부 성장 신호"
      description="내부 거래 문서에서 확인된 핵심 지표입니다."
      backTo={withCompany("/review", companyId)}
      companyId={companyId}
      footer={
        <Link
          href={withCompany("/compare", companyId)}
          className="inline-flex h-11 items-center justify-center rounded-md bg-zinc-900 px-8 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
        >
          외부와 내부 비교하기
        </Link>
      }
    >
      <SignalsView serverSignals={result} />
    </StepShell>
  );
}
