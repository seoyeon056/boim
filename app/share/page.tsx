import { readCompanyId } from "@/lib/company-link";
import { getCompany } from "@/lib/engine";
import { ShareContent } from "./share-content";

// 리포트 발행일·문서번호는 서버에서 한 번만 정한다.
// (클라이언트에서 new Date() 를 쓰면 서버 렌더 결과와 어긋난다.)
//
// 시간대를 못박지 않으면 서버가 있는 곳의 날짜가 나온다. 배포본 서버는 UTC라
// 한국 시간 00~09시에는 발행일이 하루 전으로 찍히고, Step 04 가 한국 기준으로
// 계산한 진단일과 어긋난다. 같은 문서 안에서 날짜가 둘이 되면 안 된다.
export default async function SharePage(props: PageProps<"/share">) {
  const companyId = readCompanyId((await props.searchParams).company);
  const company = await getCompany(companyId);

  const issuedAt = new Date().toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // 기업마다 고정된 문서번호를 만든다.
  //
  // 예전에는 시연용 기업 목록의 순서로 번호를 매기고, 목록에 없으면 0번으로
  // 봤다. 실제 기업은 전부 목록 밖이라 삼성전자도 동일기연도 한빛정밀과 똑같이
  // BO:IM-2026-000142 를 달았다. 서로 다른 기업의 진단서가 같은 문서번호를
  // 가지면 문서로서 성립하지 않는다.
  //
  // 기업 고유번호에서 바로 만든다. 같은 기업은 언제 발급해도 같은 번호가 나오고,
  // 다른 기업끼리 겹칠 일은 사실상 없다.
  const docNo = `BO:IM-2026-${documentSerial(company.id)}`;

  return (
    <ShareContent
      companyId={companyId}
      issuedAt={issuedAt}
      docNo={docNo}
    />
  );
}

// 기업 고유번호를 6자리 일련번호로 옮긴다(FNV-1a).
// 순서가 아니라 값에서 나오므로 목록에 없는 기업도 자기 번호를 갖는다.
function documentSerial(companyId: string): string {
  let hash = 0x811c9dc5;
  for (const char of companyId) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // 000000 은 문서번호로 쓰지 않는다.
  return String((hash % 999000) + 1000).padStart(6, "0");
}
