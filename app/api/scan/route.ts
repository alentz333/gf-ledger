import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MEDIA_TYPES, parseReceipt, type MediaType } from "@/lib/scan";

export const maxDuration = 120;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set on the server." },
      { status: 500 }
    );
  }

  const form = await req.formData();
  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }

  const mediaType: MediaType = MEDIA_TYPES.includes(file.type as MediaType)
    ? (file.type as MediaType)
    : "image/jpeg";

  const bytes = Buffer.from(await file.arrayBuffer());
  const base64 = bytes.toString("base64");

  // Store the original photo as audit evidence
  const ext = mediaType.split("/")[1];
  const imagePath = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("gf-receipts")
    .upload(imagePath, bytes, { contentType: mediaType });
  if (uploadError) {
    return NextResponse.json(
      { error: `Photo upload failed: ${uploadError.message}` },
      { status: 500 }
    );
  }

  let parsed;
  try {
    parsed = await parseReceipt(base64, mediaType);
  } catch (e) {
    await supabase.storage.from("gf-receipts").remove([imagePath]);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not read the receipt." },
      { status: 422 }
    );
  }

  const { data: receipt, error: receiptError } = await supabase
    .from("gf_receipts")
    .insert({
      user_id: user.id,
      store_name: parsed.store_name || null,
      purchased_at:
        parsed.purchase_date || new Date().toISOString().slice(0, 10),
      image_path: imagePath,
      total_paid: parsed.total || null,
      status: "review",
    })
    .select()
    .single();
  if (receiptError || !receipt) {
    return NextResponse.json(
      { error: `Failed to save receipt: ${receiptError?.message}` },
      { status: 500 }
    );
  }

  const items = parsed.items.map((it) => ({
    receipt_id: receipt.id,
    user_id: user.id,
    raw_text: it.raw_text,
    name: it.name,
    price: it.price,
    quantity: it.quantity || 1,
    is_gf: it.is_gluten_free,
    deduction_type: it.deduction_type,
    comparison_name: null,
    comparison_price: null,
    comparison_source: null,
    search_term: it.is_gluten_free ? it.comparison_search_term || null : null,
  }));
  if (items.length > 0) {
    const { error: itemsError } = await supabase
      .from("gf_receipt_items")
      .insert(items);
    if (itemsError) {
      return NextResponse.json(
        { error: `Failed to save items: ${itemsError.message}` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ receiptId: receipt.id });
}
