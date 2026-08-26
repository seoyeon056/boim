"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CompanyResult, searchCompanies } from "@/lib/api";
import { withCompany } from "@/lib/company-link";
import StepShell from "@/app/step-shell";

export default function CompanyPage() {
  const [query, setQuery] = useState("");
  const [companies, setCompanies] = useState<CompanyResult[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<CompanyResult | null>(
    null,
  );

  const [isSearching, setIsSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const latestRequestId = useRef(0);

  useEffect(() => {
    const normalizedQuery = query.trim();

    if(normalizedQuery === ""){
      setCompanies([]);
      setErrorMessage("");
      return;
    }

    const requestId = ++latestRequestId.current;
    setIsSearching(true);
    
    const timer = setTimeout(async () => {
      try{
        const results = await searchCompanies(normalizedQuery);

        if (requestId === latestRequestId.current){
          setCompanies(results);
          setErrorMessage("");
        }
      } catch{
        if (requestId === latestRequestId.current){
          setCompanies([]);
          setErrorMessage("기업 검색을 불러오지 못했습니다.");
        }
      } finally {
        if(requestId === latestRequestId.current) {
          setIsSearching(false);
        }
      }
    }, 300);
    return() => clearTimeout(timer);
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
            placeholder="예: 한빛정밀"
            autoComplete="off"
            className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3.5 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
          />
        </div>
      </div>

      <div className="mt-5 flex max-w-2xl flex-col gap-2">
        {errorMessage && (
          <div className="rounded-md border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-700">
            {errorMessage}
          </div>
        )}

        {!errorMessage &&
          query.trim() !== "" &&
          !isSearching &&
          companies.length === 0 && (
            <div className="rounded-md border border-zinc-100 bg-zinc-50 px-4 py-3 text-xs text-zinc-500">
              정확히 일치하는 기업이 없습니다.
            </div>
          )}

        {companies.map((company) => {
          const isSelected = selectedCompany?.id === company.id;

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
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {[
                    company.region,
                    company.industry,
                    `직원 ${company.employees}명`,
                  ].map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-zinc-100 px-2.5 py-0.5 text-[11px] text-zinc-500"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </button>

              {isSelected && (
                <Link
                  href={withCompany("/visibility", company.id)}
                  className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-md bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
                >
                  이 기업 진단하기
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </StepShell>
  );
}
