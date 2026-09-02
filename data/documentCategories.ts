import type { DocumentCategory } from "@/types/document";

// 기업 내부 문서 카테고리 목록
// 화면에서는 이 배열의 순서대로 카드가 표시된다.
//
// 세 갈래로 나뉜다.
//   analyzed  — 거래 실적. 매출·거래처·성장 신호를 여기서 계산한다.
//   settlement — 입금 확인. 매출에 합산하지 않고 입금 여부만 곁들인다.
//   future    — 아직 일어나지 않은 거래. 미래 수요 신호로만 싣는다.
export const documentCategories: DocumentCategory[] = [
  {
    id: "transaction-statement",
    name: "거래명세서",
    purpose: "거래일, 거래처, 품목, 수량과 금액을 확인합니다.",
    analyzed: true,
    primary: true,
  },
  {
    id: "tax-invoice",
    name: "세금계산서",
    purpose: "실제 매출·매입과 거래처별 금액을 확인합니다.",
    analyzed: true,
  },
  {
    id: "purchase-order",
    name: "발주서",
    purpose: "예정된 주문과 향후 수요 신호를 확인합니다.",
    future: true,
  },
  {
    id: "quotation",
    name: "견적서",
    purpose: "신규 영업 활동과 잠재 거래 기회를 확인합니다.",
    future: true,
  },
  {
    id: "contract",
    name: "계약서",
    purpose: "장기 거래와 계약 지속 가능성을 확인합니다.",
    future: true,
  },
  {
    id: "deposit-history",
    name: "입금내역",
    purpose: "거래 대금이 실제로 입금되었는지만 확인합니다. 매출에는 합산하지 않습니다.",
    settlement: true,
  },
];
