// 엔진 데이터 계층.
// API 라우트와 서버 컴포넌트가 같은 함수를 쓰도록 한곳에 모아둔다.
// 서버 컴포넌트는 자기 앱의 API를 HTTP로 다시 부르지 않고 여기서 바로 읽는다.
import { companies, type Company } from "@/data/companies";
import { transactions } from "@/data/transactions";
import { calculateSignals } from "@/lib/signals";

export type Visibility = {
  company: string;
  newsCount: number;
  patentCount: number;
  jobCount: number;
  visibilityScore: number;
  interpretations: {
    news: string;
    patent: string;
    job: string;
    visibility: string;
  };
  notice: string;
};

export async function getVisibility(): Promise<Visibility> {
  return {
    company: "한빛정밀",

    newsCount: 0,
    patentCount: 2,
    jobCount: 0,
    visibilityScore: 20,

    interpretations: {
      news: "언론 노출 부족",
      patent: "공개 기술 흔적 일부 확인",
      job: "공개 채용 활동 없음",
      visibility: "외부 정보 부족",
    },
    notice:
      "가시성 점수는 성장성 점수가 아니라 외부에서 확인 가능한 공개 정보 수준입니다.",
  };
}

export async function getSignals() {
  return calculateSignals(transactions);
}

// 입력한 기업명과 정확히 일치하는 기업만 반환한다.
export async function findCompaniesByName(query: string): Promise<Company[]> {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery === "") {
    return [];
  }

  const company = companies.find(
    (item) => item.name.toLowerCase() === normalizedQuery,
  );

  return company ? [company] : [];
}
