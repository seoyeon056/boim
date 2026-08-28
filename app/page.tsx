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
  {
    title: "거래 기록으로 성장을 보여야 하는 기업",
    body: "거래명세서·세금계산서만 있으면 성장 근거를 문서로 정리해 드립니다.",
  },
  {
    title: "투자·대출 앞두고 자료가 필요한 기업",
    body: "외부 공개정보와 내부 거래를 함께 담은 진단서를 바로 발급합니다.",
  },
];

const SIGNAL_WORDS = [
  { text: "거래명세서", top: 12, left: 6, size: 20, dur: 14, delay: 0 },
  { text: "세금계산서", top: 68, left: 3, size: 18, dur: 19, delay: 3 },
  { text: "재구매율 80%", top: 30, left: 78, size: 22, dur: 16, delay: 1 },
  { text: "발주서", top: 82, left: 71, size: 19, dur: 14, delay: 5 },
  { text: "거래처 +150%", top: 8, left: 62, size: 24, dur: 21, delay: 2 },
  { text: "뉴스 0건", top: 46, left: 88, size: 18, dur: 15, delay: 6 },
  { text: "입금내역", top: 88, left: 34, size: 19, dur: 18, delay: 4 },
  { text: "특허 5건", top: 20, left: 40, size: 17, dur: 20, delay: 7 },
  { text: "계약서", top: 58, left: 14, size: 21, dur: 14, delay: 2 },
  { text: "견적서", top: 76, left: 52, size: 18, dur: 16, delay: 8 },
  { text: "채용공고 1건", top: 40, left: 24, size: 17, dur: 19, delay: 5 },
  { text: "거래 집중도 45%", top: 62, left: 84, size: 19, dur: 14, delay: 9 },
];

function SignalField() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 select-none">
      {SIGNAL_WORDS.map((w) => (
        <span
          key={w.text}
          className="signal-word absolute whitespace-nowrap font-mono"
          style={{
            top: `${w.top}%`,
            left: `${w.left}%`,
            fontSize: `${w.size}px`,
            color: "#B4A79A",
            animationDuration: `${w.dur}s`,
            animationDelay: `-${w.delay}s`,
          }}
        >
          {w.text}
        </span>
      ))}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/10 to-transparent" />
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
            <span className="animate-fade-in-up text-[14px] font-semibold tracking-tight text-zinc-500" style={{ animationDelay: "0ms" }}>
              기업 성장 진단 서비스
            </span>
            <h1 className="animate-fade-in-up text-[2.75rem] font-semibold leading-[1.1] tracking-[-0.03em] text-zinc-900 md:text-[3.5rem]" style={{ animationDelay: "60ms" }}>
              안 보이던 기업을
              <br />
              <span className="font-serif italic font-normal text-zinc-400">데이터로 증명합니다.</span>
            </h1>
            <p className="animate-fade-in-up max-w-2xl text-[18px] leading-[1.75] text-zinc-600" style={{ animationDelay: "120ms" }}>
              공개 정보만 보는 기존 평가와 달리, 내부 거래 문서까지 함께 분석해 보이지 않던 성장을 증명합니다.
            </p>
            <div className="animate-fade-in-up pt-1" style={{ animationDelay: "180ms" }}>
              <Link
                href="/company"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-zinc-900 px-7 text-[15px] font-semibold text-white shadow-sm transition-all hover:bg-zinc-700 active:scale-[0.98]"
              >
                기업 진단 시작하기
                <span aria-hidden className="text-base leading-none">→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-10 pb-16 pt-14">
        <div className="flex flex-col gap-5">
          <span className="text-[14px] font-bold tracking-tight text-zinc-600">이런 기업에게 필요합니다</span>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {highlights.map((item) => (
              <div key={item.title} className="flex flex-col gap-2.5 rounded-lg border border-zinc-100 bg-white px-6 py-6 transition-shadow hover:shadow-sm">
                <p className="text-[16px] font-semibold leading-[1.45] text-zinc-900">{item.title}</p>
                <p className="text-[15px] leading-[1.65] text-zinc-600">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
