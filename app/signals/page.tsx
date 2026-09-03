import Link from "next/link";
import { readCompanyId, withCompany } from "@/lib/company-link";
import StepShell from "@/app/step-shell";
import { SignalsView } from "./signals-view";

// 이 화면의 성장 신호는 사용자가 올려 검수한 거래(sessionStorage)에서만 나온다.
// 서버는 그걸 볼 수 없으므로 여기서는 껍데기만 그리고, 계산·표시는 SignalsView가 한다.
export default async function SignalsPage(props: PageProps<"/signals">) {
  const companyId = readCompanyId((await props.searchParams).company);

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
          className="inline-flex h-[50px] items-center justify-center rounded-md bg-[#2A211C] px-10 text-[16px] font-semibold text-white transition-colors hover:bg-[#12100E]"
        >
          외부와 내부 비교하기
        </Link>
      }
    >
      <SignalsView companyId={companyId} />
    </StepShell>
  );
}
