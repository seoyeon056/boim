"use client";

import { useEffect, useState } from "react";

// 목표값까지 부드럽게 차오르는 숫자.
//
// 상태로 "값"이 아니라 "진행률"을 들고, 표시값은 target에서 파생시킨다.
// 값을 상태로 들면 target이 바뀌어도 따라가지 못하는 경우가 생긴다. 실제로
// prefers-reduced-motion 환경에서 effect가 그냥 돌아가는 바람에 초기값에 머물렀고,
// 서버가 렌더한 예시 수치가 그대로 남았다. 카드 숫자만 예시값이고 설명은 업로드
// 문서의 값이라 "150% / 1곳 → 1곳"처럼 앞뒤가 맞지 않았다.
//
// 진행률의 초기값이 1이라, 모션을 끈 사용자는 effect가 아무것도 하지 않아도
// 항상 target을 보게 된다. 서버 렌더 결과와도 일치해 하이드레이션 경고가 없다.
export function useCountUp(target: number, duration = 900): number {
  const [progress, setProgress] = useState(1);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (prefersReducedMotion) {
      return;
    }

    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = Math.min(1, (now - start) / duration);
      setProgress(1 - Math.pow(1 - elapsed, 3));

      if (elapsed < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  // 목표값이 소수를 가지면 그대로 살린다. 반올림해 뭉개면 카드에는 95%,
  // 리포트에는 95.4%가 떠서 같은 지표가 화면마다 다르게 보인다.
  const decimals = (String(target).split(".")[1] ?? "").length;
  return Number((target * progress).toFixed(decimals));
}
