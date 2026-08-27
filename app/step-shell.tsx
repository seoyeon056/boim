import type { ReactNode } from "react";
import Link from "next/link";

// 상단 가로 절차 바 + 짧은 좌측 표제 + 하단 우측 액션.
// 진단 흐름(STEP 1~6)의 모든 화면이 이 껍데기를 공유한다.

interface StepShellProps {
  step: string;
  title: string;
  description: string;
  backTo: string;
  backLabel?: string;
  aside?: ReactNode;
  footer?: ReactNode;
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
  footer,
  children,
}: StepShellProps) {
  const currentNo = step.replace(/[^0-9]/g, "").padStart(2, "0");

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col px-10 py-8">
      <Link
        href={backTo}
        className="inline-flex items-center gap-1.5 self-start text-[11px] text-zinc-400 transition-colors hover:text-zinc-700"
      >
        ← {backLabel}
      </Link>

      {/* 절차 — 가로 바 */}
      <nav className="mt-5 flex border-t border-zinc-900">
        {FLOW_STEPS.map((flowStep) => {
          const done = flowStep.no < currentNo;
          const active = flowStep.no === currentNo;

          return (
            <div
              key={flowStep.no}
              className="flex flex-1 items-center gap-2 py-3"
              style={{
                borderTop: `2px solid ${
                  active ? "#16191B" : done ? "#BDB5A6" : "transparent"
                }`,
                marginTop: -1,
              }}
            >
              <span
                className={`font-mono text-[11px] tabular-nums ${
                  active
                    ? "font-bold text-zinc-900"
                    : done
                      ? "text-zinc-400"
                      : "text-zinc-300"
                }`}
              >
                {flowStep.no}
              </span>
              <span
                className={`hidden truncate text-[11px] md:inline ${
                  active
                    ? "font-medium text-zinc-900"
                    : done
                      ? "text-zinc-400"
                      : "text-zinc-300"
                }`}
              >
                {flowStep.label}
              </span>
            </div>
          );
        })}
      </nav>

      <div className="grid flex-1 grid-cols-1 gap-10 border-t border-zinc-200 pt-8 md:grid-cols-[220px_1fr] md:gap-14">
        <aside className="flex flex-col md:sticky md:top-16 md:self-start">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-zinc-400">
            {step}
          </span>
          <h1 className="mt-2.5 text-[20px] font-bold leading-snug tracking-tight text-zinc-900">
            {title}
          </h1>
          <p className="mt-2.5 text-[13px] leading-6 text-zinc-500">
            {description}
          </p>
          {aside && (
            <div className="mt-5 border-t border-zinc-100 pt-4">{aside}</div>
          )}
          {/*
            예전 문구는 "외부에 공개되지 않습니다"였는데, 실제로는 업로드 파일을
            외부 OCR API로 통째로 보내고 있어서 사실과 달랐다. 지금은 인식까지
            브라우저에서 끝내므로 이 문장이 실제 동작과 일치한다.
          */}
          <p className="mt-6 border-t border-zinc-100 pt-4 text-[11px] leading-5 text-zinc-400">
            업로드한 문서는 이 브라우저 안에서 분석되며 서버로 전송되지 않습니다.
            입력한 값은 진단서 발급 전까지만 보관됩니다.
          </p>
        </aside>

        {/* key 를 단계 번호로 두어 화면이 바뀔 때마다 진입 애니메이션이 다시 실행된다. */}
        <div key={currentNo} className="step-enter flex min-w-0 flex-col">
          <div className="min-w-0 flex-1">{children}</div>
          {footer && (
            <div className="mt-10 flex justify-end border-t border-zinc-200 pt-5">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
