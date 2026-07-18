"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { itemDeduction, type Receipt, type ReceiptItem } from "@/lib/types";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function ReportPage() {
  const supabase = createClient();
  const [year, setYear] = useState(new Date().getFullYear());
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: rs } = await supabase
      .from("gf_receipts")
      .select("*")
      .gte("purchased_at", `${year}-01-01`)
      .lte("purchased_at", `${year}-12-31`)
      .order("purchased_at");
    const receiptList = rs ?? [];
    setReceipts(receiptList);
    if (receiptList.length > 0) {
      const { data: its } = await supabase
        .from("gf_receipt_items")
        .select("*")
        .eq("is_gf", true)
        .in(
          "receipt_id",
          receiptList.map((r: Receipt) => r.id)
        );
      setItems(its ?? []);
    } else {
      setItems([]);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  const receiptById = useMemo(
    () => new Map(receipts.map((r) => [r.id, r])),
    [receipts]
  );

  const rows = useMemo(
    () =>
      items
        .map((it) => {
          const r = receiptById.get(it.receipt_id)!;
          return { item: it, receipt: r, deduction: itemDeduction(it) };
        })
        .sort((a, b) =>
          a.receipt.purchased_at < b.receipt.purchased_at ? -1 : 1
        ),
    [items, receiptById]
  );

  const monthly = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of rows) {
      const month = row.receipt.purchased_at.slice(0, 7);
      m.set(month, (m.get(month) ?? 0) + (row.deduction ?? 0));
    }
    return [...m.entries()].sort();
  }, [rows]);

  const total = rows.reduce((s, r) => s + (r.deduction ?? 0), 0);
  const incomplete = rows.filter((r) => r.deduction == null).length;

  function exportCsv() {
    const header = [
      "Date",
      "Store",
      "GF Item",
      "Receipt Text",
      "Price Paid",
      "Comparison Item",
      "Comparison Price",
      "Comparison Source",
      "Deduction Type",
      "Deductible Amount",
    ];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = rows.map((r) =>
      [
        r.receipt.purchased_at,
        r.receipt.store_name ?? "",
        r.item.name,
        r.item.raw_text ?? "",
        Number(r.item.price).toFixed(2),
        r.item.deduction_type === "full"
          ? "N/A (no conventional counterpart)"
          : (r.item.comparison_name ?? ""),
        r.item.comparison_price != null
          ? Number(r.item.comparison_price).toFixed(2)
          : "",
        r.item.comparison_source ?? "",
        r.item.deduction_type,
        r.deduction != null ? r.deduction.toFixed(2) : "INCOMPLETE",
      ]
        .map(esc)
        .join(",")
    );
    const csv = [header.map(esc).join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `gf-ledger-${year}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const years = Array.from(
    { length: 5 },
    (_, i) => new Date().getFullYear() - i
  );

  return (
    <main className="print-full flex flex-col gap-4">
      <div className="no-print flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tax report</h1>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <div className="no-print flex gap-3">
        <button
          onClick={() => window.print()}
          className="flex-1 rounded-xl bg-zinc-900 py-2.5 font-semibold text-white"
        >
          Print / Save as PDF
        </button>
        <button
          onClick={exportCsv}
          className="flex-1 rounded-xl border border-zinc-300 bg-white py-2.5 font-semibold"
        >
          Export CSV
        </button>
      </div>

      {incomplete > 0 && (
        <p className="no-print text-sm text-amber-700">
          ⚠ {incomplete} item{incomplete === 1 ? "" : "s"} missing a comparison
          price — they are excluded from the total until completed.
        </p>
      )}

      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Printable header */}
          <div className="hidden print:block">
            <h1 className="text-xl font-bold">
              Gluten-Free Medical Expense Report — {year}
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Incremental cost of gluten-free foods purchased for the
              management of celiac disease, computed as the price paid for each
              gluten-free item minus the price of a comparable conventional
              item at a local grocery store (items with no conventional
              counterpart are counted in full). Generated by GF Ledger on{" "}
              {new Date().toLocaleDateString()}.
            </p>
          </div>

          <div className="rounded-xl bg-emerald-600 p-4 text-white print:border print:border-zinc-300 print:bg-white print:text-zinc-900">
            <div className="text-xs uppercase tracking-wide opacity-80">
              Total deductible for {year}
            </div>
            <div className="text-3xl font-bold">{fmt(total)}</div>
          </div>

          <section>
            <h2 className="mb-2 font-semibold">Monthly subtotals</h2>
            <table className="w-full rounded-xl border border-zinc-200 bg-white text-sm">
              <thead className="bg-zinc-100 text-left text-zinc-600">
                <tr>
                  <th className="px-3 py-2">Month</th>
                  <th className="px-3 py-2 text-right">Deductible</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map(([month, amount]) => (
                  <tr key={month} className="border-t border-zinc-100">
                    <td className="px-3 py-2">
                      {new Date(`${month}-15`).toLocaleString("en-US", {
                        month: "long",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-3 py-2 text-right">{fmt(amount)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-zinc-300 font-bold">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right">{fmt(total)}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section>
            <h2 className="mb-2 font-semibold">Line-item detail</h2>
            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
              <table className="w-full text-xs">
                <thead className="bg-zinc-100 text-left text-zinc-600">
                  <tr>
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2">GF item</th>
                    <th className="px-2 py-2 text-right">Paid</th>
                    <th className="px-2 py-2">Comparable item</th>
                    <th className="px-2 py-2 text-right">Comp. price</th>
                    <th className="px-2 py-2 text-right">Deductible</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.item.id} className="border-t border-zinc-100">
                      <td className="whitespace-nowrap px-2 py-1.5">
                        {r.receipt.purchased_at}
                      </td>
                      <td className="px-2 py-1.5">
                        {r.item.name}
                        <span className="block text-[10px] text-zinc-400">
                          {r.receipt.store_name}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {fmt(Number(r.item.price))}
                      </td>
                      <td className="px-2 py-1.5">
                        {r.item.deduction_type === "full"
                          ? "None exists — fully deductible"
                          : (r.item.comparison_name ?? "—")}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {r.item.comparison_price != null
                          ? fmt(Number(r.item.comparison_price))
                          : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right font-semibold">
                        {r.deduction != null ? fmt(r.deduction) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
