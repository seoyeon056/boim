import type { ExternalPresence } from "@/data/visibility";

// 외부 가시성 계산 로직.
// 뉴스·특허·채용공고·공시 건수만 입력으로 받아서 점수와 해석 문구를 만든다.
// 페이지가 문구를 직접 하드코딩하지 않도록 해석까지 여기서 책임진다.

// tone: "warn"(주황, 강조) = 정보 없음/부족 / "muted"(회색) = 흔적 일부 확인
export type MetricTone = "warn" | "muted";

export type VisibilityMetric = {
  key: "news" | "patent" | "job" | "disclosure" | "visibility";
  label: string;
  value: string;
  interpretation: string;
  tone: MetricTone;
};

export type Visibility = {
  companyId: string;
  company: string;

  newsCount: number;
  newsCountIsAtLeast?: boolean;
  patentCount: number;
  patentCountIsAtLeast?: boolean;
  jobCount: number;
  disclosureCount: number;
  visibilityScore: number;

  interpretations: {
    news: string;
    patent: string;
    job: string;
    disclosure: string;
    visibility: string;
  };

  metrics: VisibilityMetric[];
  summary: string;
  notice: string;
};

// 뉴스가 가장 강한 외부 신호이고 채용공고가 가장 약하다고 보고 가중치를 둔다.
// 공시는 회사가 의무적으로 내놓은 기록이라 홍보 여부에 좌우되지 않는다는 점에서
// 특허와 같은 급으로 본다.
const WEIGHTS = {
  news: 12,
  patent: 10,
  job: 8,
  disclosure: 10,
} as const;

const NOTICE =
  "가시성 점수는 성장성 점수가 아니라 외부에서 확인 가능한 공개 정보 수준입니다.";

export function calculateVisibilityScore(presence: ExternalPresence): number {
  const rawScore =
    presence.newsCount * WEIGHTS.news +
    presence.patentCount * WEIGHTS.patent +
    presence.jobCount * WEIGHTS.job +
    (presence.disclosureCount ?? 0) * WEIGHTS.disclosure;

  return Math.min(100, rawScore);
}

function interpretNews(count: number) {
  if (count === 0) {
    return { interpretation: "언론 노출 부족", tone: "warn" as const };
  }

  if (count <= 2) {
    return { interpretation: "언론 노출 소수 확인", tone: "muted" as const };
  }

  return { interpretation: "언론 노출 다수 확인", tone: "muted" as const };
}

function interpretPatent(count: number) {
  if (count === 0) {
    return { interpretation: "공개 기술 흔적 없음", tone: "warn" as const };
  }

  if (count <= 3) {
    return {
      interpretation: "공개 기술 흔적 일부 확인",
      tone: "muted" as const,
    };
  }

  return { interpretation: "공개 기술 흔적 다수 확인", tone: "muted" as const };
}

function interpretJob(count: number) {
  if (count === 0) {
    return { interpretation: "공개 채용 활동 없음", tone: "muted" as const };
  }

  if (count <= 2) {
    return {
      interpretation: "공개 채용 활동 소수 확인",
      tone: "muted" as const,
    };
  }

  return { interpretation: "공개 채용 활동 확인", tone: "muted" as const };
}

// 공시가 0건인 건 대부분 상장·보고 의무가 없는 소규모 법인이라 그런 것이지
// 문제 신호가 아니다. 채용공고와 마찬가지로 warn(주황)을 쓰지 않는다.
function interpretDisclosure(count: number) {
  if (count === 0) {
    return { interpretation: "공시 기록 없음", tone: "muted" as const };
  }

  if (count <= 10) {
    return { interpretation: "공시 기록 소수 확인", tone: "muted" as const };
  }

  return { interpretation: "공시 기록 다수 확인", tone: "muted" as const };
}

function interpretScore(score: number) {
  if (score < 30) {
    return { interpretation: "외부 정보 부족", tone: "warn" as const };
  }

  if (score < 60) {
    return { interpretation: "외부 정보 제한적", tone: "warn" as const };
  }

  return { interpretation: "외부 정보 일부 확인", tone: "muted" as const };
}

// 점수 구간에 따라 화면 상단 설명 문구를 바꾼다.
function summarize(score: number): string {
  if (score < 30) {
    return "외부 데이터만으로는 최근 성장 활동을 확인하기 어렵습니다.";
  }

  if (score < 60) {
    return "외부 데이터에 흔적이 일부 남아 있지만, 최근 성장 활동을 판단하기에는 부족합니다.";
  }

  return "외부 데이터에 흔적이 남아 있지만, 내부 거래만큼 성장을 직접 보여주지는 않습니다.";
}

export function calculateVisibility(
  companyName: string,
  presence: ExternalPresence,
): Visibility {
  const visibilityScore = calculateVisibilityScore(presence);

  const news = interpretNews(presence.newsCount);
  const patent = interpretPatent(presence.patentCount);
  const job = interpretJob(presence.jobCount);
  const disclosureCount = presence.disclosureCount ?? 0;
  const disclosure = interpretDisclosure(disclosureCount);
  const visibility = interpretScore(visibilityScore);

  return {
    companyId: presence.companyId,
    company: companyName,

    newsCount: presence.newsCount,
    newsCountIsAtLeast: presence.newsCountIsAtLeast,
    patentCount: presence.patentCount,
    patentCountIsAtLeast: presence.patentCountIsAtLeast,
    jobCount: presence.jobCount,
    disclosureCount,
    visibilityScore,

    interpretations: {
      news: news.interpretation,
      patent: patent.interpretation,
      job: job.interpretation,
      disclosure: disclosure.interpretation,
      visibility: visibility.interpretation,
    },

    metrics: [
      {
        key: "news",
        label: "뉴스",
        value: presence.newsCountIsAtLeast
          ? `${presence.newsCount}건 이상`
          : `${presence.newsCount}건`,
        ...news,
      },
      {
        key: "patent",
        label: "특허",
        value: presence.patentCountIsAtLeast
          ? `${presence.patentCount}건 이상`
          : `${presence.patentCount}건`,
        ...patent,
      },
      {
        key: "job",
        label: "채용공고",
        value: `${presence.jobCount}건`,
        ...job,
      },
      {
        key: "disclosure",
        label: "공시",
        value: `${disclosureCount}건`,
        ...disclosure,
      },
      {
        key: "visibility",
        label: "가시성 점수",
        value: `${visibilityScore}점`,
        ...visibility,
      },
    ],

    summary: summarize(visibilityScore),
    notice: NOTICE,
  };
}
