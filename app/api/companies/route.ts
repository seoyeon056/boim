import { NextResponse, NextRequest } from "next/server";
import { findCompaniesByName } from "@/lib/engine";

export async function GET(request: NextRequest){
    // 정확 일치 검색 로직은 lib/engine.ts 에 있다. 서버 컴포넌트도 같은 함수를 쓴다.
    const query = request.nextUrl.searchParams.get("q") ?? "";

    return NextResponse.json(await findCompaniesByName(query));
}