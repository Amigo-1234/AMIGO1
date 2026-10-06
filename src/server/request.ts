import "server-only";
import { headers } from "next/headers";

/**
 * The client's network address for throttling, as reported by the hosting platform.
 * On Vercel, `x-real-ip` / the first `x-forwarded-for` entry are set by Vercel's edge, not
 * by the client. Only ever used as input to a keyed hash; never stored or logged raw.
 */
export async function getClientAddress(): Promise<string | null> {
  const h = await headers();
  const address = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0];
  return address?.trim().slice(0, 64) || null;
}

export async function getUserAgent(): Promise<string | null> {
  return (await headers()).get("user-agent");
}
