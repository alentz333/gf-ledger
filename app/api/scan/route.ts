import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120;

const ScannedItem = z.object({
  raw_text: z.string().describe("The line item exactly as printed on the receipt"),
  name: z
    .string()
    .describe(
      "Expanded, human-readable product name (e.g. 'GF BRD UDIS' -> 'Udi's Gluten Free Bread')"
    ),
  price: z.number().describe("Final price paid for this line, after discounts"),
  quantity: z.number().describe("Quantity purchased, 1 if not shown"),
  is_gluten_free: z
    .boolean()
    .describe(
      "True if this is a specifically gluten-free product (labeled GF, a known GF brand, or a GF variant of a normally wheat-based product). Naturally gluten-free items like produce, meat, or milk are FALSE."
    ),
  deduction_type: z
    .enum(["difference", "full"])
    .describe(
      "'full' only when the item has no conventional (gluten-containing) counterpart, e.g. xanthan gum. Otherwise 'difference'."
    ),
  comparison_search_term: z
    .string()
    .describe(
      "Short generic search term for the conventional counterpart, e.g. 'sandwich bread', 'all purpose flour', 'spaghetti pasta'. Empty string if not gluten-free or deduction_type is 'full'."
    ),
});

const ScanResult = z.object({
  store_name: z.string().describe("Store name from the receipt, empty string if unknown"),
  purchase_date: z
    .string()
    .describe("Purchase date as YYYY-MM-DD, empty string if not visible"),
  total: z.number().describe("Receipt grand total, 0 if not visible"),
  items: z.array(ScannedItem),
});

const SYSTEM = `You are a receipt parser for a celiac tax-deduction tracker.
The user photographs grocery receipts. Extract every product line item.
Expand cryptic receipt abbreviations into real product names using your knowledge
of grocery brands (e.g. "GG 1:1 FLR" is "King Arthur Gluten Free Measure for Measure Flour"
only if the receipt context supports it — otherwise give your best generic expansion).
Flag gluten-free items conservatively and accurately:
- TRUE: products that are gluten-free versions of normally wheat-based foods
  (bread, pasta, flour, crackers, cookies, pizza crust, cereal, pretzels, soy sauce/tamari),
  or explicitly GF-labeled items from GF brands (Udi's, Canyon Bakehouse, Schar, Jovial,
  Banza, Tinkyada, Bob's Red Mill GF line, King Arthur GF, Simple Mills, etc.)
- FALSE: naturally gluten-free foods (produce, meat, eggs, milk, rice, potatoes, plain cheese),
  and all non-GF products.
Exclude tax lines, deposits, coupons, and bag fees from items (but reflect coupon discounts
in the item price when the coupon is tied to a specific item).`;

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

  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
  const mediaType = allowed.includes(file.type as (typeof allowed)[number])
    ? (file.type as (typeof allowed)[number])
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

  const anthropic = new Anthropic();
  const response = await anthropic.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 16000,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          {
            type: "text",
            text: "Parse this grocery receipt into line items and flag the gluten-free products.",
          },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(ScanResult) },
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    return NextResponse.json(
      { error: "Could not parse the receipt image." },
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
