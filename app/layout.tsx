import Link from "next/link";
import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import { UploadStoreProvider } from "./upload/upload-store";

const notoSansKr = Noto_Sans_KR({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
});

export const metadata: Metadata = {
  title: "BO:IM — 안 보이던 기업을 데이터로 증명합니다",
  description: "기업 성장 진단 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${notoSansKr.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="bg-slate-50 px-4 pt-6">
          <Link
            href="/"
            className="inline-flex items-baseline text-lg font-bold tracking-tight text-zinc-900"
          >
            BO<span className="text-zinc-400">:</span>IM
          </Link>
        </header>
        <UploadStoreProvider>{children}</UploadStoreProvider>
      </body>
    </html>
  );
}
