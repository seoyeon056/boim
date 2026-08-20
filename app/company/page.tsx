"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { CompanyResult, searchCompanies } from "@/lib/api";
import { withCompany } from "@/lib/company-link";

export default function CompanyPage() {
  const [query, setQuery] = useState("");
  const [companies, setCompanies] = useState<CompanyResult[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<CompanyResult | null>(
    null,
  );
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedQuery = query.trim();

    setSelectedCompany(null);
    setErrorMessage("");
    setHasSearched(true);

    if (normalizedQuery === "") {
      setCompanies([]);
      return;
    }

    try {
      setIsSearching(true);

      const results = await searchCompanies(normalizedQuery);

      // API가 비슷한 이름까지 보내더라도
      // 사용자가 입력한 기업명과 정확히 같은 기업만 남긴다.
      setCompanies(
        results.filter(
          (company) =>
            company.name.trim().toLowerCase() === normalizedQuery.toLowerCase(),
        ),
      );
    } catch {
      setCompanies([]);
      setErrorMessage("기업 검색을 불러오지 못했습니다.");
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg px-6 py-12">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-600"
      >
        ← 처음으로
      </Link>

      <div className="mt-8 flex flex-col gap-1">
        <span className="font-mono text-xs font-medium uppercase tracking-widest text-zinc-400">
          Step 01
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          진단할 기업을 검색하세요
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          기업명을 정확하게 입력해 주세요.
        </p>
      </div>

      <form onSubmit={handleSearch} className="mt-8 flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="company-search"
            className="text-xs font-medium text-zinc-600"
          >
            기업명
          </label>
          <input
            id="company-search"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCompanies([]);
              setSelectedCompany(null);
              setHasSearched(false);
              setErrorMessage("");
            }}
            placeholder="예: 한빛정밀"
            autoComplete="off"
            className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3.5 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
          />
        </div>

        <button
          type="submit"
          disabled={isSearching || query.trim() === ""}
          className="h-10 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
        >
          {isSearching ? "검색 중…" : "검색"}
        </button>
      </form>

      <div className="mt-4 flex flex-col gap-2">
        {errorMessage && (
          <div className="rounded-md border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-700">
            {errorMessage}
          </div>
        )}

        {!errorMessage &&
          hasSearched &&
          !isSearching &&
          companies.length === 0 && (
            <div className="rounded-md border border-zinc-100 bg-zinc-50 px-4 py-3 text-xs text-zinc-500">
              정확히 일치하는 기업이 없습니다.
            </div>
          )}

        {companies.map((company) => {
          const isSelected = selectedCompany?.id === company.id;

          return (
            <button
              key={company.id}
              type="button"
              onClick={() => setSelectedCompany(company)}
              className={`w-full rounded-lg border p-4 text-left transition-colors ${
                isSelected
                  ? "border-zinc-900 bg-zinc-50"
                  : "border-zinc-100 bg-white hover:border-zinc-200 hover:bg-zinc-50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-semibold text-zinc-900">
                    {company.name}
                  </p>
                  <p className="text-xs text-zinc-500">{company.description}</p>
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
          );
        })}
      </div>

      {selectedCompany && (
        <div className="mt-4 rounded-lg border border-zinc-100 bg-zinc-50 p-4">
          <p className="text-xs text-zinc-400">선택한 기업</p>
          <p className="mt-0.5 text-sm font-semibold text-zinc-900">
            {selectedCompany.name}
          </p>
          <Link
            href={withCompany("/visibility", selectedCompany.id)}
            className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-md bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
          >
            이 기업 진단하기
          </Link>
        </div>
      )}
    </div>
  );
}
