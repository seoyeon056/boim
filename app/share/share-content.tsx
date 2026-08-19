"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  fetchSignals,
  fetchVisibility,
  type SignalsResult,
  type VisibilityResult,
} from "@/lib/api";
import { withCompany } from "@/lib/company-link";
import { buildDiagnosis } from "@/lib/diagnosis";

// 외부 공개 데이터와 내부 문서를 종합한 최종 성장 리포트.
// 인쇄(PDF 저장)를 전제로 한 문서 레이아웃이라, 화면 전용 요소에는 print:hidden 을 둔다.

const ANALYSIS_PERIOD = "2026년 01월 – 2026년 06월";
const ISSUER = "BO:IM AI 진단 시스템";

const statusLabel = {
  positive: "긍정",
  caution: "주의",
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

// 성장 잠재력 등급.
// 외부 가시성과 내부 신호를 함께 보고 정한다. 내부 신호 3개 중 긍정 개수가
// 주된 기준이고, 외부 가시성은 보조로만 쓴다 —
// 외부에 정보가 없다는 사실이 등급을 깎는 근거가 되면 이 서비스의 전제와 어긋난다.
function calculateGrade(
  visibilityScore: number,
  positiveSignalCount: number,
): string {
  if (positiveSignalCount === 3) {
    return visibilityScore >= 30 ? "A" : "A-";
  }

  if (positiveSignalCount === 2) {
    return visibilityScore >= 30 ? "B+" : "B";
  }

  if (positiveSignalCount === 1) {
    return "C+";
  }

  return "C";
}

export function ShareContent({
  companyId,
  issuedAt,
}: {
  companyId?: string;
  issuedAt: string;
}) {
  const [visibility, setVisibility] = useState<VisibilityResult | null>(null);
  const [signals, setSignals] = useState<SignalsResult | null>(null);

  useEffect(() => {
    let isActive = true;

    Promise.all([fetchVisibility(companyId), fetchSignals(companyId)])
      .then(([visibilityResult, signalsResult]) => {
        if (!isActive) return;
        setVisibility(visibilityResult);
        setSignals(signalsResult);
      })
      .catch(() => {
        if (!isActive) return;
        setVisibility(null);
        setSignals(null);
      });

    return () => {
      isActive = false;
    };
  }, [companyId]);

  const companyName = visibility?.company ?? "선택한 기업";

  const diagnosis =
    visibility && signals ? buildDiagnosis(visibility, signals) : null;

  // 내부 성장 신호 표. tone/판정은 lib/signals.ts 판단 결과를 그대로 쓴다.
  const growthSignals = signals
    ? [
        {
          label: "거래처 증가율",
          value: `${signals.customerGrowthRate > 0 ? "+" : ""}${signals.customerGrowthRate}%`,
          tone: signals.statuses.customerGrowthRate,
          note: `이전 ${signals.previousCustomersCount}곳 → 현재 ${signals.customerCount}곳`,
        },
        {
          label: "재구매율",
          value: `${signals.repeatPurchaseRate}%`,
          tone: signals.statuses.repeatPurchaseRate,
          note: "두 번 이상 거래한 거래처 비율",
        },
        {
          label: "최대 거래처 집중도",
          value: `${signals.topCustomerConcentration}%`,
          tone: signals.statuses.topCustomerConcentration,
          note: `${signals.topCustomerName ?? "최대 거래처"} 의존도`,
        },
      ]
    : [];

  const positiveSignalCount = growthSignals.filter(
    (signal) => signal.tone === "positive",
  ).length;

  const grade =
    visibility && signals
      ? calculateGrade(visibility.visibilityScore, positiveSignalCount)
      : "–";

  const infoRows = [
    { label: "기업명", value: companyName },
    { label: "분석 기간", value: ANALYSIS_PERIOD },
    { label: "발행일", value: issuedAt },
    {
      label: "외부 가시성 점수",
      value: visibility
        ? `${visibility.visibilityScore}점 / 100점`
        : "불러오는 중",
    },
    { label: "분석 기관", value: ISSUER },
  ];

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12 print:max-w-full print:px-0 print:py-0">
      {/* 화면 전용 네비 */}
      <div className="print:hidden">
        <Link
          href={withCompany("/compare", companyId)}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-600"
        >
          ← 이전으로
        </Link>
      </div>

      {/* ───── 문서 본체 ───── */}
      <div className="mt-8 border border-zinc-300 bg-white print:mt-0 print:border-0">
        {/* 레터헤드 */}
        <div className="flex items-start justify-between border-b-2 border-zinc-900 px-8 py-6">
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              BO:IM
            </span>
            <p className="text-[11px] text-zinc-500">기업 성장 진단 보고서</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-zinc-400">발행일</p>
            <p className="font-mono text-xs font-semibold text-zinc-700">
              {issuedAt}
            </p>
          </div>
        </div>

        {/* 제목 + 등급 */}
        <div className="flex items-start justify-between border-b border-zinc-200 bg-zinc-50 px-8 py-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              대상 기업
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900">
              {companyName}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">{ANALYSIS_PERIOD}</p>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1 rounded border-2 border-zinc-900 px-5 py-3">
            <span className="font-mono text-4xl font-black leading-none text-zinc-900">
              {grade}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              성장 잠재력
            </span>
          </div>
        </div>

        {/* 기업 정보 표 */}
        <div className="border-b border-zinc-200 px-8 py-5">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
            기본 정보
          </p>
          <table className="w-full border-collapse text-sm">
            <tbody>
              {infoRows.map((row, i) => (
                <tr
                  key={row.label}
                  className={
                    i < infoRows.length - 1 ? "border-b border-zinc-100" : ""
                  }
                >
                  <td className="w-36 py-2 pr-4 text-xs font-semibold text-zinc-500">
                    {row.label}
                  </td>
                  <td className="py-2 font-medium text-zinc-900">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 성장 신호 표 */}
        <div className="border-b border-zinc-200 px-8 py-5">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
            내부 성장 신호
          </p>

          {growthSignals.length === 0 ? (
            <p className="text-xs text-zinc-400">성장 신호를 불러오는 중입니다.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-300 bg-zinc-50">
                  <th className="py-2 pr-4 text-left text-[11px] font-bold text-zinc-500">
                    지표
                  </th>
                  <th className="py-2 pr-4 text-right text-[11px] font-bold text-zinc-500">
                    수치
                  </th>
                  <th className="py-2 pr-4 text-center text-[11px] font-bold text-zinc-500">
                    판정
                  </th>
                  <th className="py-2 text-left text-[11px] font-bold text-zinc-500">
                    비고
                  </th>
                </tr>
              </thead>
              <tbody>
                {growthSignals.map((signal, i) => {
                  const isPositive = signal.tone === "positive";
                  return (
                    <tr
                      key={signal.label}
                      className={
                        i < growthSignals.length - 1
                          ? "border-b border-zinc-100"
                          : ""
                      }
                    >
                      <td className="py-2.5 pr-4 text-xs font-semibold text-zinc-700">
                        {signal.label}
                      </td>
                      <td
                        className={`py-2.5 pr-4 text-right font-mono text-base font-bold ${
                          isPositive ? "text-emerald-700" : "text-amber-600"
                        }`}
                      >
                        {signal.value}
                      </td>
                      <td className="py-2.5 pr-4 text-center">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                            isPositive
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {statusLabel[signal.tone]}
                        </span>
                      </td>
                      <td className="py-2.5 text-xs text-zinc-400">
                        {signal.note}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* 종합 진단 */}
        <div className="border-b border-zinc-200 px-8 py-5">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
            종합 진단
          </p>
          {diagnosis ? (
            <div className="flex flex-col gap-2 text-sm leading-7 text-zinc-800">
              <p>{diagnosis.external}</p>
              <p>{diagnosis.internal}</p>
              <p>{diagnosis.risk}</p>
            </div>
          ) : (
            <p className="text-sm leading-7 text-zinc-400">
              진단 결과를 불러오는 중입니다.
            </p>
          )}
        </div>

        {/* 근거 문서 */}
        <div className="border-b border-zinc-200 px-8 py-5">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
            분석 근거 문서
          </p>
          <div className="flex flex-wrap gap-2">
            {evidenceDocuments.map((doc) => (
              <span
                key={doc}
                className="rounded border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600"
              >
                {doc}
              </span>
            ))}
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex items-end justify-between px-8 py-5">
          <p className="max-w-sm text-[10px] leading-5 text-zinc-400">
            본 보고서는 신용평가 결과가 아닌 AI 기반 성장 진단 참고 자료이며,
            투자·대출 등의 판단 근거로 단독 사용할 수 없습니다.
          </p>
          <div className="flex shrink-0 flex-col items-center gap-1 rounded border border-zinc-300 px-4 py-2 text-center">
            <span className="font-mono text-xs font-bold text-zinc-900">
              BO:IM
            </span>
            <span className="text-[9px] text-zinc-400">AI DIAGNOSTIC</span>
          </div>
        </div>
      </div>

      {/* 화면 전용 버튼 */}
      <div className="mt-6 flex flex-col gap-2 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-10 w-full items-center justify-center rounded-md bg-zinc-900 text-sm font-medium text-white transition-all hover:bg-zinc-700 active:scale-[0.98]"
        >
          리포트 인쇄 / PDF 저장
        </button>

        <div className="grid grid-cols-2 gap-2">
          <Link
            href="/company"
            className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-100 bg-white text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
          >
            새 기업 진단
          </Link>
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-100 bg-white text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
          >
            처음으로
          </Link>
        </div>
      </div>
    </div>
  );
}
