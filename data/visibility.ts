// 기업별 외부 공개 정보 수집 결과(합성 데이터).
// 뉴스·특허·채용공고 "건수"만 원본 데이터로 두고,
// 가시성 점수와 해석 문구는 lib/visibility.ts 에서 계산한다.
// data/transactions.ts 에서 성장 신호를 계산하는 방식과 같은 구조다.
export type ExternalPresence = {
  companyId: string;
  newsCount: number;
  patentCount: number;
  // KIPRIS는 한 번에 최대 500건만 내려준다. 이 값이 true면 patentCount는
  // "정확한 수치"가 아니라 "적어도 이만큼은 있다"는 뜻이다. 합성 데이터는
  // 처음부터 정확한 값이라 항상 false(미지정 시 기본값).
  patentCountIsAtLeast?: boolean;
  jobCount: number;
};

export const externalPresences: ExternalPresence[] = [
  { companyId: "hanbit", newsCount: 0, patentCount: 2, jobCount: 0 },
  { companyId: "gaon-motion", newsCount: 1, patentCount: 1, jobCount: 0 },
  { companyId: "seorim-sensor", newsCount: 0, patentCount: 3, jobCount: 0 },
  { companyId: "bluepeak-energy", newsCount: 1, patentCount: 2, jobCount: 1 },
  { companyId: "nuri-packaging", newsCount: 0, patentCount: 1, jobCount: 0 },
  { companyId: "miraeon-robotics", newsCount: 1, patentCount: 3, jobCount: 0 },
  { companyId: "haedam-biotech", newsCount: 0, patentCount: 2, jobCount: 0 },
  { companyId: "bridgeon-tech", newsCount: 1, patentCount: 1, jobCount: 1 },
  { companyId: "monoleaf-materials", newsCount: 0, patentCount: 2, jobCount: 0 },
  { companyId: "wavecore-solutions", newsCount: 1, patentCount: 0, jobCount: 1 },
  { companyId: "dawon-circuit", newsCount: 0, patentCount: 3, jobCount: 1 },
  { companyId: "saebom-meditech", newsCount: 0, patentCount: 2, jobCount: 0 },
  { companyId: "orbit-factory", newsCount: 1, patentCount: 1, jobCount: 1 },
  { companyId: "puremesh-filter", newsCount: 0, patentCount: 1, jobCount: 0 },
  { companyId: "neulchan-foodtech", newsCount: 0, patentCount: 2, jobCount: 0 },
  { companyId: "corelink-optics", newsCount: 1, patentCount: 3, jobCount: 0 },
  { companyId: "maruchem", newsCount: 1, patentCount: 3, jobCount: 1 },
  { companyId: "innoharbor", newsCount: 1, patentCount: 2, jobCount: 0 },
  { companyId: "solbit-display", newsCount: 0, patentCount: 3, jobCount: 1 },
  { companyId: "greenstep-mobility", newsCount: 2, patentCount: 2, jobCount: 1 },
  { companyId: "onul-airtech", newsCount: 0, patentCount: 1, jobCount: 0 },
  { companyId: "namu-composites", newsCount: 0, patentCount: 2, jobCount: 0 },
  { companyId: "pixelwave-vision", newsCount: 1, patentCount: 0, jobCount: 0 },
  { companyId: "daram-logistics", newsCount: 0, patentCount: 2, jobCount: 1 },
  { companyId: "crestell-battery", newsCount: 1, patentCount: 3, jobCount: 0 },
  { companyId: "harin-semicon", newsCount: 2, patentCount: 3, jobCount: 1 },
  { companyId: "cloudmill-tech", newsCount: 1, patentCount: 0, jobCount: 1 },
  { companyId: "yeoul-water", newsCount: 0, patentCount: 2, jobCount: 0 },
  { companyId: "novacell-materials", newsCount: 1, patentCount: 3, jobCount: 1 },
  { companyId: "doori-automation", newsCount: 0, patentCount: 2, jobCount: 1 },
];

const EMPTY_PRESENCE: Omit<ExternalPresence, "companyId"> = {
  newsCount: 0,
  patentCount: 0,
  jobCount: 0,
};

// 수집 결과가 없는 기업은 "외부에 아무 흔적이 없다"로 본다.
export function findExternalPresence(companyId: string): ExternalPresence {
  const presence = externalPresences.find(
    (item) => item.companyId === companyId,
  );

  return presence ?? { companyId, ...EMPTY_PRESENCE };
}
