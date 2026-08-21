"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TOTAL_STEPS = 6;

// 진단 흐름 안에서만 진행 표시기를 띄운다. 랜딩(/)처럼 흐름 밖 경로는 0이 되어 숨겨진다.
const STEP_MAP: Record<string, number> = {
  "/company": 1,
  "/visibility": 2,
  "/upload": 3,
  "/processing": 3,
  "/review": 4,
  "/signals": 5,
  "/compare": 5,
  "/share": 6,
};

export default function Header() {
  const pathname = usePathname();
  const step = STEP_MAP[pathname] ?? 0;
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
        <div className="flex items-center gap-1.5">
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
          <span className="ml-1 font-mono text-[10px] text-zinc-400">
            {step}/{TOTAL_STEPS}
          </span>
        </div>
      )}
    </header>
  );
}
