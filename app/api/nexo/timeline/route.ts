import { NextResponse } from "next/server";
import { getNexoTimeline } from "@/lib/nexo";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cuit = searchParams.get("cuit");
  if (!cuit) return NextResponse.json([]);
  const data = await getNexoTimeline(cuit);
  return NextResponse.json(data);
}
