import type { ReactNode } from "react";
import Link from "next/link";

// 기관 문서 톤의 2단 레이아웃 — 왼쪽 표제/안내, 오른쪽 내용.
// 진단 흐름(STEP 1~6)의 모든 화면이 이 껍데기를 공유한다.

interface StepShellProps {
  step: string;
  title: string;
  description: string;
  backTo: string;
  backLabel?: string;
  aside?: ReactNode;
  children: ReactNode;
}

const FLOW_STEPS = [
  { no: "01", label: "기업 검색" },
  { no: "02", label: "외부 가시성" },
  { no: "03", label: "문서 업로드" },
  { no: "04", label: "분석 결과 확인" },
  { no: "05", label: "성장 신호·비교" },
  { no: "06", label: "진단서 발급" },
];

export default function StepShell({
  step,
  title,
  description,
  backTo,
  backLabel = "이전으로",
  aside,
  children,
}: StepShellProps) {
  const currentNo = step.replace(/[^0-9]/g, "").padStart(2, "0");

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col px-10 py-10">
      <Link
        href={backTo}
        className="inline-flex items-center gap-1.5 self-start text-xs text-zinc-400 transition-colors hover:text-zinc-600"
      >
        ← {backLabel}
      </Link>

      <div className="mt-6 grid flex-1 grid-cols-1 gap-10 border-t border-zinc-900 pt-8 md:grid-cols-[280px_1fr] md:gap-16">
        <aside className="flex flex-col md:sticky md:top-20 md:self-start">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-zinc-400">
            {step}
          </span>
          <h1 className="mt-3 text-[22px] font-bold leading-snug tracking-tight text-zinc-900">
            {title}
          </h1>
          <p className="mt-3 text-[13px] leading-6 text-zinc-500">
            {description}
          </p>
          {aside && (
            <div className="mt-6 border-t border-zinc-100 pt-5">{aside}</div>
          )}

          <div className="mt-8 border-t border-zinc-100 pt-5">
            <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-300">
              진단 절차
            </p>
            <ol className="flex flex-col">
              {FLOW_STEPS.map((flowStep) => {
                const done = flowStep.no < currentNo;
                const active = flowStep.no === currentNo;

                return (
                  <li
                    key={flowStep.no}
                    className={`flex items-center gap-3 border-l py-2 pl-3 text-[12px] ${
                      active
                        ? "border-zinc-900 font-bold text-zinc-900"
                        : done
                          ? "border-zinc-200 text-zinc-400"
                          : "border-zinc-100 text-zinc-300"
                    }`}
                  >
                    <span className="font-mono text-[11px] tabular-nums">
                      {flowStep.no}
                    </span>
                    <span>{flowStep.label}</span>
                  </li>
                );
              })}
            </ol>
          </div>

          <p className="mt-8 max-w-[240px] border-t border-zinc-100 pt-4 text-[11px] leading-5 text-zinc-400">
            입력한 문서와 값은 진단서 발급 전까지만 보관되며, 외부에 공개되지
            않습니다.
          </p>
        </aside>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
