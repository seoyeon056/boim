import { readCompanyId } from "@/lib/company-link";
import { UploadContent } from "./upload-content";

// 선택한 기업 id 를 URL 에서 읽어 클라이언트 화면으로 넘긴다.
// (클라이언트에서 useSearchParams 를 쓰면 페이지 전체가 Suspense 뒤로 밀려
//  서버 렌더 결과가 비어버리므로, 읽기는 서버에서 한다.)
export default async function UploadPage(props: PageProps<"/upload">) {
  const companyId = readCompanyId((await props.searchParams).company);

  return <UploadContent companyId={companyId} />;
}
