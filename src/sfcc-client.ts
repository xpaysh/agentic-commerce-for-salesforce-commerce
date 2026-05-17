/**
 * Thin REST wrapper around the Salesforce Commerce Cloud B2C OCAPI Shop API.
 *
 * Auth flow:
 *   1. POST to Account Manager `auth_url` with HTTP Basic
 *      (client_id:client_secret) and form-encoded `grant_type=client_credentials`
 *      → access_token (Bearer, ~30 min TTL).
 *   2. Use Bearer token on all subsequent OCAPI Shop API calls.
 *   3. Refresh on 401.
 *
 * Endpoints:
 *   https://<instance>/s/<siteId>/dw/shop/<version>/<resource>
 *
 * The OCAPI Shop endpoints exposed to client_id need to be allowlisted in
 * Business Manager → Open Commerce API Settings → Shop (JSON config).
 */

import type { SfccCredentials } from "./config";

export class SfccError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: unknown,
    public readonly url: string,
  ) {
    super(`SFCC ${status} ${statusText} at ${url}`);
    this.name = "SfccError";
  }
}

export class SfccClient {
  private accessToken: string | undefined;
  private tokenExpiresAt = 0;

  constructor(private readonly creds: SfccCredentials) {}

  async fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.getAccessToken();
    const url = this.shopUrl(path);
    const headers = new Headers(init.headers || {});
    headers.set("authorization", `Bearer ${token}`);
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    let res = await fetch(url, { ...init, headers });
    if (res.status === 401) {
      // Token may have expired mid-flight; refresh once and retry.
      this.accessToken = undefined;
      const fresh = await this.getAccessToken();
      headers.set("authorization", `Bearer ${fresh}`);
      res = await fetch(url, { ...init, headers });
    }
    const text = await res.text();
    let body: unknown = undefined;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    if (!res.ok) throw new SfccError(res.status, res.statusText, body, url);
    return body as T;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 30_000) {
      return this.accessToken;
    }
    const basic = Buffer.from(`${this.creds.clientId}:${this.creds.clientSecret}`).toString("base64");
    const res = await fetch(this.creds.authUrl, {
      method: "POST",
      headers: {
        authorization: `Basic ${basic}`,
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: "grant_type=client_credentials",
    });
    const text = await res.text();
    if (!res.ok) {
      throw new SfccError(res.status, res.statusText, text, this.creds.authUrl);
    }
    let parsed: { access_token?: string; expires_in?: number } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new SfccError(res.status, "invalid token response", text, this.creds.authUrl);
    }
    if (!parsed.access_token) {
      throw new SfccError(res.status, "no access_token in response", parsed, this.creds.authUrl);
    }
    this.accessToken = parsed.access_token;
    const ttlMs = (parsed.expires_in ?? 1800) * 1000;
    this.tokenExpiresAt = Date.now() + ttlMs;
    return this.accessToken;
  }

  private shopUrl(path: string): string {
    const inst = this.creds.instance;
    const site = this.creds.siteId;
    const ver = this.creds.ocapiVersion;
    const p = path.startsWith("/") ? path : `/${path}`;
    // Support either explicit absolute /s/<siteId>/... or relative /<resource>.
    if (p.startsWith("/s/")) return `https://${inst}${p}`;
    const sep = p.includes("?") ? "&" : "?";
    const u = `https://${inst}/s/${site}/dw/shop/${ver}${p}${sep}client_id=${encodeURIComponent(this.creds.clientId)}`;
    return u;
  }

  get clientId(): string {
    return this.creds.clientId;
  }
  get siteId(): string {
    return this.creds.siteId;
  }
}
