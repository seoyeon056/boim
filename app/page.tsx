import Link from "next/link";

const highlights = [
  {
    title: "뉴스·특허·채용 정보가 적은 B2B 제조기업",
    body: "외부에 잘 드러나지 않는 기업일수록 BO:IM의 진단이 필요합니다.",
  },
  {
    title: "거래는 느는데 평가엔 반영되지 않는 기업",
    body: "신용평가는 여전히 공개 정보 중심이라 실제 성장이 가려집니다.",
  },
];

const SIGNAL_WORDS = [
  { text: "거래명세서", top: 12, left: 6, size: 15, dur: 26, delay: 0 },
  { text: "세금계산서", top: 68, left: 3, size: 13, dur: 34, delay: 3 },
  { text: "재구매율 80%", top: 30, left: 78, size: 17, dur: 30, delay: 1 },
  { text: "발주서", top: 82, left: 71, size: 14, dur: 24, delay: 5 },
  { text: "거래처 +150%", top: 8, left: 62, size: 19, dur: 38, delay: 2 },
  { text: "뉴스 0건", top: 46, left: 88, size: 13, dur: 28, delay: 6 },
  { text: "입금내역", top: 88, left: 34, size: 14, dur: 32, delay: 4 },
  { text: "특허 5건", top: 20, left: 40, size: 12, dur: 36, delay: 7 },
  { text: "계약서", top: 58, left: 14, size: 16, dur: 22, delay: 2 },
  { text: "견적서", top: 76, left: 52, size: 13, dur: 30, delay: 8 },
  { text: "채용공고 1건", top: 40, left: 24, size: 12, dur: 34, delay: 5 },
  { text: "거래 집중도 45%", top: 62, left: 84, size: 14, dur: 26, delay: 9 },
];

function SignalField() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 select-none">
      {SIGNAL_WORDS.map((w) => (
        <span
          key={w.text}
          className="signal-word absolute whitespace-nowrap font-mono text-zinc-300"
          style={{
            top: `${w.top}%`,
            left: `${w.left}%`,
            fontSize: `${w.size}px`,
            animationDuration: `${w.dur}s`,
            animationDelay: `-${w.delay}s`,
          }}
        >
          {w.text}
        </span>
      ))}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/70 to-transparent" />
    </div>
  );
}

export default function Home() {
  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-zinc-100">
        <SignalField />
        <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-10 py-28 text-center md:py-36">
          <div className="flex max-w-3xl flex-col items-center gap-6">
            <span className="animate-fade-in-up text-xs font-semibold tracking-tight text-zinc-400" style={{ animationDelay: "0ms" }}>
              기업 성장 진단 서비스
            </span>
            <h1 className="animate-fade-in-up text-[2.75rem] font-semibold leading-[1.1] tracking-[-0.03em] text-zinc-900 md:text-[3.5rem]" style={{ animationDelay: "60ms" }}>
              안 보이던 기업을
              <br />
              <span className="font-serif italic font-normal text-zinc-400">데이터로 증명합니다.</span>
            </h1>
            <p className="animate-fade-in-up max-w-xl text-[15px] leading-[1.75] text-zinc-500" style={{ animationDelay: "120ms" }}>
              공개 정보만 보는 기존 평가와 달리, 내부 거래 문서까지 함께 분석해 보이지 않던 성장을 증명합니다.
            </p>
            <div className="animate-fade-in-up pt-1" style={{ animationDelay: "180ms" }}>
              <Link href="/company" className="inline-flex h-11 items-center justify-center rounded-md bg-zinc-900 px-6 text-sm font-medium text-white transition-all hover:bg-zinc-700 active:scale-[0.98]">
                기업 진단 시작하기
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-10 py-12">
        <div className="flex flex-col gap-5">
          <span className="text-xs font-bold tracking-tight text-zinc-500">이런 기업에게 필요합니다</span>
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-zinc-100 bg-zinc-100 sm:grid-cols-2 lg:grid-cols-4">
            {highlights.map((item) => (
              <div key={item.title} className="flex flex-col gap-2 bg-white px-5 py-5 transition-shadow hover:shadow-sm">
                <p className="text-[13px] font-semibold leading-[1.5] text-zinc-900">{item.title}</p>
                <p className="text-[13px] leading-[1.65] text-zinc-500">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
