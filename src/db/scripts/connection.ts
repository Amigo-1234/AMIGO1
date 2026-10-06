import net from "node:net";
import { Pool, type PoolConfig } from "pg";

/** Load .env.local / .env when present (scripts run outside Next.js). */
export function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(file);
    } catch {
      // File absent: rely on the real environment.
    }
  }
}

export type ScriptConnection = { pool: Pool; host: string; close: () => Promise<void> };

/**
 * A single-connection pool for maintenance scripts (migrate, seed, verify). Prefers the
 * direct (unpooled) Neon URL, which migrations need. Prints only the host, never
 * credentials.
 *
 * Set DATABASE_PROXY_TUNNEL=1 where outbound traffic must go through an HTTP CONNECT
 * proxy (HTTPS_PROXY), e.g. locked-down CI or cloud sandboxes: the connection is then
 * tunnelled through the proxy, with TLS still verified end to end against the real host.
 */
export async function openScriptConnection(): Promise<ScriptConnection> {
  loadLocalEnv();
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    console.error("Missing DATABASE_URL_UNPOOLED (or DATABASE_URL). See .env.example.");
    process.exit(1);
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Never echo the value: Node's URL error includes the full input string.
    console.error("The database connection string is not a valid URL.");
    process.exit(1);
  }
  console.log(`Database host: ${parsed.hostname}`);

  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (process.env.DATABASE_PROXY_TUNNEL !== "1" || !proxy) {
    const pool = new Pool({ connectionString: url, max: 1 });
    return { pool, host: parsed.hostname, close: () => pool.end() };
  }

  const tunnel = await startConnectTunnel(
    new URL(proxy),
    parsed.hostname,
    Number(parsed.port || 5432),
  );
  const sslmode = parsed.searchParams.get("sslmode");
  const config: PoolConfig = {
    host: "127.0.0.1",
    port: tunnel.port,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.slice(1)),
    max: 1,
    // TLS is negotiated with the real database host (SNI routes Neon endpoints).
    ssl: sslmode === "disable" ? false : { servername: parsed.hostname, rejectUnauthorized: true },
  };
  console.log("Connecting through the HTTPS proxy tunnel.");
  const pool = new Pool(config);
  return {
    pool,
    host: parsed.hostname,
    close: async () => {
      await pool.end();
      await tunnel.close();
    },
  };
}

/** Every secret-looking value from the database environment variables (URLs and their parts). */
function secretFragments(): string[] {
  const fragments = new Set<string>();
  for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"]) {
    const value = process.env[key];
    if (!value) continue;
    fragments.add(value);
    try {
      const url = new URL(value);
      for (const part of [url.password, decodeURIComponent(url.password), url.username]) {
        if (part && part.length >= 4) fragments.add(part);
      }
    } catch {
      // Unparseable values are still redacted as a whole.
    }
  }
  // Longest first so a full URL is replaced before its parts.
  return [...fragments].sort((a, b) => b.length - a.length);
}

export function redactSecrets(text: string): string {
  let result = text;
  for (const fragment of secretFragments()) result = result.split(fragment).join("***");
  // Belt and braces: hide credentials in any connection URL that slipped through.
  return result.replace(/(postgres(?:ql)?:\/\/)[^@\s/]+@/gi, "$1***@");
}

/**
 * Report a script failure without risking credential exposure: only error messages and
 * codes are printed (never whole error objects, which can carry connection details),
 * after redacting every known secret fragment.
 */
export function reportScriptError(label: string, error: unknown): void {
  const lines: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    const e = current as { message?: unknown; code?: unknown; cause?: unknown };
    const code = typeof e.code === "string" ? ` [${e.code}]` : "";
    lines.push(`${String(e.message ?? current)}${code}`);
    current = e.cause;
  }
  console.error(redactSecrets(`${label}: ${lines.join("\n  caused by: ")}`));
  process.exitCode = 1;
}

/** Local TCP listener that forwards each connection through an HTTP CONNECT proxy. */
async function startConnectTunnel(proxy: URL, host: string, port: number) {
  const server = net.createServer((client) => {
    const upstream = net.connect(Number(proxy.port || 80), proxy.hostname);
    const auth =
      proxy.username || proxy.password
        ? `Proxy-Authorization: Basic ${Buffer.from(
            `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`,
          ).toString("base64")}\r\n`
        : "";
    upstream.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n${auth}\r\n`);
    // Read the proxy's response headers, then splice the two sockets together.
    let head = Buffer.alloc(0);
    const onHead = (chunk: Buffer) => {
      head = Buffer.concat([head, chunk]);
      const end = head.indexOf("\r\n\r\n");
      if (end === -1) return;
      upstream.off("data", onHead);
      const status = head.subarray(0, head.indexOf("\r\n")).toString("latin1");
      if (!/^HTTP\/1\.[01] 200/.test(status)) {
        console.error(`Proxy refused the database connection: ${status}`);
        client.destroy();
        upstream.destroy();
        return;
      }
      const rest = head.subarray(end + 4);
      if (rest.length) client.write(rest);
      client.pipe(upstream).pipe(client);
    };
    upstream.on("data", onHead);
    const end = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on("error", end);
    upstream.on("error", end);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as net.AddressInfo;
  return {
    port: address.port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
