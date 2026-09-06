"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { withCompany } from "@/lib/company-link";
import { LoadingSteps } from "@/app/loading-steps";

// Step 05 → Step 06 비교 화면으로 가는 버튼.
//
// 링크 하나로 두면 누른 뒤 화면이 그대로 멈춘 것처럼 보인다. 비교 화면은
// 서버에서 외부 공개 API 네 곳을 다시 확인하고 오는데, 그 조회가 5분 캐시에
// 남아 있지 않으면(다른 인스턴스가 받거나 시간이 지난 경우) 처음 조회와 같은
// 시간이 걸린다. 실측: 공개 API가 느린 시간대에 십수 초.
//
// Step 01 에서 쓰는 것과 같은 안내 카드를 화면 가운데에 띄운다. 기다린 초가
// 계속 올라가므로 멈춘 것이 아님을 알 수 있다.
const COMPARE_STEPS = [
  "내부 거래에서 계산한 신호를 정리하는 중",
  "외부 공개 정보를 다시 확인하는 중",
  "두 결과를 나란히 맞추는 중",
];

export function CompareLink({ companyId }: { companyId?: string }) {
  const router = useRouter();
  const [isMoving, setIsMoving] = useState(false);

  return (
    <>
      <button
        type="button"
        disabled={isMoving}
        onClick={() => {
          setIsMoving(true);
          router.push(withCompany("/compare", companyId));
        }}
        className="inline-flex h-[50px] items-center justify-center rounded-md bg-[#2A211C] px-10 text-[16px] font-semibold text-white transition-colors hover:bg-[#12100E] disabled:opacity-70"
      >
        외부와 내부 비교하기
      </button>

      {isMoving && (
        <LoadingSteps
          title="외부와 내부를 맞춰 보는 중"
          steps={COMPARE_STEPS}
          stepMs={3500}
          slowAfterMs={12000}
          slowNote="공개 데이터 응답이 늦어지고 있습니다. 기다리는 중이며, 받는 대로 비교 화면으로 넘어갑니다."
          showElapsed
          overlay
        />
      )}
    </>
  );
}
