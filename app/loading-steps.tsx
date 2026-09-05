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
  slowAfterMs,
  slowNote,
  showElapsed = false,
  overlay = false,
}: {
  title: string;
  steps: string[];
  stepMs?: number;
  // 이 시간을 넘기면 아래에 덧붙일 안내. 없으면 아무것도 붙이지 않는다.
  slowAfterMs?: number;
  slowNote?: string;
  // 기다린 시간을 초로 보여 준다. 문구가 다 지나간 뒤에도 숫자가 계속 움직여야
  // 멈춘 게 아니라는 걸 알 수 있다.
  showElapsed?: boolean;
  // 화면 가운데에 띄운다. 다음 화면으로 넘어가는 동안처럼, 기다리는 것 말고
  // 할 수 있는 일이 없을 때만 쓴다.
  overlay?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [slow, setSlow] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      // 마지막 문구에서 멈춘다. 실제 작업이 끝나면 이 카드가 사라진다.
      setIndex((prev) => (prev < steps.length - 1 ? prev + 1 : prev));
    }, stepMs);

    return () => clearInterval(timer);
  }, [steps.length, stepMs]);

  // 1초마다 올린다. 숫자가 움직이는 것 자체가 "멈추지 않았다"는 신호다.
  useEffect(() => {
    if (!showElapsed) {
      return;
    }
    const timer = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [showElapsed]);

  // 문구가 다 지나갔는데도 끝나지 않으면, 멈춘 게 아니라 기다리는 중임을 알린다.
  useEffect(() => {
    if (!slowAfterMs || !slowNote) {
      return;
    }
    const timer = setTimeout(() => setSlow(true), slowAfterMs);
    return () => clearTimeout(timer);
  }, [slowAfterMs, slowNote]);

  const card = (
    <div
      role="status"
      aria-live="polite"
      className={`animate-fade-in rounded-md border border-zinc-100 bg-white px-4 py-3.5 ${
        overlay ? "w-full max-w-sm shadow-xl" : ""
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-zinc-200"
          style={{ borderTopColor: "#1D4533" }}
        />
        <p className="text-[13px] font-semibold text-zinc-900">{title}</p>
        {showElapsed && (
          <span className="ml-auto font-mono text-[12px] tabular-nums text-zinc-400">
            {elapsed}초째 기다리는 중
          </span>
        )}
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

      {slow && slowNote && (
        <p className="mt-3 border-t border-zinc-100 pt-2.5 text-[12px] leading-5 text-zinc-500">
          {slowNote}
        </p>
      )}
    </div>
  );

  if (!overlay) {
    return card;
  }

  return (
    <div
      aria-modal
      role="dialog"
      // 위치를 클래스에 맡기지 않는다. inset-0 이 적용되지 않아 카드가 원래
      // 자리에 그대로 떠 있고 화면을 덮지 못한 적이 있다(실측: 뷰포트
      // 1280×720 인데 덮은 영역이 776×336).
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 1.5rem",
        background: "rgba(24, 24, 27, 0.25)",
      }}
    >
      {card}
    </div>
  );
}
