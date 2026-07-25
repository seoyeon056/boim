import {NextResponse } from "next/server";
import {getCorseHeaders }from "@/lib/cors";

export async function GET(){
    return NextResponse.json({
        company: "한빛정밀",

        newsCount: 0,
        patentCount: 2,
        jobCount:0,
        visibilityScore:20,

        interpretations:{
            news: "언론 노출 부족",

            patent: "공개 기술 흔적 일부 확인",

            job: "공개 채용 활동 없음",

            visibility: "외부 정보 부족",
        },
        notice: "가시성 점수는 성장성 점수가 아니라 외부에서 확인 가능한 공개 정보 수준입니다.",
    },
    {
        headers : getCorseHeaders(),
    },
    );
}

export async function OPTIONS(){
    return new Response(null,{
        status : 204,
        headers: getCorseHeaders(),
    });
}