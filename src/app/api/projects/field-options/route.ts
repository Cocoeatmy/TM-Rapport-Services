import { NextRequest, NextResponse } from "next/server";
import { getSelectOptions } from "@/lib/notion";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * GET /api/projects/field-options?fields=Emplacement+de+cabine,Type+de+client
 * Retourne { "Emplacement de cabine": ["opt1", "opt2", ...], ... }
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawFields = searchParams.get("fields") ?? "";
  const fields = rawFields
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  if (fields.length === 0) {
    return NextResponse.json({});
  }

  const result: Record<string, string[]> = {};
  await Promise.all(
    fields.map(async (field) => {
      result[field] = await getSelectOptions(field);
    })
  );

  return NextResponse.json(result);
}
