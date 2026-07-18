import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export const MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const ScannedItem = z.object({
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

export const ScanResult = z.object({
  store_name: z.string().describe("Store name from the receipt, empty string if unknown"),
  purchase_date: z
    .string()
    .describe("Purchase date as YYYY-MM-DD, empty string if not visible"),
  total: z.number().describe("Receipt grand total, 0 if not visible"),
  items: z.array(ScannedItem),
});

export type ScanResultType = z.infer<typeof ScanResult>;

export const SCAN_SYSTEM_PROMPT = `You are a receipt parser for a celiac tax-deduction tracker.
The user photographs grocery receipts. Extract every product line item.
Expand cryptic receipt abbreviations into real product names using your knowledge
of grocery brands (e.g. "UDIS GF WHT BRD" is "Udi's Gluten Free White Bread").
Flag gluten-free items conservatively and accurately:
- TRUE: products that are gluten-free versions of normally wheat-based foods
  (bread, pasta, flour, crackers, cookies, pizza crust, cereal, pretzels, soy sauce/tamari),
  or explicitly GF-labeled items from GF brands (Udi's, Canyon Bakehouse, Schar, Jovial,
  Banza, Tinkyada, Bob's Red Mill GF line, King Arthur GF, Simple Mills, Glutino, etc.)
- FALSE: naturally gluten-free whole foods that are not marketed as a GF substitute
  (produce, meat, eggs, milk, plain rice, potatoes, frozen fries, plain cheese),
  and all conventional wheat-based products.
Set deduction_type to 'full' ONLY for products that exist solely for gluten-free baking
and have no conventional counterpart a non-celiac shopper would buy (xanthan gum,
guar gum, psyllium husk). Everything else that is gluten-free uses 'difference'.
Exclude tax lines, subtotals, totals, deposits, standalone coupons, and bag fees from
items (but reflect item-specific coupon discounts in that item's price).`;

/** Runs the vision + structured-output call. Throws on an unparseable receipt. */
export async function parseReceipt(
  base64: string,
  mediaType: MediaType,
  client = new Anthropic()
): Promise<ScanResultType> {
  const response = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 16000,
    system: SCAN_SYSTEM_PROMPT,
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

  if (!response.parsed_output) {
    throw new Error("Could not parse the receipt image.");
  }
  return response.parsed_output;
}
