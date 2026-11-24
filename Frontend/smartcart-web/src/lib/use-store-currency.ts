"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useStoreCurrency() {
  const settings = useQuery({ queryKey: ["public-store-settings"], queryFn: api.publicStoreSettings, staleTime: 30_000 });
  return settings.data?.currency || "INR";
}
