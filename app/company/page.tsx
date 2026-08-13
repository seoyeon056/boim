"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import {
  CompanyResult,
  searchCompanies,
} from "@/lib/api";

export default function CompanyPage() {
  const [query, setQuery] = useState("");
  const [companies, setCompanies] = useState<CompanyResult[]>([]);
  const [selectedCompany, setSelectedCompany] =
    useState<CompanyResult | null>(null);

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
      const exactMatches = results.filter(
        (company) =>
          company.name.trim().toLowerCase() ===
          normalizedQuery.toLowerCase(),
      );

      setCompanies(exactMatches);
    } catch {
      setCompanies([]);
      setErrorMessage(
        "기업 검색 기능을 불러오지 못했습니다. 검색 API 준비 상태를 확인해 주세요.",
      );
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-slate-50 px-4 pb-16 pt-10">
      <div className="mx-auto w-full max-w-md">
        <Link
          href="/"
          className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-800"
        >
          ← 처음으로
        </Link>

        <main className="mt-8 flex flex-col gap-3 text-center sm:text-left">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">
            <span className="h-px w-6 bg-zinc-900" aria-hidden="true" />
            STEP 1
          </p>

          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            진단할 기업을 검색하세요
          </h1>

          <p className="text-base leading-7 text-zinc-500">
            기업명을 정확하게 입력해 주세요.
          </p>
        </main>

        <form
          onSubmit={handleSearch}
          className="mt-8 flex flex-col gap-3"
        >
          <label
            htmlFor="company-search"
            className="text-sm font-semibold text-zinc-700"
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
            className="h-12 w-full rounded-xl border border-zinc-200 bg-white px-4 text-base text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-4 focus:ring-zinc-200"
          />

          <button
            type="submit"
            disabled={isSearching || query.trim() === ""}
            className="inline-flex h-12 items-center justify-center rounded-lg bg-zinc-900 px-6 text-base font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
          >
            {isSearching ? "검색 중..." : "기업 검색"}
          </button>
        </form>

        <div className="mt-5 flex flex-col gap-3">
          {errorMessage && (
            <p className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-700">
              {errorMessage}
            </p>
          )}

          {!errorMessage &&
            hasSearched &&
            !isSearching &&
            companies.length === 0 && (
              <p className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500">
                정확히 일치하는 기업이 없습니다.
              </p>
            )}

          {companies.map((company) => {
            const isSelected =
              selectedCompany?.id === company.id;

            return (
              <button
                key={company.id}
                type="button"
                onClick={() => setSelectedCompany(company)}
                className={`w-full rounded-xl border p-5 text-left transition ${
                  isSelected
                    ? "border-zinc-900 bg-zinc-50 ring-4 ring-zinc-200"
                    : "border-zinc-200 bg-white hover:border-zinc-400"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-zinc-900">
                      {company.name}
                    </h2>

                    <p className="mt-1 text-sm text-zinc-500">
                      {company.description}
                    </p>
                  </div>

                  <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">
                    검색 결과
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-600">
                  <span className="rounded-full bg-zinc-100 px-3 py-1">
                    {company.region}
                  </span>

                  <span className="rounded-full bg-zinc-100 px-3 py-1">
                    {company.industry}
                  </span>

                  <span className="rounded-full bg-zinc-100 px-3 py-1">
                    직원 {company.employees}명
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {selectedCompany && (
          <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
            <p className="text-sm text-zinc-500">
              선택한 기업
            </p>

            <p className="mt-1 text-lg font-bold text-zinc-900">
              {selectedCompany.name}
            </p>

            <Link
              href="/visibility"
              className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-lg bg-zinc-900 px-6 text-base font-semibold text-white transition-colors hover:bg-zinc-800"
            >
              이 기업 진단하기
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
