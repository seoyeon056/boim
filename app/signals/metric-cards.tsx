"use client";

import { useCountUp } from "@/lib/use-count-up";

// 지표 카드. 숫자가 차오르는 연출 때문에 클라이언트 컴포넌트로 둔다.
// 판정(긍정/주의)은 lib/signals.ts 계산 결과를 그대로 받아 색만 정한다.

export type MetricCardData = {
  label: string;
  target: number;
  prefix?: string;
  suffix?: string;
  description: string;
  status: string;
  // 긍정 / 보통 / 주의. 예전에는 caution 하나로만 갈랐는데, 지표가 여섯으로
  // 늘면서 "나쁘진 않지만 좋지도 않다"를 표현할 자리가 필요해졌다.
  tone: "positive" | "neutral" | "caution";
};

function MetricCard({
  label,
  target,
  prefix = "",
  suffix = "%",
  description,
  status,
  tone,
  delay = 0,
}: MetricCardData & { delay?: number }) {
  const shown = useCountUp(target, 900 + delay);

  return (
    <div
      className="flex flex-col justify-between gap-8 px-6 py-6"
      style={{
        backgroundColor:
          tone === "caution" ? "#F7E5DA" : tone === "neutral" ? "#F5F3EF" : "#FFFFFF",
      }}
    >
      <div className="flex flex-col">
        <span className="text-[11px] text-zinc-400">{label}</span>
        <span
          className="mt-1.5 font-mono text-[40px] font-medium leading-none tabular-nums"
          style={{
            color:
              tone === "caution" ? "#8A4A2E" : tone === "neutral" ? "#5B554E" : "#2A211C",
          }}
        >
          {prefix}
          {shown}
          {suffix}
        </span>
        <span className="mt-2.5 text-[13px] text-zinc-500">{description}</span>
      </div>
      <span
        className="text-[11px] font-medium"
        style={{
          color:
            tone === "caution" ? "#8A4A2E" : tone === "neutral" ? "#5B554E" : "#1D4533",
        }}
      >
        {status}
      </span>
    </div>
  );
}

export function MetricCards({ metrics }: { metrics: MetricCardData[] }) {
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg bg-zinc-100 md:grid-cols-3">
      {metrics.map((metric, i) => (
        // 카드마다 조금씩 늦게 차오르게 해서 순서가 읽히도록 한다.
        <MetricCard key={metric.label} {...metric} delay={i * 120} />
      ))}
    </div>
  );
}
