import {
  ACTIVITY_CRITERIA,
  ACTIVITY_NOTE,
  POSITIVE_CRITERIA,
} from "@/lib/diagnosis";

// 성장 잠재력 등급과 그 기준 안내.
// 성장 신호(Step 05)와 비교 화면이 같은 표기를 쓰도록 한곳에 둔다.
export function GradeBadge({ grade }: { grade: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-zinc-400">활동 수준</span>
      <span
        className="text-[18px] font-semibold leading-none"
        style={{ color: "#1D4533" }}
      >
        {grade}
      </span>

      {/* 기준 안내 — 마우스를 올리거나 포커스하면 열린다. */}
      <span className="group relative flex items-center">
        <span
          tabIndex={0}
          role="button"
          aria-label="활동 수준 기준 보기"
          className="flex h-4 w-4 cursor-default items-center justify-center rounded-full bg-zinc-100 text-[10px] font-semibold text-zinc-500"
        >
          i
        </span>
        <span className="pointer-events-none absolute right-0 top-full z-20 mt-1.5 w-80 rounded-md bg-zinc-900 px-3.5 py-3 text-[11px] leading-5 text-white opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          {/* 무엇이 "긍정"인지 먼저 밝힌다. 이게 없으면 등급이 어디서 나온
              값인지 알 수 없다. */}
          <span className="flex flex-col gap-0.5">
            {POSITIVE_CRITERIA.map((item) => (
              <span key={item.label} className="flex gap-2">
                <span className="w-32 shrink-0 text-zinc-400">
                  {item.label}
                </span>
                <span>{item.rule}</span>
              </span>
            ))}
          </span>

          <span className="mt-2.5 block border-t border-zinc-700 pt-2.5">
            {ACTIVITY_NOTE}
          </span>

          <span className="mt-1.5 flex flex-col gap-0.5">
            {ACTIVITY_CRITERIA.map((item) => (
              <span key={item.grade} className="flex gap-2">
                <span className="w-10 shrink-0">{item.grade}</span>
                <span className="text-zinc-300">{item.rule}</span>
              </span>
            ))}
          </span>
        </span>
      </span>
    </div>
  );
}
