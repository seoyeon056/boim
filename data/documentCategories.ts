import type { DocumentCategory } from "@/types/document";

// 기업 내부 문서 카테고리 목록
// 화면에서는 이 배열의 순서대로 카드가 표시된다.
export const documentCategories: DocumentCategory[] = [
  {
    id: "transaction-statement",
    name: "거래명세서",
    purpose: "거래일, 거래처, 품목, 수량과 금액을 확인합니다.",
  },
  {
    id: "tax-invoice",
    name: "세금계산서",
    purpose: "실제 매출·매입과 거래처별 금액을 확인합니다.",
  },
  {
    id: "purchase-order",
    name: "발주서",
    purpose: "예정된 주문과 향후 수요 신호를 확인합니다.",
  },
  {
    id: "quotation",
    name: "견적서",
    purpose: "신규 영업 활동과 잠재 거래 기회를 확인합니다.",
  },
  {
    id: "contract",
    name: "계약서",
    purpose: "장기 거래와 계약 지속 가능성을 확인합니다.",
  },
  {
    id: "deposit-history",
    name: "입금내역",
    purpose: "거래 대금이 실제로 입금되었는지 확인합니다.",
  },
];
