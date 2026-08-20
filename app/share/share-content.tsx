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

// 외부 공개 데이터와 내부 문서를 종합한 최종 성장 리포트 화면.
// 기업명·가시성·성장 신호는 모두 진단 중인 기업에 맞춰 API에서 읽어온다.

const ANALYSIS_PERIOD = "2026.01 – 2026.06";

const EVIDENCE_DOCS = [
  "거래명세서",
  "세금계산서",
  "발주서",
  "견적서",
  "계약서",
  "입금내역",
];

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

  const diagnosis =
    visibility && signals ? buildDiagnosis(visibility, signals) : null;

  // 성장 신호 표. 판정(긍정/주의)은 lib/signals.ts 계산 결과를 그대로 쓴다.
  const growthSignals = signals
    ? [
        {
          label: "거래처 증가율",
          value: `${signals.customerGrowthRate > 0 ? "+" : ""}${signals.customerGrowthRate}%`,
          tone: signals.statuses.customerGrowthRate,
        },
        {
          label: "재구매율",
          value: `${signals.repeatPurchaseRate}%`,
          tone: signals.statuses.repeatPurchaseRate,
        },
        {
          label: "최대 거래처 집중도",
          value: `${signals.topCustomerConcentration}%`,
          tone: signals.statuses.topCustomerConcentration,
        },
      ]
    : [];

  return (
    <div className="mx-auto w-full max-w-lg px-6 py-12">
      <Link
        href={withCompany("/compare", companyId)}
        className="inline-flex items-center gap-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-600"
      >
        ← 이전으로
      </Link>

      {/* 리포트 머리말 */}
      <div className="mt-8 rounded-lg border border-zinc-100 bg-white px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
              BO:IM 성장 리포트
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              {visibility ? visibility.company : "불러오는 중"}
            </h1>
            <p className="text-sm text-zinc-400">
              {ANALYSIS_PERIOD} 분석 · 발행 {issuedAt}
            </p>
          </div>

          <div className="flex flex-col items-end gap-1">
            <span className="font-mono text-3xl font-semibold text-emerald-600">
              {diagnosis ? diagnosis.grade : "-"}
            </span>
            <span className="text-[11px] text-zinc-400">성장 잠재력</span>
          </div>
        </div>

        <div className="mt-4 h-px bg-zinc-100" />

        <p className="mt-3 text-xs leading-5 text-zinc-400">
          외부 공개 데이터와 내부 문서를 종합한 AI 기반 진단 결과입니다.
        </p>
      </div>

      {/* 외부 가시성 */}
      <div className="mt-3 flex flex-col gap-px overflow-hidden rounded-lg border border-zinc-100">
        <div className="border-b border-zinc-100 bg-zinc-50/80 px-5 py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
            외부 가시성
          </span>
        </div>

        <div className="flex items-center justify-between gap-4 bg-white px-5 py-3.5">
          <span className="text-xs text-zinc-500">가시성 점수</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xl font-semibold tabular-nums text-zinc-900">
              {visibility ? `${visibility.visibilityScore}점` : "-"}
            </span>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">
              {visibility ? visibility.interpretations.visibility : "불러오는 중"}
            </span>
          </div>
        </div>
      </div>

      {/* 성장 신호 */}
      <div className="mt-3 flex flex-col gap-px overflow-hidden rounded-lg border border-zinc-100">
        <div className="border-b border-zinc-100 bg-zinc-50/80 px-5 py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
            성장 신호
          </span>
        </div>

        {growthSignals.length === 0 ? (
          <div className="bg-white px-5 py-3.5">
            <span className="text-xs text-zinc-400">
              성장 신호를 불러오는 중입니다.
            </span>
          </div>
        ) : (
          growthSignals.map((signal, i) => (
            <div
              key={signal.label}
              className={`flex items-center justify-between gap-4 bg-white px-5 py-3.5 ${
                i < growthSignals.length - 1 ? "border-b border-zinc-100" : ""
              }`}
            >
              <span className="text-xs text-zinc-500">{signal.label}</span>
              <div className="flex items-center gap-2">
                <span
                  className={`font-mono text-xl font-semibold tabular-nums ${
                    signal.tone === "positive"
                      ? "text-emerald-600"
                      : "text-amber-500"
                  }`}
                >
                  {signal.value}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    signal.tone === "positive"
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-amber-50 text-amber-600"
                  }`}
                >
                  {signal.tone === "positive" ? "긍정" : "주의"}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 종합 진단 */}
      <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
          종합 진단
        </p>
        <p className="mt-2.5 text-[13px] font-medium leading-7 text-zinc-900">
          {diagnosis
            ? `${diagnosis.external} ${diagnosis.internal}`
            : "진단 결과를 불러오는 중입니다."}
        </p>
      </div>

      {diagnosis && (
        <div
          className={`mt-2 rounded-md border px-3 py-2 text-[11px] leading-5 ${
            signals?.statuses.topCustomerConcentration === "caution"
              ? "border-amber-100 bg-amber-50 text-amber-700"
              : "border-zinc-100 bg-zinc-50 text-zinc-500"
          }`}
        >
          {diagnosis.risk}
        </div>
      )}

      {/* 분석 근거 문서 */}
      <div className="mt-3 rounded-lg border border-zinc-100 bg-white px-5 py-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
          분석 근거 문서
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {EVIDENCE_DOCS.map((doc) => (
            <span
              key={doc}
              className="rounded-full border border-zinc-100 bg-zinc-50 px-2.5 py-0.5 text-[11px] text-zinc-500"
            >
              {doc}
            </span>
          ))}
        </div>
      </div>

      <p className="mt-4 text-[11px] leading-5 text-zinc-400">
        본 리포트는 신용평가 결과가 아닌 AI 기반 성장 진단 참고 자료입니다.
      </p>

      <div className="mt-6 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-10 w-full items-center justify-center rounded-md bg-zinc-900 text-sm font-medium text-white transition-all hover:bg-zinc-700 active:scale-[0.98]"
        >
          리포트 인쇄하기
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
