import Link from "next/link";

import { FlowReset } from "./flow-reset";

const highlights = [
  {
    no: "01",
    title: "뉴스·특허 등 공개 정보가 적은 B2B 제조기업",
    body: "외부에 잘 드러나지 않는 기업일수록 BO:IM의 진단이 필요합니다.",
  },
  {
    no: "02",
    title: "거래는 느는데 평가엔 반영되지 않는 기업",
    body: "신용평가는 여전히 공개 정보 중심이라 실제 성장이 가려집니다.",
  },
  {
    no: "03",
    title: "거래 기록으로 성장을 보여야 하는 기업",
    body: "거래명세서·세금계산서만 있으면 성장 근거를 문서로 정리해 드립니다.",
  },
  {
    no: "04",
    title: "투자·대출 앞두고 자료가 필요한 기업",
    body: "외부 공개정보와 내부 거래를 함께 담은 진단서를 바로 발급합니다.",
  },
];

// 열두 개를 화면 전체에 흩어 두니 중앙 제목·본문과 겹쳐 지저분했다.
// 일곱 개만 남기고 좌우 영역(왼쪽 4~7%, 오른쪽 76~86%)에 둔다.
// 가장자리에만 붙지 않도록 안쪽으로 조금 벌리되, 드리프트(+28px)를 감안해
// 중앙 문장과는 떼어 놓는다.
const SIGNAL_WORDS = [
  { text: "거래명세서", top: 14, left: 4, size: 21, dur: 16, delay: 0 },
  { text: "세금계산서", top: 70, left: 6, size: 19, dur: 19, delay: 3 },
  { text: "재구매율 80%", top: 34, left: 77, size: 23, dur: 16, delay: 1 },
  { text: "거래처 +150%", top: 12, left: 79, size: 24, dur: 21, delay: 2 },
  { text: "뉴스 0건", top: 58, left: 85, size: 19, dur: 15, delay: 6 },
  { text: "발주서", top: 86, left: 80, size: 20, dur: 14, delay: 5 },
  { text: "입금내역", top: 42, left: 5, size: 20, dur: 18, delay: 4 },
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
            color: "#A79F95",
            animationDuration: `${w.dur}s`,
            animationDelay: `-${w.delay}s`,
          }}
        >
          {w.text}
        </span>
      ))}
    </div>
  );
}

export default function Home() {
  return (
    // 랜딩은 헤더(3rem)를 뺀 화면 높이에 딱 맞춘다. 히어로가 남는 세로 공간을
    // 전부 차지하며 내용을 가운데 정렬하고, 카드 줄은 바닥에 붙어 스크롤 없이
    // 한 화면에 들어온다. (글자 크기·간격은 그대로, 여백만 유동적으로 조절)
    <div className="flex min-h-[calc(100dvh-3rem)] flex-col">
      <FlowReset />
      <section className="relative isolate flex flex-1 items-center overflow-hidden border-b border-zinc-100">
        <SignalField />
        <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-10 py-10 text-center">
          <div className="flex max-w-3xl flex-col items-center gap-6">
            <span className="animate-fade-in-up text-[15px] font-semibold tracking-tight text-zinc-600" style={{ animationDelay: "0ms" }}>
              기업 성장 진단 서비스
            </span>
            <h1 className="animate-fade-in-up text-[2.75rem] font-semibold leading-[1.12] tracking-[-0.03em] text-zinc-900 md:text-[3.5rem]" style={{ animationDelay: "60ms" }}>
              안 보이던 기업을
              <br />
              <span className="font-serif font-normal italic text-zinc-500">데이터로 증명합니다.</span>
            </h1>
            <p className="animate-fade-in-up max-w-2xl text-[19px] leading-[1.75] text-zinc-700" style={{ animationDelay: "120ms" }}>
              공개 정보만 보는 기존 평가와 달리, 내부 거래 문서까지 함께 분석해 보이지 않던 성장을 증명합니다.
            </p>
            <div className="animate-fade-in-up pt-1" style={{ animationDelay: "180ms" }}>
              <Link
                href="/company"
                className="inline-flex h-[52px] items-center justify-center gap-2.5 rounded-md bg-[#2A211C] px-10 text-[17px] font-semibold text-white shadow-sm transition-all hover:bg-[#12100E] active:scale-[0.98]"
              >
                기업 진단 시작하기
                <span aria-hidden className="text-base leading-none">→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl shrink-0 px-10 pb-10 pt-8">
        <div className="flex flex-col gap-6">
          <span className="text-[15px] font-bold tracking-tight text-zinc-700">
            이런 기업에게 필요합니다
          </span>
          {/* 번호와 얇은 선만 더한다. 아이콘을 쓰면 지금의 보고서 톤과 어긋난다. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {highlights.map((item) => (
              <div
                key={item.title}
                className="flex flex-col rounded-lg border border-zinc-200 bg-white px-6 py-6 transition-shadow hover:shadow-sm"
              >
                <span className="font-mono text-[13px] font-medium tracking-[0.1em] text-zinc-400">
                  {item.no}
                </span>
                <span aria-hidden className="mt-3 h-px w-8 bg-zinc-300" />
                <p className="mt-4 text-[17px] font-semibold leading-[1.4] text-zinc-900">
                  {item.title}
                </p>
                <p className="mt-2.5 text-[15px] leading-[1.65] text-zinc-600">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
