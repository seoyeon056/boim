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

const process = [
  { step: "01", label: "기업 검색" },
  { step: "02", label: "외부 가시성 확인" },
  { step: "03", label: "내부 문서 분석" },
  { step: "04", label: "성장 리포트" },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-slate-50 px-4 pb-16 pt-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-10">
        <div className="flex flex-col gap-4">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">
            기업 성장 진단 서비스
          </p>
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-zinc-900 sm:text-5xl">
            안 보이던 기업을
            <br />
            데이터로 증명합니다.
          </h1>
        </div>

        {/* 서비스 소개 */}
        <div className="flex flex-col gap-5 border-t border-zinc-200 pt-8">
          <h2 className="text-sm font-bold text-zinc-900">
            BO:IM은 이런 기업에게 필요합니다
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {highlights.map((item) => (
              <div key={item.title} className="flex flex-col gap-1.5">
                <p className="text-sm font-semibold text-zinc-800">
                  {item.title}
                </p>
                <p className="text-sm leading-6 text-zinc-500">{item.body}</p>
              </div>
            ))}
          </div>
          <p className="text-sm leading-6 text-zinc-500">
            공개 정보만 보는 기존 평가와 달리, 거래명세서 같은 내부 문서까지
            함께 분석해 &ldquo;보이지 않던 성장&rdquo;을 증명합니다.
          </p>
        </div>

        {/* 진단 과정 미리보기 */}
        <div className="flex flex-col gap-3 border-t border-zinc-200 pt-8">
          <h2 className="text-sm font-bold text-zinc-900">진단 과정</h2>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {process.map((item) => (
              <div key={item.step} className="flex items-baseline gap-2">
                <span className="text-xs font-bold text-zinc-400">
                  {item.step}
                </span>
                <span className="text-sm font-medium text-zinc-700">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <Link
          href="/company"
          className="inline-flex h-12 w-fit items-center justify-center rounded-lg bg-zinc-900 px-8 text-base font-semibold text-white transition-colors hover:bg-zinc-800"
        >
          기업 진단 시작하기
        </Link>
      </div>
    </div>
  );
}
