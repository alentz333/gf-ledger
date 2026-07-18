import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Receipt, ReceiptItem } from "@/lib/types";
import { itemDeduction } from "@/lib/types";

export const dynamic = "force-dynamic";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default async function ReceiptsPage() {
  const supabase = await createClient();
  const { data: receipts } = await supabase
    .from("gf_receipts")
    .select("*")
    .order("purchased_at", { ascending: false });
  const list = (receipts ?? []) as Receipt[];

  const { data: items } = await supabase
    .from("gf_receipt_items")
    .select("*")
    .in(
      "receipt_id",
      list.map((r) => r.id)
    );
  const byReceipt = new Map<string, ReceiptItem[]>();
  for (const it of (items ?? []) as ReceiptItem[]) {
    const arr = byReceipt.get(it.receipt_id) ?? [];
    arr.push(it);
    byReceipt.set(it.receipt_id, arr);
  }

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Receipts</h1>
      {list.length === 0 && (
        <p className="text-sm text-zinc-500">
          Nothing here yet — scan your first receipt.
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {list.map((r) => {
          const its = byReceipt.get(r.id) ?? [];
          const gf = its.filter((i) => i.is_gf);
          const deduction = gf.reduce(
            (sum, i) => sum + (itemDeduction(i) ?? 0),
            0
          );
          return (
            <li key={r.id}>
              <Link
                href={`/receipts/${r.id}`}
                className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4"
              >
                <div>
                  <div className="font-semibold">
                    {r.store_name || "Receipt"}
                  </div>
                  <div className="text-sm text-zinc-500">
                    {r.purchased_at} · {gf.length} GF item
                    {gf.length === 1 ? "" : "s"}
                    {r.status === "review" && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                        needs review
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-emerald-700">
                    {fmt(deduction)}
                  </div>
                  <div className="text-xs text-zinc-400">deductible</div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
