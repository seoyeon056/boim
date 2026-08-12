"use client";

import Link from "next/link";

// 외부 공개 데이터와 내부 문서를 종합한 최종 성장 리포트 화면.
// 현재는 실제 API 없이 합성 데이터를 사용한다.

// 기업 요약 (리포트 상단)
const companySummary = [
  { label: "기업명", value: "한빛정밀" },
  { label: "분석 기간", value: "2026년 1월 ~ 2026년 6월" },
  { label: "외부 가시성", value: "20점 · 외부 정보 부족" },
];

// 내부 성장 신호 카드
// tone: "positive"(긍정, 초록) / "caution"(주의, 주황)
const growthSignals = [
  {
    label: "거래처 증가율",
    value: "+150%",
    status: "긍정",
    tone: "positive" as const,
  },
  {
    label: "재구매율",
    value: "80%",
    status: "긍정",
    tone: "positive" as const,
  },
  {
    label: "최대 거래처 집중도",
    value: "45%",
    status: "주의",
    tone: "caution" as const,
  },
];

const valueStyles = {
  positive: "text-emerald-600",
  caution: "text-amber-600",
};

const badgeStyles = {
  positive: "bg-emerald-50 text-emerald-700",
  caution: "bg-amber-50 text-amber-700",
};

// 분석 근거 문서
const evidenceDocuments = [
  "거래명세서",
  "세금계산서",
  "발주서",
  "견적서",
  "계약서",
  "입금내역",
];

export default function SharePage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-100 px-4 py-16">
      <div className="mx-auto w-full max-w-md">
        <Link
          href="/compare"
          className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-800"
        >
          ← 이전으로
        </Link>

        <main className="mt-8 flex flex-col gap-3 text-center sm:text-left">
          <p className="text-sm font-semibold text-blue-600">6단계</p>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            BO:IM 성장 리포트
          </h1>
          <p className="text-base leading-7 text-zinc-500">
            외부 공개 데이터와 내부 문서를 종합한 한빛정밀의 성장 진단
            결과입니다.
          </p>
        </main>

        {/* 기업 요약 */}
        <div className="mt-8 flex flex-col gap-3 rounded-2xl bg-white p-6 shadow-sm">
          {companySummary.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between gap-3 rounded-xl bg-zinc-100 px-4 py-3"
            >
              <span className="text-sm text-zinc-500">{item.label}</span>
              <span className="text-right text-base font-bold text-zinc-900">
                {item.value}
              </span>
            </div>
          ))}
        </div>

        {/* 내부 성장 신호 */}
        <div className="mt-6 flex flex-col gap-3">
          <h2 className="px-1 text-lg font-bold text-zinc-900">성장 신호</h2>
          {growthSignals.map((signal) => (
            <div
              key={signal.label}
              className="flex items-center justify-between gap-3 rounded-2xl bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-zinc-700">
                  {signal.label}
                </span>
                <span
                  className={`text-2xl font-bold ${valueStyles[signal.tone]}`}
                >
                  {signal.value}
                </span>
              </div>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${badgeStyles[signal.tone]}`}
              >
                {signal.status}
              </span>
            </div>
          ))}

          {/* 집중도 설명 */}
          <p className="rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-700">
            최대 거래처가 전체 매출의 45%를 차지해 특정 거래처 의존 위험을
            확인해야 합니다.
          </p>
        </div>

        {/* 종합 진단 */}
        <div className="mt-6 flex flex-col gap-3 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-zinc-900">종합 진단</h2>
          <div className="flex flex-col gap-3 text-base leading-7 text-zinc-600">
            <p>
              외부에서는 공개 정보가 부족하지만, 내부 문서에서는 거래처 증가와
              높은 재구매율이 확인되었습니다.
            </p>
            <p>다만 특정 거래처 의존 위험도 함께 살펴봐야 합니다.</p>
          </div>
        </div>

        {/* 분석 근거 문서 */}
        <div className="mt-6 flex flex-col gap-3 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-zinc-900">분석 근거 문서</h2>
          <div className="flex flex-wrap gap-2">
            {evidenceDocuments.map((doc) => (
              <span
                key={doc}
                className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-700"
              >
                {doc}
              </span>
            ))}
          </div>
        </div>

        {/* 주의 문구 */}
        <p className="mt-6 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-700">
          본 리포트는 신용평가 결과가 아니라 AI 기반 성장 진단 참고
          자료입니다.
        </p>

        <button
          type="button"
          onClick={() => window.print()}
          className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-blue-600 px-6 text-base font-semibold text-white transition-colors hover:bg-blue-700"
        >
          리포트 인쇄하기
        </button>

        <Link
          href="/company"
          className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-full bg-white px-6 text-base font-semibold text-zinc-900 shadow-sm transition-colors hover:bg-zinc-50"
        >
          새 기업 진단하기
        </Link>

        <Link
          href="/"
          className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-full px-6 text-base font-semibold text-zinc-500 transition-colors hover:text-zinc-800"
        >
          처음 화면으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
