"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type RealtimeRefreshProps = { tables: readonly string[] };

/** Refresh the current Server Component tree after relevant Postgres changes. */
export function RealtimeRefresh({ tables }: RealtimeRefreshProps) {
  const router = useRouter();
  const tableKey = tables.join(",");

  useEffect(() => {
    const supabase = createClient();
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let channel = supabase.channel(`realtime-refresh:${tableKey}`);

    for (const table of tableKey.split(",").filter(Boolean)) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          if (refreshTimer) clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => router.refresh(), 500);
        },
      );
    }

    channel.subscribe();
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [router, tableKey]);

  return null;
}
