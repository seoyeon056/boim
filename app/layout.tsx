import type { Metadata } from "next";
import "./globals.css";
import Header from "./header";
import { UploadStoreProvider } from "./upload/upload-store";

export const metadata: Metadata = {
  title: "BO:IM — 안 보이던 기업을 데이터로 증명합니다",
  description:
    "공개 정보와 내부 거래 문서를 함께 분석해 보이지 않던 성장을 증명합니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 본문 폰트(Pretendard)와 세리프/모노는 globals.css 에서 불러온다.
  return (
    <html lang="ko">
      <body>
        <UploadStoreProvider>
          <div className="flex min-h-screen flex-col bg-white">
            <Header />
            <div className="flex flex-1 flex-col">{children}</div>
          </div>
        </UploadStoreProvider>
      </body>
    </html>
  );
}
