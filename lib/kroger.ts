// Kroger Public API helpers (https://developer.kroger.com)
// Uses the client-credentials flow with the product.compact scope.

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getKrogerToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }
  const id = process.env.KROGER_CLIENT_ID;
  const secret = process.env.KROGER_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error(
      "Kroger API credentials missing. Set KROGER_CLIENT_ID and KROGER_CLIENT_SECRET."
    );
  }
  const res = await fetch("https://api.kroger.com/v1/connect/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials&scope=product.compact",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Kroger token request failed (${res.status})`);
  }
  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

type KrogerProduct = {
  productId: string;
  description: string;
  brand?: string;
  items?: {
    price?: { regular?: number; promo?: number };
    size?: string;
  }[];
};

export type Comparison = {
  name: string;
  brand: string | null;
  size: string | null;
  price: number;
};

/** Search products at a store and return them sorted by price (cheapest first). */
export async function searchProducts(
  term: string,
  locationId: string
): Promise<Comparison[]> {
  const token = await getKrogerToken();
  const params = new URLSearchParams({
    "filter.term": term,
    "filter.locationId": locationId,
    "filter.limit": "24",
  });
  const res = await fetch(`https://api.kroger.com/v1/products?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Kroger product search failed (${res.status})`);
  }
  const data = await res.json();
  const products: KrogerProduct[] = data.data ?? [];

  const results: Comparison[] = [];
  for (const p of products) {
    const item = p.items?.[0];
    const price = item?.price?.regular;
    if (!price || price <= 0) continue;
    // Skip products that are themselves gluten-free variants — we want the
    // conventional counterpart's price.
    if (/gluten[\s-]?free|\bgf\b/i.test(p.description)) continue;
    results.push({
      name: p.description,
      brand: p.brand ?? null,
      size: item?.size ?? null,
      price,
    });
  }
  results.sort((a, b) => a.price - b.price);
  return results;
}

export type KrogerLocation = {
  locationId: string;
  name: string;
  address: string;
};

export async function searchLocations(zip: string): Promise<KrogerLocation[]> {
  const token = await getKrogerToken();
  const params = new URLSearchParams({
    "filter.zipCode.near": zip,
    "filter.limit": "10",
  });
  const res = await fetch(`https://api.kroger.com/v1/locations?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Kroger location search failed (${res.status})`);
  }
  const data = await res.json();
  type Loc = {
    locationId: string;
    name: string;
    address?: { addressLine1?: string; city?: string; state?: string };
  };
  return (data.data ?? []).map((l: Loc) => ({
    locationId: l.locationId,
    name: l.name,
    address: [l.address?.addressLine1, l.address?.city, l.address?.state]
      .filter(Boolean)
      .join(", "),
  }));
}
