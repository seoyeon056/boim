import { NextResponse, NextRequest } from "next/server";
import { companies } from "@/data/companies";

export async function GET(request: NextRequest){
    const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";

    if (query == ""){
        return NextResponse.json([]);
    }

    const company = companies.find(
        (item) => item.name.toLowerCase() ===
        query.toLowerCase(),
    );

    if(!company) {
        return NextResponse.json([]);
    }
    return NextResponse.json([company]);
}