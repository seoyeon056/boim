// 추출 결과 형태. review 화면이 필드마다 신뢰도를 읽어 검수 대상을 고른다.
export type ExtractedField<T> = { value: T; confidence: number };

export type ExtractedTransactionRow = {
  date: ExtractedField<string>;
  customer: ExtractedField<string>;
  item: ExtractedField<string>;
  amount: ExtractedField<number>;
  // 표에 열이 있을 때만 채운다. 검수 화면의 확인 대상에는 넣지 않는다 — 필드가
  // 늘수록 사용자가 확인할 항목이 배로 늘어난다. 해석에만 쓴다.
  quantity?: ExtractedField<number>;
  unitPrice?: ExtractedField<number>;
};

// 거래 한 건이 아니라 문서 전체에 걸리는 조건들.
// 결제조건은 매출이 현금으로 도는 데 걸리는 시간이라, 거래 건수나 금액만으로는
// 보이지 않는 운전자본 부담을 드러낸다.
export type DocumentTerms = {
  // 원문 그대로. "납품 후 60일", "검수 완료 후 익월 15일 현금 지급" 등
  paymentTerms?: string;
  // 위에서 "N일"을 읽어낼 수 있으면 그 숫자
  paymentDays?: number;
  // 납기일자 (YYYY-MM-DD)
  dueDate?: string;
};
