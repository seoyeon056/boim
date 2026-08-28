"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CompanyResult, searchCompanies } from "@/lib/api";
import { withCompany } from "@/lib/company-link";
import StepShell from "@/app/step-shell";
import { LoadingSteps } from "@/app/loading-steps";

const DIAGNOSE_STEPS = [
  "기업 정보를 확인하는 중",
  "뉴스·특허·채용 공개 정보를 모으는 중",
  "외부 가시성 점수를 분석하는 중",
];

export default function CompanyPage() {
  const router = useRouter();

  // 다음 화면이 서버에서 외부 API 를 부르는 동안 빈 화면이 보이지 않도록,
  // 이동을 시작하면서 무엇을 하고 있는지 알려준다.
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [query, setQuery] = useState("");
  const [companies, setCompanies] = useState<CompanyResult[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<CompanyResult | null>(
    null,
  );

  const [errorMessage, setErrorMessage] = useState("");

  // 지금 화면의 결과가 어떤 검색어에 대한 것인지 기억한다.
  // 입력한 검색어와 다르면 아직 결과를 못 받은 것이므로 "검색 중"으로 본다.
  const [resolvedQuery, setResolvedQuery] = useState("");

  const latestRequestId = useRef(0);

  const normalizedQuery = query.trim();
  const hasQuery = normalizedQuery !== "";

  // 검색어가 비면 직전 결과를 화면에서 감춘다.
  // 상태를 지우는 대신 파생값으로 계산해야 effect 안에서 setState 를 하지 않는다.
  const visibleCompanies = hasQuery ? companies : [];
  const visibleError = hasQuery ? errorMessage : "";
  const isSearching = hasQuery && resolvedQuery !== normalizedQuery;

  useEffect(() => {
    const nextQuery = query.trim();

    if (nextQuery === "") {
      return;
    }

    const requestId = ++latestRequestId.current;

    const timer = setTimeout(async () => {
      try {
        const results = await searchCompanies(nextQuery);

        if (requestId === latestRequestId.current) {
          setCompanies(results);
          setErrorMessage("");
        }
      } catch {
        if (requestId === latestRequestId.current) {
          setCompanies([]);
          setErrorMessage("기업 검색을 불러오지 못했습니다.");
        }
      } finally {
        if (requestId === latestRequestId.current) {
          setResolvedQuery(nextQuery);
        }
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);


  return (
    <StepShell
      step="Step 01"
      title="진단할 기업을 검색하세요"
      description="기업명을 정확하게 입력해 주세요. 등록된 사업자명과 일치해야 검색됩니다."
      backTo="/"
      backLabel="처음으로"
    >
      <div className="flex max-w-2xl items-end gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="company-search"
              className="text-xs font-medium text-zinc-600"
            >
              기업명
            </label>
            {isSearching && (
              <span className="text-xs text-zinc-400">검색 중…</span>
            )}
          </div>
          <input
            id="company-search"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCompanies([]);
              setSelectedCompany(null);
              setErrorMessage("");
            }}
            placeholder=""
            autoComplete="off"
            className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3.5 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
          />
        </div>
      </div>

      <div className="mt-5 flex max-w-2xl flex-col gap-2">
        {visibleError && (
          <div className="rounded-md border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-700">
            {visibleError}
          </div>
        )}

        {!visibleError &&
          hasQuery &&
          !isSearching &&
          visibleCompanies.length === 0 && (
            <div className="rounded-md border border-zinc-100 bg-zinc-50 px-4 py-3 text-xs text-zinc-500">
              정확히 일치하는 기업이 없습니다.
            </div>
          )}

        {visibleCompanies.map((company) => {
          const isSelected = selectedCompany?.id === company.id;
          const tags = [
            company.region,
            company.industry,
            company.employees > 0 ? `직원 ${company.employees}명` : "",
          ].filter((tag) => tag.trim() !== "");

          return (
            <div
              key={company.id}
              className={`rounded-lg border p-4 transition-colors ${
                isSelected
                  ? "border-zinc-900 bg-zinc-50"
                  : "border-zinc-100 bg-white"
              }`}
            >
              <button
                type="button"
                onClick={() => setSelectedCompany(company)}
                className="w-full text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-semibold text-zinc-900">
                      {company.name}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {company.description}
                    </p>
                  </div>
                  {isSelected && (
                    <span className="shrink-0 rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-white">
                      선택됨
                    </span>
                  )}
                </div>
                {/*
                  DART에서 찾은 기업은 지역·업종·직원수를 내려주지 않아 이 세 값이
                  빈 문자열과 0으로 온다(lib/external/dart.ts). 그대로 렌더하면
                  내용 없는 태그가 뜨고, key가 둘 다 ""라 React key 중복 경고까지
                  난다. 값이 있는 것만 보여준다.
                */}
                {tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {tags.map((tag, index) => (
                      <span
                        key={index}
                        className="rounded-full border border-zinc-100 px-2.5 py-0.5 text-[11px] text-zinc-500"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </button>

              {isSelected && !isDiagnosing && (
                <button
                  type="button"
                  onClick={() => {
                    setIsDiagnosing(true);
                    router.push(withCompany("/visibility", company.id));
                  }}
                  className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-md bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
                >
                  이 기업 진단하기
                </button>
              )}

              {isSelected && isDiagnosing && (
                <div className="mt-3">
                  <LoadingSteps
                    title="외부 가시성 점수 분석 중"
                    steps={DIAGNOSE_STEPS}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

    </StepShell>
  );
}
