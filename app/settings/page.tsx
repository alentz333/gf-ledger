"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Location = { locationId: string; name: string; address: string };

export default function SettingsPage() {
  const supabase = createClient();
  const router = useRouter();
  const [zip, setZip] = useState("");
  const [current, setCurrent] = useState<string | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("gf_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setCurrent(data.kroger_location_name);
        setZip(data.zip_code ?? "");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function search() {
    setBusy(true);
    setError(null);
    setLocations([]);
    try {
      const res = await fetch(`/api/locations?zip=${zip}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setLocations(data.locations);
      if (data.locations.length === 0) {
        setError("No Kroger-family stores found near that zip code.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  async function select(loc: Location) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("gf_settings").upsert({
      user_id: user.id,
      kroger_location_id: loc.locationId,
      kroger_location_name: loc.name,
      zip_code: zip,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      setError(error.message);
      return;
    }
    setCurrent(loc.name);
    setLocations([]);
    setMessage(`Comparison store set to ${loc.name}.`);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="font-semibold">Comparison store</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Non-gluten-free comparison prices come from a Kroger-family store
          near you (Kroger, Harris Teeter, Ralphs, Fred Meyer, King Soopers,
          Fry&apos;s, Smith&apos;s…).
        </p>
        <p className="mt-2 text-sm">
          Current store:{" "}
          <span className="font-semibold">
            {current ?? "none selected yet"}
          </span>
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            placeholder="Zip code"
            inputMode="numeric"
            maxLength={5}
            className="w-32 rounded-lg border border-zinc-300 px-3 py-2"
          />
          <button
            onClick={search}
            disabled={busy || !/^\d{5}$/.test(zip)}
            className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Searching…" : "Find stores"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {message && <p className="mt-2 text-sm text-emerald-700">{message}</p>}
        {locations.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {locations.map((l) => (
              <li key={l.locationId}>
                <button
                  onClick={() => select(l)}
                  className="w-full rounded-lg border border-zinc-200 p-3 text-left hover:border-emerald-400"
                >
                  <div className="font-medium">{l.name}</div>
                  <div className="text-sm text-zinc-500">{l.address}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600">
        <h2 className="font-semibold text-zinc-900">How the deduction works</h2>
        <p className="mt-2">
          For celiac disease diagnosed by a physician, the IRS allows deducting
          the <em>difference</em> between what you pay for gluten-free food and
          the cost of the comparable conventional product — plus the full cost
          of items that exist only for a GF diet (like xanthan gum). Keep your
          receipts (this app stores the photos), a doctor&apos;s letter, and
          this report. Medical expenses are deductible only above 7.5% of AGI
          if you itemize — check with your tax preparer.
        </p>
      </section>

      <button
        onClick={signOut}
        className="rounded-xl border border-zinc-300 bg-white py-2.5 font-semibold text-zinc-600"
      >
        Sign out
      </button>
    </main>
  );
}
