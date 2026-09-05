import { NextResponse, type NextRequest } from "next/server";
import { getCorseHeaders } from "@/lib/cors";
import { getVisibility } from "@/lib/engine";
import { COMPANY_PARAM, readCompanyId } from "@/lib/company-link";

// 국민연금 사업장명 검색이 공공데이터포털 쪽 사정으로 느려질 때가 있다.
// 배포본 실측(2026-09-05): LG전자 29.6초, SK하이닉스 19.2초, 삼성전자 17.2초.
// 상한이 30초면 가장 느린 조회가 상한에 닿아 고용 축만 "확인 불가"가 되는 게
// 아니라 화면 전체가 죽는다. 여유를 조금 두되, 사람이 기다릴 수 있는 선을
// 넘지 않도록 40초로 둔다.
//
// 이 값은 상한일 뿐이라 평소 속도에는 영향이 없다. 3초에 끝나는 조회는 3초에
// 끝난다.
export const maxDuration = 40;

export async function GET(request: NextRequest) {
    // 응답 데이터는 lib/engine.ts 에 있다. 서버 컴포넌트도 같은 함수를 쓴다.
    // ?company=<기업 id> 로 기업을 지정한다. 없으면 첫 기업을 기준으로 응답한다.
    const companyId = readCompanyId(
        request.nextUrl.searchParams.get(COMPANY_PARAM) ?? undefined,
    );

    const visibility = await getVisibility(companyId);

    return NextResponse.json(visibility,{
        headers : getCorseHeaders(),
    },);
}

export async function OPTIONS(){
    return new Response(null,{
        status : 204,
        headers: getCorseHeaders(),
    });
}
