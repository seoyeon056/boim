import {
  findExternalPresence,
  hasSyntheticPresence,
  type ExternalPresence,
  type ExternalSource,
} from "@/data/visibility";
import { fetchNewsCount } from "@/lib/external/news";
import { fetchEmployment } from "@/lib/external/employment";
import { fetchPatentCount } from "@/lib/external/patents";
import { fetchDisclosureCount } from "@/lib/external/disclosures";
import { fetchDartProfile } from "@/lib/external/dart";
import { remember } from "@/lib/external/cache";

// 네 API를 병렬로 호출한다.
//
// "키가 없다"와 "불렀는데 실패했다"를 갈라서 다르게 다룬다. 예전에는 둘 다
// 합성 데이터(data/visibility.ts)로 되돌렸는데, 그 탓에 같은 기업을 연달아
// 조회하면 값이 오락가락했다. 실측: 한빛정밀을 네 번 부르면 8명·8명·18명·8명이
// 나왔다(18명은 합성값). 국민연금 조회가 간헐적으로 타임아웃할 때마다 지어낸
// 값이 측정값 자리에 조용히 들어앉은 것이다. 비교 화면은 18명, 진단서는 8명이
// 되어 한 흐름 안에서 두 화면이 다른 숫자를 말했다.
//
// 지금은 이렇게 나눈다.
//
//   키가 없다   → 그 축은 애초에 연결된 적이 없다. 데모 기업이면 합성값을 쓴다.
//                 배포 시점에 정해지는 조건이라 요청마다 바뀌지 않는다.
//   호출 실패   → "확인 불가"로 적고 배점에서 뺀다. 값을 대신 채우지 않는다.
//
// 못 받은 것을 지어내지 않으면 화면들이 서로 다른 말을 할 일도 없다.

// 검색으로 고른 실제 기업은 id가 DART 고유번호(8자리)다.
const CORP_CODE = /^\d{8}$/;

// 국민연금 쪽은 사업자등록번호 앞 6자리만 공개한다. 동명 회사를 가르려면
// 전체 번호가 필요한데, 그건 DART 기업개황에만 있다. 여기서 미리 받아 둔다.
async function findBizrNo(companyId: string): Promise<string | undefined> {
  if (!CORP_CODE.test(companyId)) {
    return undefined;
  }

  const profile = await remember(`dart-profile:${companyId}`, () =>
    fetchDartProfile(companyId),
  );
  return profile?.bizrNo || undefined;
}

export async function getExternalPresence(
  companyId: string,
  companyName: string,
): Promise<ExternalPresence> {
  const fallback = findExternalPresence(companyId);

  // 기업명을 못 찾은 경우(고유번호만 있고 DART 조회 실패). 빈 이름으로 외부를
  // 검색하면 엉뚱한 결과가 잡히므로 조회 자체를 건너뛴다.
  //
  // 건너뛴 것을 0건으로 두면 안 된다. 예전에는 그냥 빈 값(전부 0)을 돌려줘서,
  // 없는 고유번호로 들어가면 화면이 "뉴스 0건·특허 0건·고용 0명·공시 0건"이라고
  // 단정하고 AI 문장까지 "외부 노출이 전무하다"라고 적었다. 한 번도 조회하지
  // 않고 내린 결론이다. 네 축을 모두 "확인 불가"로 둔다.
  if (companyName.trim() === "") {
    return {
      companyId,
      unavailable: ["news", "patent", "employment", "disclosure"],
      newsCount: 0,
      patentCount: 0,
      employeeCount: 0,
      disclosureCount: 0,
    };
  }

  const isDemoCompany = hasSyntheticPresence(companyId);
  const bizrNo = await findBizrNo(companyId);

  // 키가 등록돼 있는 축. 여기 없는 축은 부른 적이 없으므로 실패가 아니다.
  const configured = {
    news: Boolean(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET),
    patent: Boolean(process.env.KIPRIS_SERVICE_KEY),
    employment: Boolean(process.env.KOOKMIN_API_KEY),
    disclosure: Boolean(process.env.DART_SEARCH_KEY),
  } as const;

  // 축마다 따로 기억한다. 실패한 축은 기억하지 않으므로 다음 화면에서 다시
  // 물어본다(lib/external/cache.ts).
  const [news, employment, patent, disclosureCount] = await Promise.all([
    remember(`news:${companyName}`, () => fetchNewsCount(companyName)),
    remember(`employment:${companyName}:${bizrNo ?? ""}`, () =>
      fetchEmployment(companyName, bizrNo),
    ),
    remember(`patent:${companyName}`, () => fetchPatentCount(companyName)),
    remember(`disclosure:${companyName}`, () =>
      fetchDisclosureCount(companyName),
    ),
  ]);

  // 값을 못 받은 축을 어떻게 다룰지 한곳에서 정한다.
  //
  //   키가 있는데 못 받았다  → 실패. "확인 불가"로 적고 배점에서 뺀다.
  //   키가 없다 + 데모 기업   → 합성값을 쓴다(데모 기업은 그게 정답이다).
  //   키가 없다 + 실제 기업   → 채울 값이 없다. 역시 "확인 불가".
  const unavailable: ExternalSource[] = [];

  function resolve<T>(
    source: ExternalSource,
    answer: T | null | undefined,
    synthetic: number,
  ): { answered: T | null; count: number } {
    if (answer !== null && answer !== undefined) {
      return { answered: answer, count: 0 };
    }
    if (!configured[source] && isDemoCompany) {
      return { answered: null, count: synthetic };
    }
    unavailable.push(source);
    return { answered: null, count: 0 };
  }

  const newsAxis = resolve("news", news, fallback.newsCount);
  const patentAxis = resolve("patent", patent, fallback.patentCount);
  const employmentAxis = resolve(
    "employment",
    employment,
    fallback.employeeCount,
  );
  const disclosureAxis = resolve(
    "disclosure",
    disclosureCount,
    fallback.disclosureCount ?? 0,
  );

  return {
    companyId,
    unavailable,
    newsCount: newsAxis.answered?.count ?? newsAxis.count,
    newsCountIsAtLeast: newsAxis.answered?.isAtLeast,
    employeeCount: employmentAxis.answered?.employeeCount ?? employmentAxis.count,
    employeeChange: employmentAxis.answered?.employeeChange,
    employmentAsOf: employmentAxis.answered?.asOf,
    patentCount: patentAxis.answered?.count ?? patentAxis.count,
    patentCountIsAtLeast: patentAxis.answered?.isAtLeast,
    disclosureCount: disclosureAxis.answered ?? disclosureAxis.count,
  };
}
