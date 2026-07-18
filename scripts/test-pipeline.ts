/**
 * End-to-end check of the scan + comparison pipeline against the live APIs.
 * Skips auth/Supabase — it exercises the parts that talk to Claude and Kroger.
 *
 *   npx tsx scripts/test-pipeline.ts <receipt-image> [kroger-location-id]
 */
import { readFileSync } from "node:fs";
import { parseReceipt, type MediaType } from "../lib/scan";
import { searchProducts } from "../lib/kroger";

const usd = (n: number) => `$${n.toFixed(2)}`;

async function main() {
  const imagePath = process.argv[2];
  const locationId = process.argv[3] ?? "01400513";
  if (!imagePath) {
    console.error("usage: tsx scripts/test-pipeline.ts <image> [locationId]");
    process.exit(1);
  }

  const ext = imagePath.split(".").pop()!.toLowerCase();
  const mediaType = (ext === "png" ? "image/png" : "image/jpeg") as MediaType;
  const base64 = readFileSync(imagePath).toString("base64");

  console.log("→ Scanning receipt with Claude…");
  const t0 = Date.now();
  const parsed = await parseReceipt(base64, mediaType);
  console.log(`  done in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

  console.log(`Store: ${parsed.store_name}`);
  console.log(`Date:  ${parsed.purchase_date}`);
  console.log(`Total: ${usd(parsed.total)}\n`);

  console.log("Line items:");
  for (const it of parsed.items) {
    const tag = it.is_gluten_free
      ? it.deduction_type === "full"
        ? "GF-FULL"
        : "GF     "
      : "       ";
    console.log(
      `  [${tag}] ${usd(it.price).padStart(7)}  ${it.name}` +
        (it.comparison_search_term ? `   → search: "${it.comparison_search_term}"` : "")
    );
  }

  const gf = parsed.items.filter((i) => i.is_gluten_free);
  console.log(`\n→ Pricing ${gf.length} GF items at Kroger store ${locationId}…\n`);

  let deduction = 0;
  let missing = 0;
  for (const it of gf) {
    if (it.deduction_type === "full") {
      deduction += it.price;
      console.log(`  ${it.name}`);
      console.log(`    no conventional counterpart → fully deductible ${usd(it.price)}\n`);
      continue;
    }
    const term = it.comparison_search_term || it.name;
    const results = await searchProducts(term, locationId);
    if (results.length === 0) {
      missing++;
      console.log(`  ${it.name}`);
      console.log(`    ⚠ no match for "${term}"\n`);
      continue;
    }
    const cheapest = results[0];
    const d = Math.max(0, it.price - cheapest.price);
    deduction += d;
    console.log(`  ${it.name}  ${usd(it.price)}`);
    console.log(`    vs ${cheapest.name} ${usd(cheapest.price)}  →  deductible ${usd(d)}\n`);
  }

  console.log(`TOTAL DEDUCTIBLE: ${usd(deduction)}`);
  if (missing) console.log(`(${missing} item(s) needed a manual price)`);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
