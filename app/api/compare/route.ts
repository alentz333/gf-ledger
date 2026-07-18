import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchProducts } from "@/lib/kroger";

export const maxDuration = 60;

// Finds the cheapest comparable conventional product at the user's Kroger store.
// POST { itemId: string, term?: string }
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { itemId, term } = await req.json();
  if (!itemId) {
    return NextResponse.json({ error: "itemId required" }, { status: 400 });
  }

  const { data: settings } = await supabase
    .from("gf_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!settings?.kroger_location_id) {
    return NextResponse.json(
      { error: "No Kroger store selected. Pick one in Settings first." },
      { status: 400 }
    );
  }

  const { data: item } = await supabase
    .from("gf_receipt_items")
    .select("*")
    .eq("id", itemId)
    .single();
  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const searchTerm: string = term || item.search_term || item.name;

  let results;
  try {
    results = await searchProducts(searchTerm, settings.kroger_location_id);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Kroger search failed" },
      { status: 502 }
    );
  }

  if (results.length === 0) {
    return NextResponse.json({ match: null, candidates: [] });
  }

  const cheapest = results[0];
  const { error: updateError } = await supabase
    .from("gf_receipt_items")
    .update({
      comparison_name: [cheapest.brand, cheapest.name, cheapest.size]
        .filter(Boolean)
        .join(" — "),
      comparison_price: cheapest.price,
      comparison_source: `Kroger: ${settings.kroger_location_name ?? settings.kroger_location_id}`,
      search_term: searchTerm,
    })
    .eq("id", itemId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ match: cheapest, candidates: results.slice(0, 8) });
}
