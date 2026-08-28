"use client";

import { useEffect, useState } from "react";

// 시간이 걸리는 작업의 진행 상태를 그 작업이 일어난 자리에 그대로 보여준다.
//
// 화면 전체를 덮는 모달은 배경이 탁해지고, 작업과 상관없는 영역까지 못 쓰게 만든다.
// 여기서는 오버레이 없이 카드 하나만 자리에 끼워 넣어 흐름이 끊기지 않게 한다.

export function LoadingSteps({
  title,
  steps,
  stepMs = 900,
}: {
  title: string;
  steps: string[];
  stepMs?: number;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      // 마지막 문구에서 멈춘다. 실제 작업이 끝나면 이 카드가 사라진다.
      setIndex((prev) => (prev < steps.length - 1 ? prev + 1 : prev));
    }, stepMs);

    return () => clearInterval(timer);
  }, [steps.length, stepMs]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-fade-in rounded-md border border-zinc-100 bg-white px-4 py-3.5"
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-zinc-200"
          style={{ borderTopColor: "#1D4533" }}
        />
        <p className="text-[13px] font-semibold text-zinc-900">{title}</p>
      </div>

      <ol className="mt-3 flex flex-col gap-2">
        {steps.map((step, i) => {
          const done = i < index;
          const current = i === index;

          return (
            <li
              key={step}
              className={`flex items-center gap-2.5 text-[12px] transition-colors ${
                current
                  ? "text-zinc-900"
                  : done
                    ? "text-zinc-400"
                    : "text-zinc-300"
              }`}
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 rounded-full transition-colors"
                style={{
                  backgroundColor: done
                    ? "#BCB0A9"
                    : current
                      ? "#1D4533"
                      : "#E9E2DD",
                }}
              />
              {step}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
