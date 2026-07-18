import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { itemDeduction, type ReceiptItem, type Receipt } from "@/lib/types";

export const dynamic = "force-dynamic";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const year = new Date().getFullYear();
  const { data: receipts } = await supabase
    .from("gf_receipts")
    .select("*")
    .gte("purchased_at", `${year}-01-01`)
    .order("purchased_at", { ascending: false });
  const receiptList = (receipts ?? []) as Receipt[];

  const { data: items } = await supabase
    .from("gf_receipt_items")
    .select("*")
    .in(
      "receipt_id",
      receiptList.map((r) => r.id)
    );
  const itemList = (items ?? []) as ReceiptItem[];

  const receiptDates = new Map(receiptList.map((r) => [r.id, r.purchased_at]));
  const monthly = new Map<string, { gfSpend: number; deduction: number }>();
  let yearGf = 0;
  let yearDeduction = 0;
  let pendingCount = 0;

  for (const it of itemList) {
    if (!it.is_gf) continue;
    const date = receiptDates.get(it.receipt_id);
    if (!date) continue;
    const month = date.slice(0, 7);
    const d = itemDeduction(it);
    const entry = monthly.get(month) ?? { gfSpend: 0, deduction: 0 };
    entry.gfSpend += Number(it.price);
    yearGf += Number(it.price);
    if (d == null) {
      pendingCount++;
    } else {
      entry.deduction += d;
      yearDeduction += d;
    }
    monthly.set(month, entry);
  }

  const needsReview = receiptList.filter((r) => r.status === "review");
  const months = [...monthly.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));

  return (
    <main className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🌾 GF Ledger</h1>
        <span className="text-sm text-zinc-500">{year}</span>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-emerald-600 p-4 text-white">
          <div className="text-xs uppercase tracking-wide opacity-80">
            {year} deductible
          </div>
          <div className="mt-1 text-2xl font-bold">{fmt(yearDeduction)}</div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            GF spend
          </div>
          <div className="mt-1 text-2xl font-bold">{fmt(yearGf)}</div>
        </div>
      </div>

      {pendingCount > 0 && (
        <p className="text-sm text-amber-700">
          {pendingCount} gluten-free item{pendingCount === 1 ? "" : "s"} still
          need a comparison price — open the receipt to finish.
        </p>
      )}

      {needsReview.length > 0 && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <h2 className="font-semibold text-amber-900">Needs review</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {needsReview.map((r) => (
              <li key={r.id}>
                <Link
                  className="text-sm text-amber-800 underline"
                  href={`/receipts/${r.id}`}
                >
                  {r.store_name || "Receipt"} · {r.purchased_at}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link
        href="/capture"
        className="rounded-xl bg-zinc-900 py-3 text-center font-semibold text-white"
      >
        📷 Scan a receipt
      </Link>

      <section>
        <h2 className="mb-2 font-semibold">By month</h2>
        {months.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No gluten-free purchases logged yet this year.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-zinc-100 text-left text-zinc-600">
                <tr>
                  <th className="px-3 py-2">Month</th>
                  <th className="px-3 py-2 text-right">GF spend</th>
                  <th className="px-3 py-2 text-right">Deductible</th>
                </tr>
              </thead>
              <tbody>
                {months.map(([month, v]) => (
                  <tr key={month} className="border-t border-zinc-100">
                    <td className="px-3 py-2">
                      {new Date(`${month}-15`).toLocaleString("en-US", {
                        month: "long",
                      })}
                    </td>
                    <td className="px-3 py-2 text-right">{fmt(v.gfSpend)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-700">
                      {fmt(v.deduction)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
