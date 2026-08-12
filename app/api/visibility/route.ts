import {NextResponse } from "next/server";
import {getCorseHeaders }from "@/lib/cors";
import {getVisibility } from "@/lib/engine";

export async function GET(){
    // 응답 데이터는 lib/engine.ts 에 있다. 서버 컴포넌트도 같은 함수를 쓴다.
    const visibility = await getVisibility();

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