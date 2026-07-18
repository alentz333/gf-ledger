"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function CapturePage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError(null);
  }

  async function scan() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/scan", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed");
      router.push(`/receipts/${data.receiptId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Scan a receipt</h1>
      <p className="text-sm text-zinc-500">
        Take a photo of the whole receipt — good lighting, flat surface. The AI
        reads every line, flags gluten-free items, and looks up comparison
        prices.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPick}
      />

      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt="Receipt preview"
          className="max-h-96 rounded-xl border border-zinc-200 object-contain"
        />
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          className="flex h-56 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 bg-white text-zinc-500"
        >
          <span className="text-4xl">📷</span>
          Tap to take a photo or choose one
        </button>
      )}

      {preview && (
        <div className="flex gap-3">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex-1 rounded-xl border border-zinc-300 bg-white py-3 font-semibold"
          >
            Retake
          </button>
          <button
            onClick={scan}
            disabled={busy}
            className="flex-1 rounded-xl bg-emerald-600 py-3 font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Reading receipt…" : "Scan it"}
          </button>
        </div>
      )}

      {busy && (
        <p className="animate-pulse text-sm text-zinc-500">
          Uploading photo and reading line items — this takes ~20–60 seconds…
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </main>
  );
}
