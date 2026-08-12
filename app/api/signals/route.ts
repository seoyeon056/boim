import {NextResponse } from "next/server";
import {getCorseHeaders } from "@/lib/cors";
import{getSignals } from "@/lib/engine";

export async function GET(){
    // /api/signals로 주소 정보 요청하면 실행
    // 합성 거래 10건을 성장 신호 계산기에 넣기 (lib/engine.ts)
    const signals = await getSignals();
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