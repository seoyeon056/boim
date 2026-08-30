import { NextResponse, type NextRequest } from "next/server";
import { getCorseHeaders } from "@/lib/cors";
import { getVisibility } from "@/lib/engine";
import { COMPANY_PARAM, readCompanyId } from "@/lib/company-link";

// 국민연금 사업장명 검색이 9초 안팎으로 고정 지연이 있다(공공데이터포털 쪽
// 응답 속도이고, 페이지 크기를 줄여도 같다). 배포 환경의 기본 함수 타임아웃에
// 걸리면 고용 축만 "확인 불가"가 되는 게 아니라 화면 전체가 죽는다.
export const maxDuration = 30;

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
