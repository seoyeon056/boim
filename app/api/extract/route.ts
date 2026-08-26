import { NextRequest, NextResponse } from "next/server";
import { extractTransactionsFromFile } from "@/lib/ocr/extract";

// 업로드된 거래명세서 파일들을 받아서 거래 내역으로 구조화 추출한다.
// 파일이 여러 개면 전부 병렬로 돌리고 결과를 하나로 합친다.
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ transactions: null });
  }

  const results = await Promise.all(
    files.map((file) => extractTransactionsFromFile(file)),
  );

  // 파일 하나라도 추출이 안 되면(키 없음/호출 실패) 그 파일만 빠지고,
  // 나머지 파일의 결과는 그대로 살린다. 전부 실패하면 null을 돌려줘서
  // 호출하는 쪽이 합성 데이터로 대체하게 한다.
  const transactions = results.flatMap((result) => result ?? []);

  if (transactions.length === 0) {
    return NextResponse.json({ transactions: null });
  }

  return NextResponse.json({ transactions });
}
