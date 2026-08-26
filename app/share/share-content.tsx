"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";

import {
  fetchSignals,
  fetchVisibility,
  type SignalsResult,
  type VisibilityResult,
} from "@/lib/api";
import { withCompany } from "@/lib/company-link";
import { buildDiagnosis } from "@/lib/diagnosis";

// 공문서 양식의 최종 진단서.
// 기업명·점수·성장 신호는 모두 진단 중인 기업에 맞춰 API에서 읽어온다.

const PERIOD = "2026년 01월 – 2026년 06월";

const EVIDENCE_DOCS = [
  "거래명세서",
  "세금계산서",
  "발주서",
  "견적서",
  "계약서",
  "입금내역",
];

const serif = { fontFamily: "Nanum Myeongjo, Batang, serif" } as const;

export function ShareContent({
  companyId,
  issuedAt,
  docNo,
}: {
  companyId?: string;
  issuedAt: string;
  docNo: string;
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

  const diagnosis =
    visibility && signals ? buildDiagnosis(visibility, signals) : null;

  const companyName = visibility ? visibility.company : "불러오는 중";

  const infoRows: { label: string; value: string }[][] = [
    [
      { label: "기 업 명", value: companyName },
      { label: "분석 기간", value: PERIOD },
    ],
    [
      {
        label: "외부 가시성 점수",
        value: visibility ? `${visibility.visibilityScore}점 / 100점` : "-",
      },
      { label: "성장 잠재력 등급", value: diagnosis ? diagnosis.grade : "-" },
    ],
    [
      { label: "분석 기관", value: "BO:IM AI 진단 시스템" },
      { label: "발 행 일", value: issuedAt },
    ],
  ];

  // 판정(긍정/주의)은 lib/signals.ts 계산 결과를 그대로 쓴다.
  const growthSignals = signals
    ? [
        {
          no: "1",
          label: "거래처 증가율",
          value: `${signals.customerGrowthRate > 0 ? "+" : ""}${signals.customerGrowthRate}%`,
          tone: signals.statuses.customerGrowthRate,
          note: `이전 ${signals.previousCustomersCount}곳 → 현재 ${signals.customerCount}곳`,
        },
        {
          no: "2",
          label: "재구매율",
          value: `${signals.repeatPurchaseRate}%`,
          tone: signals.statuses.repeatPurchaseRate,
          note: "두 번 이상 거래한 비율",
        },
        {
          no: "3",
          label: "최대 거래처 집중도",
          value: `${signals.topCustomerConcentration}%`,
          tone: signals.statuses.topCustomerConcentration,
          note: `${signals.topCustomerName} 의존도`,
        },
      ]
    : [];

  return (
    <div className="mx-auto w-full max-w-[840px] px-6 py-12 print:max-w-full print:px-0 print:py-0">
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
      <div
        className="report-sheet mt-8 border border-zinc-900 bg-white px-12 py-10 print:mt-0 print:border-0 print:px-0"
        style={serif}
      >
        {/* 발신 기관 · 문서번호 */}
        <div className="flex items-end justify-between">
          <p className="font-mono text-[11px] font-bold tracking-[0.35em] text-zinc-900">
            BO:IM
          </p>
          <div className="text-right text-[11px] leading-5 text-zinc-600">
            <p>
              문서번호 <span className="font-mono">{docNo}</span>
            </p>
            <p>시행일자 {issuedAt}</p>
          </div>
        </div>

        {/* 표제 */}
        <div className="mt-8 border-y-[3px] border-double border-zinc-900 py-6 text-center">
          <h1 className="text-[26px] font-bold tracking-[0.3em] text-zinc-900">
            기업성장진단보고서
          </h1>
          <p className="mt-2 text-[12px] tracking-[0.2em] text-zinc-500">
            {PERIOD.replace("–", "~")}
          </p>
        </div>

        {/* 수신 · 제목 */}
        <div className="mt-6 space-y-1.5 text-[13px] leading-6 text-zinc-900">
          <p>
            <span className="inline-block w-16 text-zinc-500">수　신</span>
            {companyName} 대표 귀하
          </p>
          <p>
            <span className="inline-block w-16 text-zinc-500">제　목</span>
            {companyName} 내·외부 데이터 기반 성장 진단 결과 통보
          </p>
        </div>

        {/* 1. 기본 사항 */}
        <section className="mt-8">
          <h2 className="mb-2 text-[14px] font-bold text-zinc-900">
            1. 기본 사항
          </h2>
          <table className="w-full border-collapse border border-zinc-900 text-[13px]">
            <tbody>
              {infoRows.map((row) => (
                <tr key={row[0].label}>
                  {row.map((cell) => (
                    <Fragment key={cell.label}>
                      <th className="w-[22%] border border-zinc-300 bg-zinc-50 px-3 py-2.5 text-left text-[12px] font-bold text-zinc-600">
                        {cell.label}
                      </th>
                      <td className="w-[28%] border border-zinc-300 px-3 py-2.5 font-medium text-zinc-900">
                        {cell.value}
                      </td>
                    </Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* 2. 내부 성장 신호 */}
        <section className="mt-7">
          <h2 className="mb-2 text-[14px] font-bold text-zinc-900">
            2. 내부 성장 신호
          </h2>
          <table className="w-full border-collapse border border-zinc-900 text-[13px]">
            <thead>
              <tr className="bg-zinc-100">
                <th className="w-10 border border-zinc-300 py-2 text-[12px] font-bold text-zinc-700">
                  연번
                </th>
                <th className="border border-zinc-300 py-2 text-[12px] font-bold text-zinc-700">
                  지　표
                </th>
                <th className="w-24 border border-zinc-300 py-2 text-[12px] font-bold text-zinc-700">
                  수　치
                </th>
                <th className="w-16 border border-zinc-300 py-2 text-[12px] font-bold text-zinc-700">
                  판정
                </th>
                <th className="w-[34%] border border-zinc-300 py-2 text-[12px] font-bold text-zinc-700">
                  비　고
                </th>
              </tr>
            </thead>
            <tbody>
              {growthSignals.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="border border-zinc-300 py-4 text-center text-[12px] text-zinc-500"
                  >
                    성장 신호를 불러오는 중입니다.
                  </td>
                </tr>
              ) : (
                growthSignals.map((signal) => (
                  <tr key={signal.label}>
                    <td className="border border-zinc-300 py-2.5 text-center font-mono text-[12px] text-zinc-500">
                      {signal.no}
                    </td>
                    <td className="border border-zinc-300 px-3 py-2.5 font-bold text-zinc-900">
                      {signal.label}
                    </td>
                    <td className="border border-zinc-300 py-2.5 text-center font-mono text-[15px] font-bold text-zinc-900">
                      {signal.value}
                    </td>
                    <td className="border border-zinc-300 py-2.5 text-center text-[12px] font-bold text-zinc-900">
                      {signal.tone === "positive" ? "긍정" : "주의"}
                    </td>
                    <td className="border border-zinc-300 px-3 py-2.5 text-[12px] text-zinc-600">
                      {signal.note}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        {/* 3. 종합 진단 */}
        <section className="mt-7">
          <h2 className="mb-2 text-[14px] font-bold text-zinc-900">
            3. 종합 진단
          </h2>
          <div className="space-y-2 text-[13px] leading-7 text-zinc-900">
            {diagnosis ? (
              <>
                <p className="-indent-4 pl-4">가. {diagnosis.external}</p>
                <p className="-indent-4 pl-4">나. {diagnosis.internal}</p>
                <p className="-indent-4 pl-4">다. {diagnosis.risk}</p>
              </>
            ) : (
              <p className="-indent-4 pl-4">진단 결과를 불러오는 중입니다.</p>
            )}
          </div>
        </section>

        {/* 4. 분석 근거 문서 */}
        <section className="mt-7">
          <h2 className="mb-2 text-[14px] font-bold text-zinc-900">
            4. 분석 근거 문서
          </h2>
          <p className="-indent-4 pl-4 text-[13px] leading-7 text-zinc-900">
            붙임
            {EVIDENCE_DOCS.map((doc, i) => `${i + 1}. ${doc}`).join("　")}
            　각 1부.
          </p>
        </section>

        {/* 끝 표시 */}
        <p className="mt-6 text-right text-[13px] font-bold text-zinc-900">
          끝.
        </p>

        {/* 발신 명의 */}
        <div className="mt-10 border-t border-zinc-300 pt-8 text-center">
          <p className="text-[20px] font-bold tracking-[0.25em] text-zinc-900">
            BO : IM AI 진단 시스템
          </p>
        </div>

        {/* 유의사항 */}
        <p className="mt-8 border-t border-zinc-200 pt-4 text-[11px] leading-5 text-zinc-500">
          ※ 본 보고서는 신용평가 결과가 아닌 AI 기반 성장 진단 참고 자료이며,
          투자·대출 등의 판단 근거로 단독 사용할 수 없습니다.
        </p>
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
