export type Receipt = {
  id: string;
  user_id: string;
  store_name: string | null;
  purchased_at: string;
  image_path: string | null;
  total_paid: number | null;
  status: "review" | "saved";
  created_at: string;
};

export type ReceiptItem = {
  id: string;
  receipt_id: string;
  user_id: string;
  raw_text: string | null;
  name: string;
  price: number;
  quantity: number;
  is_gf: boolean;
  deduction_type: "difference" | "full";
  comparison_name: string | null;
  comparison_price: number | null;
  comparison_source: string | null;
  created_at: string;
};

export type Settings = {
  user_id: string;
  kroger_location_id: string | null;
  kroger_location_name: string | null;
  zip_code: string | null;
};

/** Deductible amount for one line item, per IRS guidance for celiac disease:
 *  - "difference": GF price minus comparable conventional price (never below 0)
 *  - "full": items with no conventional counterpart are fully deductible
 */
export function itemDeduction(item: ReceiptItem): number | null {
  if (!item.is_gf) return 0;
  if (item.deduction_type === "full") return item.price;
  if (item.comparison_price == null) return null; // not yet compared
  return Math.max(0, item.price - item.comparison_price);
}
