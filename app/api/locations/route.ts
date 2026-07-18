import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchLocations } from "@/lib/kroger";

// GET /api/locations?zip=12345 — search Kroger-family stores near a zip code
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const zip = new URL(req.url).searchParams.get("zip");
  if (!zip || !/^\d{5}$/.test(zip)) {
    return NextResponse.json({ error: "Valid 5-digit zip required" }, { status: 400 });
  }

  try {
    const locations = await searchLocations(zip);
    return NextResponse.json({ locations });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Location search failed" },
      { status: 502 }
    );
  }
}
