// 거래처명은 실명 대신 이 라벨로 프롬프트에 넣고, LLM 응답을 사용자에게
// 보여줄 때만 실명으로 되돌린다. LLM은 실제 거래처명을 한 번도 보지 않는다.
export const MASKED_CUSTOMER_LABEL = "최대 거래처";

export function restoreCustomerName(
  text: string,
  realName: string | null,
): string {
  return realName ? text.replaceAll(MASKED_CUSTOMER_LABEL, realName) : text;
}
