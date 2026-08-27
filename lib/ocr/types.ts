// 추출 결과 형태. review 화면이 필드마다 신뢰도를 읽어 검수 대상을 고른다.
export type ExtractedField<T> = { value: T; confidence: number };

export type ExtractedTransactionRow = {
  date: ExtractedField<string>;
  customer: ExtractedField<string>;
  item: ExtractedField<string>;
  amount: ExtractedField<number>;
};
