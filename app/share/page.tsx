import { companies } from "@/data/companies";
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

  // 기업마다 고정된 문서번호가 나오도록 목록 순서로 번호를 매긴다.
  const index = companies.findIndex((item) => item.id === company.id);
  const docNo = `BO:IM-2026-${String(142 + Math.max(0, index)).padStart(6, "0")}`;

  return (
    <ShareContent
      companyId={companyId}
      issuedAt={issuedAt}
      docNo={docNo}
    />
  );
}
