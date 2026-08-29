// 기업별 외부 공개 정보 수집 결과(합성 데이터).
// 뉴스·특허·채용공고·공시 "건수"만 원본 데이터로 두고,
// 가시성 점수와 해석 문구는 lib/visibility.ts 에서 계산한다.
// data/transactions.ts 에서 성장 신호를 계산하는 방식과 같은 구조다.
// 외부 공개 정보의 네 축.
export type ExternalSource = "news" | "patent" | "job" | "disclosure";

export type ExternalPresence = {
  companyId: string;
  // 외부 API가 대답하지 않아 "확인하지 못한" 축. 0건(찾아봤는데 없음)과는
  // 전혀 다른 상태다. 실패를 0으로 적으면 "특허 0건, 공개 기술 흔적 없음"처럼
  // 사실이 아닌 진단이 그대로 진단서까지 실린다(실측: LG생활건강 특허 5,282건이
  // KIPRIS 타임아웃 한 번에 0건으로 표시됨).
  unavailable?: ExternalSource[];
  newsCount: number;
  // 네이버는 한 번에 최대 100건만 내려준다. total이 그보다 크고 표본에 무관
  // 기사가 섞여 있으면 전체를 검증할 방법이 없어, 확인된 건수만 "이상"으로
  // 표시한다. patentCountIsAtLeast와 같은 의미다.
  newsCountIsAtLeast?: boolean;
  patentCount: number;
  // KIPRIS는 한 번에 최대 500건만 내려준다. 이 값이 true면 patentCount는
  // "정확한 수치"가 아니라 "적어도 이만큼은 있다"는 뜻이다. 합성 데이터는
  // 처음부터 정확한 값이라 항상 false(미지정 시 기본값).
  patentCountIsAtLeast?: boolean;
  jobCount: number;
  // DART 최근 1년 공시 건수. 공시는 법인 등록과 보고 의무가 있는 회사만 남기는
  // 기록이라, 아래 합성 데이터의 소규모 법인들은 전부 0건이다. 30줄에 똑같이
  // 0을 쓰는 대신 생략하고, 값이 없으면 0으로 읽는다.
  disclosureCount?: number;
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
  disclosureCount: 0,
};

// 수집 결과가 없는 기업은 "외부에 아무 흔적이 없다"로 본다.
export function findExternalPresence(companyId: string): ExternalPresence {
  const presence = externalPresences.find(
    (item) => item.companyId === companyId,
  );

  return presence ?? { companyId, ...EMPTY_PRESENCE };
}

// 합성 데이터에 이 기업이 들어 있는지. 데모 기업은 수집 결과가 원래부터 값으로
// 주어져 있어 폴백이 정상 동작이지만, 검색으로 찾은 실제 기업은 폴백할 값 자체가
// 없어서 0이 된다. 그 둘을 갈라야 실패를 0건이라고 말하지 않는다.
export function hasSyntheticPresence(companyId: string): boolean {
  return externalPresences.some((item) => item.companyId === companyId);
}
