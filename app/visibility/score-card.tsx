"use client";

import { useCountUp } from "@/lib/use-count-up";

// 점수 카드. 비교 화면의 잉크 면과 같은 언어를 쓴다.
// 숫자가 차오르는 연출 때문에 클라이언트 컴포넌트로 분리했다.
export function ScoreCard({
  score,
  interpretation,
}: {
  score: number;
  interpretation: string;
}) {
  const shown = useCountUp(score, 900);
  const pct = Math.min(100, Math.max(0, score));

  return (
    <div
      className="flex flex-col justify-between rounded-lg px-7 py-7"
      style={{ backgroundColor: "#3A2C25" }}
    >
      <div>
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-zinc-500">
          External
        </span>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-mono text-[52px] font-medium leading-none tabular-nums text-white">
            {shown}
          </span>
          <span className="text-[13px] text-zinc-500">/ 100</span>
        </div>
        <p className="mt-2.5 text-[13px] text-zinc-400">
          가시성 점수 · {interpretation}
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-2">
        <div
          className="h-1.5 w-full overflow-hidden rounded-full"
          style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              backgroundColor: "#E8A87F",
              transition: "width 900ms cubic-bezier(0.22,0.61,0.36,1)",
            }}
          />
        </div>
        <div className="flex justify-between font-mono text-[11px] text-zinc-600">
          <span>0</span>
          <span>100</span>
        </div>
      </div>
    </div>
  );
}
