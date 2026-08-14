import { NextResponse, type NextRequest } from "next/server";
import { getCorseHeaders } from "@/lib/cors";
import { getVisibility } from "@/lib/engine";
import { COMPANY_PARAM, readCompanyId } from "@/lib/company-link";

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
