import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-100 px-4 py-16">
      <main className="flex w-full max-w-md flex-col items-center gap-6 rounded-2xl bg-white px-8 py-12 text-center shadow-sm">
        <p className="text-sm font-medium text-zinc-500">
          기업 성장 진단 서비스
        </p>
        <h1 className="text-5xl font-bold tracking-tight text-zinc-900">
          BO:IM
        </h1>
        <p className="text-lg leading-8 text-zinc-600">
          안 보이던 기업을
          <br />
          데이터로 증명합니다.
        </p>
        <Link
          href="/company"
          className="mt-2 inline-flex h-12 items-center justify-center rounded-full bg-blue-600 px-8 text-base font-semibold text-white transition-colors hover:bg-blue-700"
        >
          기업 진단 시작하기
        </Link>
      </main>
    </div>
  );
}
