"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

// 시간이 걸리는 작업의 진행 상태를 보여준다.
//
// 기본은 작업이 일어난 자리에 그대로 끼워 넣는 카드다. overlay 를 켜면 화면
// 가운데에 띄운다.

// 서버 렌더에서는 document 가 없어 포털을 만들 수 없다. 이 훅은 서버에서 false,
// 브라우저에서 true 를 준다. effect 안에서 setState 하지 않으므로
// react-hooks/set-state-in-effect 에 걸리지 않는다(docs/UI-HANDOFF.md 4장).
const subscribeToNothing = () => () => {};

function useIsBrowser() {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}

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
  const isBrowser = useIsBrowser();
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
      className={`animate-fade-in overflow-hidden border bg-white ${
        overlay
          ? "w-full max-w-sm rounded-[14px]"
          : "rounded-md border-zinc-100 px-4 py-3.5"
      }`}
      style={
        overlay
          ? {
              borderColor: "#ece5df",
              // 덮는 면을 없앴으므로 카드가 떠 있다는 느낌은 그림자가 진다.
              // 넓고 옅은 것 하나, 좁고 진한 것 하나를 겹친다.
              boxShadow:
                "0 32px 64px -20px rgba(42,33,28,0.30), 0 6px 18px -6px rgba(42,33,28,0.14)",
            }
          : undefined
      }
    >
      {/* 문구가 다 지나간 뒤에도 이 선이 남아 카드가 살아 있음을 보인다. */}
      {overlay && (
        <div aria-hidden style={{ height: 2, background: "#efe9e4" }}>
          <div
            style={{
              height: 2,
              borderRadius: 1,
              background: "#1D4533",
              width: `${Math.round(((index + 1) / steps.length) * 100)}%`,
              transition: "width 400ms cubic-bezier(0.22, 0.61, 0.36, 1)",
            }}
          />
        </div>
      )}

      <div className={overlay ? "px-[22px] pt-5" : ""}>
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
                  boxShadow: current ? "0 0 0 3px rgba(29,69,51,0.12)" : undefined,
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
      {overlay && <div className="h-[18px]" />}
    </div>
  );

  if (!overlay) {
    return card;
  }

  if (!isBrowser) {
    return null;
  }

  // body 로 옮겨서 띄운다.
  //
  // 예전에는 이 자리에 그대로 두고 position: fixed 만 걸었다. 그런데 결과 목록을
  // 감싼 .step-enter 에 등장 애니메이션이 남긴 transform 이 있고(animation ...
  // both), transform 이 걸린 요소는 그 안의 fixed 요소에게 화면 대신 자기 자신이
  // 기준이 된다. 그래서 덮은 영역이 화면이 아니라 목록 칸 크기가 됐고(실측
  // 776×1775, 뷰포트 1377×901), 카드도 그 칸의 한가운데인 y≈960 — 화면 밖 —
  // 에 놓였다. 목록이 길수록 더 내려갔다.
  //
  // 예전에 이걸 "inset-0 클래스가 안 먹는다"로 보고 인라인 style 로 바꿨는데,
  // 원인이 아니었으므로 증상이 그대로 남아 있었다. body 로 옮기면 사이에
  // transform 을 가진 요소가 없어 화면이 기준이 된다.
  return createPortal(
    <div
      aria-modal
      role="dialog"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 1.5rem",
        // 어둡게 덮는 사각형 대신, 카드에서 배경색이 타원으로 번지게 해
        // 주변을 지운다. 가장자리가 완전히 투명해서 경계선이 보이지 않는다.
        background:
          "radial-gradient(ellipse 1000px 760px at center, rgba(246,241,237,0.97) 0%, rgba(246,241,237,0.86) 34%, rgba(246,241,237,0.42) 58%, rgba(246,241,237,0) 76%)",
      }}
    >
      {card}
    </div>,
    document.body,
  );
}
