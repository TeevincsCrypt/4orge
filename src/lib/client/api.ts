"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: init.signal,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(res.status, "invalid_response", `Unexpected response from server (HTTP ${res.status}).`);
  }
  if (!res.ok) {
    const err = (data as { error?: { code: string; message: string; details?: unknown } })?.error;
    throw new ApiError(res.status, err?.code ?? "error", err?.message ?? `Request failed (HTTP ${res.status}).`, err?.details);
  }
  return data as T;
}

export interface Resource<T> {
  data: T | null;
  error: ApiError | Error | null;
  loading: boolean;
  reload: () => Promise<void>;
  setData: (d: T | null) => void;
}

/** Minimal data-fetching hook (no cache library needed). */
export function useApi<T>(path: string | null, opts: { pollMs?: number } = {}): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(path));
  const current = useRef(path);
  useEffect(() => {
    current.current = path;
  }, [path]);

  const load = useCallback(async () => {
    if (!path) return;
    try {
      const d = await api<T>(path);
      if (current.current === path) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (current.current === path) setError(e as Error);
    } finally {
      if (current.current === path) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    // Fetching on mount/path change is the purpose of this hook.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(Boolean(path));
    void load();
  }, [load, path]);

  useEffect(() => {
    if (!opts.pollMs || !path) return;
    const t = setInterval(() => void load(), opts.pollMs);
    return () => clearInterval(t);
  }, [opts.pollMs, path, load]);

  return { data, error, loading, reload: load, setData };
}
