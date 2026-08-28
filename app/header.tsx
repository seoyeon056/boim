"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TOTAL_STEPS = 6;

// 진단 흐름 안에서만 진행 표시기를 띄운다. 랜딩(/)처럼 흐름 밖 경로는 0이 되어 숨겨진다.
const STEP_MAP: Record<string, { no: number; label: string }> = {
  "/company": { no: 1, label: "기업 검색" },
  "/visibility": { no: 2, label: "외부 가시성" },
  "/upload": { no: 3, label: "문서 업로드" },
  "/processing": { no: 3, label: "문서 분석" },
  "/review": { no: 4, label: "분석 결과 확인" },
  "/signals": { no: 5, label: "성장 신호·비교" },
  "/compare": { no: 5, label: "성장 신호·비교" },
  "/share": { no: 6, label: "진단서 발급" },
};

export default function Header() {
  const pathname = usePathname();
  const current = STEP_MAP[pathname];
  const step = current?.no ?? 0;
  const inFlow = step > 0;

  return (
    <header className="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-zinc-100 bg-white/90 px-6 backdrop-blur-sm">
      <Link
        href="/"
        className="font-mono text-sm font-semibold tracking-widest text-zinc-900 transition-opacity hover:opacity-70"
      >
        BO<span className="text-zinc-300">:</span>IM
      </Link>
      {inFlow && (
        <div className="flex items-center gap-1.5 md:hidden">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${
                i + 1 < step
                  ? "w-4 bg-zinc-300"
                  : i + 1 === step
                    ? "w-5 bg-zinc-800"
                    : "w-4 bg-zinc-100"
              }`}
            />
          ))}
          <span className="ml-2 font-mono text-[13px] font-medium text-zinc-600">
            {step}/{TOTAL_STEPS}
          </span>
          <span className="text-[13px] text-zinc-600">{current?.label}</span>
        </div>
      )}
    </header>
  );
}
