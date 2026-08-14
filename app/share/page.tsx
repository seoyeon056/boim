import { readCompanyId } from "@/lib/company-link";
import { ShareContent } from "./share-content";

// 선택한 기업 id 를 URL 에서 읽어 클라이언트 화면으로 넘긴다.
// (클라이언트에서 useSearchParams 를 쓰면 페이지 전체가 Suspense 뒤로 밀려
//  서버 렌더 결과가 비어버리므로, 읽기는 서버에서 한다.)
export default async function SharePage(props: PageProps<"/share">) {
  const companyId = readCompanyId((await props.searchParams).company);

  // 리포트 발행일은 서버에서 한 번만 정한다.
  // (클라이언트에서 new Date() 를 쓰면 서버 렌더 결과와 어긋날 수 있다.)
  const issuedAt = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return <ShareContent companyId={companyId} issuedAt={issuedAt} />;
}
