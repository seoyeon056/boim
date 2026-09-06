"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { LoadingSteps } from "@/app/loading-steps";

// 누르고 나서 다음 화면이 나올 때까지 기다려야 하는 이동.
//
// 그냥 링크로 두면 누른 뒤 화면이 그대로 멈춘 것처럼 보인다. 외부 공개 API 를
// 서버에서 확인하고 오는 화면(/visibility·/compare)이 그렇고, 그 화면으로
// 되돌아가는 길도 마찬가지다. 조회 결과가 5분 캐시에 남아 있지 않으면 처음
// 조회와 같은 시간이 걸린다.
//
// 누르는 순간 안내 카드를 화면 가운데에 띄운다. 기다린 초가 계속 올라가므로
// 멈춘 것이 아님을 알 수 있다.
// 링크가 아니라 버튼이라 Next 의 자동 프리페치가 걸리지 않는다. 마우스를 올리거나
// 초점이 닿는 순간 미리 받아 둔다. 그 사이 서버가 외부 조회를 끝내 두면 실제로
// 누를 때는 기다릴 것이 없다.
export function WaitingLink({
  href,
  className,
  children,
  title,
  steps,
  slowNote,
  overlayTint,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  title: string;
  steps: string[];
  slowNote: string;
  // 카드 주위로 번지는 빛의 색. 그 화면의 배경색을 넘긴다.
  overlayTint?: string;
}) {
  const router = useRouter();
  const [isMoving, setIsMoving] = useState(false);
  const warmed = useRef(false);

  function warm() {
    if (warmed.current) return;
    warmed.current = true;
    router.prefetch(href);
  }

  return (
    <>
      <button
        type="button"
        disabled={isMoving}
        onMouseEnter={warm}
        onFocus={warm}
        onClick={() => {
          setIsMoving(true);
          router.push(href);
        }}
        className={className}
      >
        {children}
      </button>

      {isMoving && (
        <LoadingSteps
          title={title}
          steps={steps}
          stepMs={3500}
          slowAfterMs={12000}
          slowNote={slowNote}
          showElapsed
          overlay
          overlayTint={overlayTint}
        />
      )}
    </>
  );
}
