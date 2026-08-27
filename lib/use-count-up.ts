"use client";

import { useEffect, useState } from "react";

// 목표값까지 부드럽게 차오르는 숫자.
// prefers-reduced-motion 이면 애니메이션 없이 목표값을 그대로 쓴다.
//
// 초기값을 target 으로 두는 이유:
//  - 서버 렌더 결과와 첫 클라이언트 렌더가 같아야 하이드레이션 경고가 없다.
//  - 모션을 끈 사용자는 이 값이 그대로 남는다(effect 에서 손대지 않는다).
//  - 애니메이션을 쓰는 경우에만 effect 안 rAF 콜백이 0부터 다시 올린다.
export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(target);

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
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);

      setValue(target * eased);

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return Math.round(value);
}
