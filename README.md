# 🌾 GF Ledger

A mobile-first PWA that turns grocery receipts into a celiac tax-deduction audit trail.

People with physician-diagnosed celiac disease can deduct the **extra** cost of gluten-free food as a medical expense — the difference between what a gluten-free item costs and what the comparable conventional item costs (and the full price of items that only exist for a GF diet, like xanthan gum). Tracking that by hand is miserable. GF Ledger does it from a photo.

## How it works

1. **Snap a receipt** — Claude (vision) reads every line item, expands cryptic receipt abbreviations (`GF BRD UDIS` → *Udi's Gluten Free Bread*), and flags the gluten-free products.
2. **Price the counterpart** — for each GF item, the Kroger API finds the cheapest comparable conventional product at your local Kroger-family store.
3. **Review & save** — confirm or fix every flag, match, and price in ~30 seconds. The original photo is stored as audit evidence.
4. **Report** — monthly/yearly dashboard, printable annual PDF report, and CSV export for your accountant.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS 4), installable PWA
- **Supabase** — auth, Postgres (`gf_` tables with RLS), private storage bucket for receipt photos
- **Claude API** (`@anthropic-ai/sdk`) — one vision call per receipt with structured (Zod-validated) output
- **Kroger Public API** — real shelf prices by store location (client-credentials flow, `product.compact` scope)

## Running it

```bash
npm install
npm run dev
```

Required env vars (`.env.local`):

| Var | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project settings |
| `ANTHROPIC_API_KEY` | [platform.claude.com](https://platform.claude.com/settings/keys) |
| `KROGER_CLIENT_ID` / `KROGER_CLIENT_SECRET` | Free app at [developer.kroger.com](https://developer.kroger.com) (Production environment, Products API) |

Database schema lives in Supabase migrations (`gf_receipts`, `gf_receipt_items`, `gf_settings`, plus the private `gf-receipts` storage bucket).

## Features

- 📷 Camera capture with AI receipt parsing (OCR + GF detection in one call)
- 🏪 Kroger store picker by zip code; cheapest-match comparison pricing with manual override
- ✏️ Full review flow — every AI decision is editable before saving
- 🧾 Receipt photos retained as audit evidence (private bucket, signed URLs)
- 📊 Monthly/yearly deduction dashboard
- 🖨 Printable annual report (browser print → PDF) and CSV export
- 📱 Installable PWA with bottom-tab navigation

> **Not tax advice.** Medical-expense deductions require itemizing and only count above 7.5% of AGI — talk to a tax professional.
