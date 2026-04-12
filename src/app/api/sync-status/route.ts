import { NextResponse } from "next/server";
import { getData } from "@/lib/kv-store";

export const revalidate = 60;

export async function GET() {
  try {
    const data = await getData<any>("last-server-sync");
    if (data && data.length > 0) {
      return NextResponse.json(data[0]);
    }
    return NextResponse.json({ timestamp: null });
  } catch {
    return NextResponse.json({ timestamp: null });
  }
}
