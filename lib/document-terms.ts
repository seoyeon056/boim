"use client";

import type { DocumentTerms } from "@/lib/ocr/types";

// 문서에서 읽어낸 결제조건·납기일자. 브라우저에만 있고 서버로 가지 않는다.
const STORAGE_KEY = "boimDocumentTerms";

export function readDocumentTerms(): DocumentTerms | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as DocumentTerms;
    return parsed.paymentTerms || parsed.dueDate ? parsed : null;
  } catch {
    return null;
  }
}

// 결제조건을 돈이 도는 시간의 문제로 바꿔 말한다.
//
// "납품 후 60일"은 그 자체로는 계약 문구지만, 매출이 잡힌 뒤에도 두 달은 현금이
// 들어오지 않는다는 뜻이다. 거래 건수와 금액만 보는 지표에는 잡히지 않는다.
export function describePaymentTerms(terms: DocumentTerms): string | null {
  if (!terms.paymentTerms) {
    return null;
  }

  if (terms.paymentDays === undefined) {
    return `제출한 문서의 결제조건은 "${terms.paymentTerms}"입니다. 매출이 실제 현금으로 도는 시점을 함께 살펴보시는 편이 좋습니다.`;
  }

  const months = Math.round(terms.paymentDays / 30);

  if (terms.paymentDays >= 90) {
    return `결제조건이 "${terms.paymentTerms}"이라서 매출이 현금으로 도는 데 약 ${months}개월이 걸립니다. 거래가 늘어도 그만큼 운전자본이 먼저 묶이므로, 자금 계획을 함께 보셔야 합니다.`;
  }

  if (terms.paymentDays >= 45) {
    return `결제조건이 "${terms.paymentTerms}"이라서 매출이 현금으로 도는 데 약 ${months}개월이 걸립니다. 거래 규모가 커질수록 이 간극도 함께 커집니다.`;
  }

  return `결제조건은 "${terms.paymentTerms}"으로, 매출과 현금 유입 사이의 간극이 크지 않습니다.`;
}
