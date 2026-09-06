"use client";

import { withCompany } from "@/lib/company-link";
import { WaitingLink } from "@/app/waiting-link";

// Step 05 → 비교 화면. 비교 화면은 서버에서 외부 공개 API 네 곳을 다시 확인하고
// 온다(app/waiting-link.tsx).
const COMPARE_STEPS = [
  "내부 거래에서 계산한 신호를 정리하는 중",
  "외부 공개 정보를 다시 확인하는 중",
  "두 결과를 나란히 맞추는 중",
];

export function CompareLink({ companyId }: { companyId?: string }) {
  return (
    <WaitingLink
      href={withCompany("/compare", companyId)}
      title="외부와 내부를 맞춰 보는 중"
      steps={COMPARE_STEPS}
      slowNote="공개 데이터 응답이 늦어지고 있습니다. 기다리는 중이며, 받는 대로 비교 화면으로 넘어갑니다."
      className="inline-flex h-[50px] items-center justify-center rounded-md bg-[#2A211C] px-10 text-[16px] font-semibold text-white transition-colors hover:bg-[#12100E] disabled:opacity-70"
    >
      외부와 내부 비교하기
    </WaitingLink>
  );
}
