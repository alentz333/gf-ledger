"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { itemDeduction, type Receipt, type ReceiptItem } from "@/lib/types";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

type ItemRow = ReceiptItem & { search_term?: string | null; comparing?: boolean };

export default function ReceiptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const supabase = createClient();

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [showImage, setShowImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: r } = await supabase
      .from("gf_receipts")
      .select("*")
      .eq("id", id)
      .single();
    setReceipt(r);
    const { data: its } = await supabase
      .from("gf_receipt_items")
      .select("*")
      .eq("receipt_id", id)
      .order("created_at");
    setItems(its ?? []);
    if (r?.image_path) {
      const { data: signed } = await supabase.storage
        .from("gf-receipts")
        .createSignedUrl(r.image_path, 3600);
      setImageUrl(signed?.signedUrl ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function patchItem(itemId: string, patch: Partial<ItemRow>) {
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, ...patch } : it))
    );
  }

  async function compare(item: ItemRow, term?: string) {
    patchItem(item.id, { comparing: true });
    setError(null);
    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, term }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Comparison failed");
      if (data.match) {
        const { data: fresh } = await supabase
          .from("gf_receipt_items")
          .select("*")
          .eq("id", item.id)
          .single();
        if (fresh) patchItem(item.id, { ...fresh, comparing: false });
      } else {
        patchItem(item.id, { comparing: false });
        setError(
          `No match found for "${term || item.search_term || item.name}" — try a simpler search term or enter a price manually.`
        );
      }
    } catch (e) {
      patchItem(item.id, { comparing: false });
      setError(e instanceof Error ? e.message : "Comparison failed");
    }
  }

  async function compareAll() {
    for (const it of items) {
      if (it.is_gf && it.deduction_type === "difference" && it.comparison_price == null) {
        await compare(it);
      }
    }
  }

  async function saveAll(markSaved: boolean) {
    if (!receipt) return;
    setSaving(true);
    setError(null);
    const { error: rErr } = await supabase
      .from("gf_receipts")
      .update({
        store_name: receipt.store_name,
        purchased_at: receipt.purchased_at,
        total_paid: receipt.total_paid,
        status: markSaved ? "saved" : receipt.status,
      })
      .eq("id", receipt.id);
    let iErr = null;
    for (const it of items) {
      const { error: e } = await supabase
        .from("gf_receipt_items")
        .update({
          name: it.name,
          price: it.price,
          quantity: it.quantity,
          is_gf: it.is_gf,
          deduction_type: it.deduction_type,
          comparison_name: it.comparison_name,
          comparison_price: it.comparison_price,
          comparison_source: it.comparison_source,
          search_term: it.search_term ?? null,
        })
        .eq("id", it.id);
      if (e) iErr = e;
    }
    setSaving(false);
    if (rErr || iErr) {
      setError((rErr ?? iErr)?.message ?? "Save failed");
      return;
    }
    if (markSaved) router.push("/receipts");
  }

  async function deleteReceipt() {
    if (!receipt) return;
    if (!confirm("Delete this receipt and all its items?")) return;
    if (receipt.image_path) {
      await supabase.storage.from("gf-receipts").remove([receipt.image_path]);
    }
    await supabase.from("gf_receipts").delete().eq("id", receipt.id);
    router.push("/receipts");
  }

  if (!receipt) {
    return <p className="pt-10 text-center text-zinc-500">Loading…</p>;
  }

  const gfItems = items.filter((i) => i.is_gf);
  const totalDeduction = gfItems.reduce(
    (sum, i) => sum + (itemDeduction(i) ?? 0),
    0
  );
  const pending = gfItems.filter((i) => itemDeduction(i) == null).length;

  return (
    <main className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">
          {receipt.status === "review" ? "Review receipt" : "Receipt"}
        </h1>
        <button onClick={deleteReceipt} className="text-sm text-red-600">
          Delete
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Store
          <input
            value={receipt.store_name ?? ""}
            onChange={(e) =>
              setReceipt({ ...receipt, store_name: e.target.value })
            }
            className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Date
          <input
            type="date"
            value={receipt.purchased_at}
            onChange={(e) =>
              setReceipt({ ...receipt, purchased_at: e.target.value })
            }
            className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
          />
        </label>
      </div>

      {imageUrl && (
        <div>
          <button
            onClick={() => setShowImage(!showImage)}
            className="text-sm text-emerald-700 underline"
          >
            {showImage ? "Hide" : "Show"} receipt photo
          </button>
          {showImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt="Receipt"
              className="mt-2 max-h-[32rem] rounded-xl border border-zinc-200 object-contain"
            />
          )}
        </div>
      )}

      <div className="flex items-center justify-between rounded-xl bg-emerald-600 p-4 text-white">
        <div>
          <div className="text-xs uppercase tracking-wide opacity-80">
            Deductible on this receipt
          </div>
          <div className="text-2xl font-bold">{fmt(totalDeduction)}</div>
        </div>
        {pending > 0 && (
          <button
            onClick={compareAll}
            className="rounded-lg bg-white/20 px-3 py-2 text-sm font-semibold"
          >
            Find {pending} price{pending === 1 ? "" : "s"}
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="flex flex-col gap-3">
        {items.map((it) => {
          const d = itemDeduction(it);
          return (
            <li
              key={it.id}
              className={`rounded-xl border bg-white p-3 ${
                it.is_gf ? "border-emerald-300" : "border-zinc-200"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <input
                  value={it.name}
                  onChange={(e) => patchItem(it.id, { name: e.target.value })}
                  className="w-full rounded border-0 bg-transparent font-medium focus:bg-zinc-50"
                />
                <input
                  type="number"
                  step="0.01"
                  value={it.price}
                  onChange={(e) =>
                    patchItem(it.id, { price: Number(e.target.value) })
                  }
                  className="w-20 rounded border border-zinc-200 px-1 py-0.5 text-right text-sm"
                />
              </div>
              {it.raw_text && (
                <div className="mt-0.5 text-xs text-zinc-400">
                  “{it.raw_text}”
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <button
                  onClick={() => patchItem(it.id, { is_gf: !it.is_gf })}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    it.is_gf
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-zinc-100 text-zinc-500"
                  }`}
                >
                  {it.is_gf ? "✓ Gluten-free" : "Not GF"}
                </button>
                {it.is_gf && (
                  <select
                    value={it.deduction_type}
                    onChange={(e) =>
                      patchItem(it.id, {
                        deduction_type: e.target.value as
                          | "difference"
                          | "full",
                      })
                    }
                    className="rounded border border-zinc-200 px-1.5 py-1 text-xs"
                  >
                    <option value="difference">Deduct difference</option>
                    <option value="full">Fully deductible (no non-GF version)</option>
                  </select>
                )}
              </div>

              {it.is_gf && it.deduction_type === "difference" && (
                <div className="mt-2 rounded-lg bg-zinc-50 p-2 text-sm">
                  {it.comparison_price != null ? (
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs text-zinc-600">
                          vs. {it.comparison_name || "conventional item"}
                        </div>
                        <div className="text-xs text-zinc-400">
                          {it.comparison_source}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          value={it.comparison_price ?? ""}
                          onChange={(e) =>
                            patchItem(it.id, {
                              comparison_price:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            })
                          }
                          className="w-20 rounded border border-zinc-200 px-1 py-0.5 text-right"
                        />
                        <button
                          onClick={() => compare(it)}
                          disabled={it.comparing}
                          className="text-xs text-emerald-700 underline"
                        >
                          {it.comparing ? "…" : "redo"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        placeholder="Search term (e.g. sandwich bread)"
                        value={it.search_term ?? ""}
                        onChange={(e) =>
                          patchItem(it.id, { search_term: e.target.value })
                        }
                        className="flex-1 rounded border border-zinc-200 px-2 py-1 text-xs"
                      />
                      <button
                        onClick={() => compare(it, it.search_term ?? undefined)}
                        disabled={it.comparing}
                        className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {it.comparing ? "Searching…" : "Find price"}
                      </button>
                    </div>
                  )}
                  {d != null && it.comparison_price != null && (
                    <div className="mt-1 text-right text-xs font-semibold text-emerald-700">
                      deductible: {fmt(d)}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex gap-3 pb-4">
        <button
          onClick={() => saveAll(false)}
          disabled={saving}
          className="flex-1 rounded-xl border border-zinc-300 bg-white py-3 font-semibold disabled:opacity-50"
        >
          Save draft
        </button>
        <button
          onClick={() => saveAll(true)}
          disabled={saving}
          className="flex-1 rounded-xl bg-emerald-600 py-3 font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Confirm & save"}
        </button>
      </div>
    </main>
  );
}
