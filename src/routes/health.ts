import type { SfccClient } from "../sfcc-client";
import type { RouteHandler } from "./types";

export function buildHealthRoute(sf: SfccClient, version: string): RouteHandler {
  return async () => {
    let reachable = false;
    let err: string | undefined;
    try {
      await sf.fetchJson(`/product_search?q=test&count=1`);
      reachable = true;
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
    return {
      status: reachable ? 200 : 503,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
      body: JSON.stringify({
        ok: reachable,
        sfcc_reachable: reachable,
        sfcc_error: err,
        version,
        ts: new Date().toISOString(),
      }),
    };
  };
}
