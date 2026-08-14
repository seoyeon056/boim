import {NextResponse, type NextRequest } from "next/server";
import {getCorseHeaders } from "@/lib/cors";
import{getSignals } from "@/lib/engine";
import { COMPANY_PARAM, readCompanyId } from "@/lib/company-link";

export async function GET(request: NextRequest){
    // /api/signals로 주소 정보 요청하면 실행
    // 해당 기업의 합성 거래를 성장 신호 계산기에 넣기 (lib/engine.ts)
    // ?company=<기업 id> 로 기업을 지정한다. 없으면 첫 기업 기준.
    const companyId = readCompanyId(
        request.nextUrl.searchParams.get(COMPANY_PARAM) ?? undefined,
    );

    const signals = await getSignals(companyId);
    return NextResponse.json(signals,{
        headers: getCorseHeaders(), 
    },);
}

export async function OPTIONS() {
    return new Response(null,{
        status: 204,
        headers:getCorseHeaders(),
    });
}
// port 3001 사용 