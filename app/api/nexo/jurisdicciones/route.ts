import { NextResponse } from "next/server";
import { getNexoJurisdicciones } from "@/lib/nexo";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cuit = searchParams.get("cuit");
  if (!cuit) return NextResponse.json([]);
  const data = await getNexoJurisdicciones(cuit);
  return NextResponse.json(data);
}
