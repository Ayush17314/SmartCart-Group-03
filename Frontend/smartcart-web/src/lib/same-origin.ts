import { NextRequest } from "next/server";

/**
 * Validates whether an incoming HTTP request is genuinely same-origin.
 *
 * Supports:
 * 1. Standard localhost / 127.0.0.1 development.
 * 2. VS Code Port Forwarding & Dev Tunnels (*.devtunnels.ms, *.githubpreview.dev, *.app.github.dev).
 * 3. Ngrok, Cloudflare, Localtunnel tunnels.
 * 4. Local network IP access (192.168.x.x, 10.x.x.x, 172.16-31.x.x) for mobile testing.
 * 5. Production Vercel / custom domains (matching Host or X-Forwarded-Host).
 * 6. Rejects any untrusted cross-site CSRF requests (e.g. attacker.com).
 */
export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");

  // Collect all possible candidate hosts forwarded by tunnels, proxies, or Next.js
  const rawHeaders = [
    request.headers.get("x-forwarded-host"),
    request.headers.get("host"),
    request.headers.get("x-original-host"),
    request.headers.get("x-forwarded-server"),
    request.nextUrl.host,
  ].filter(Boolean) as string[];

  const candidateHosts = new Set<string>();
  for (const raw of rawHeaders) {
    for (const part of raw.split(",")) {
      const trimmed = part.trim().toLowerCase();
      if (trimmed) {
        candidateHosts.add(trimmed);
        candidateHosts.add(trimmed.split(":")[0]); // without port
      }
    }
  }

  // 1. If there is no origin header (e.g. same-origin GET/navigation or certain fetch configs), check referer
  if (!origin) {
    const referer = request.headers.get("referer");
    if (!referer) return true;
    try {
      const refererUrl = new URL(referer);
      const refererHost = refererUrl.host.toLowerCase();
      const refererHostname = refererUrl.hostname.toLowerCase();
      return candidateHosts.has(refererHost) || candidateHosts.has(refererHostname);
    } catch {
      return false;
    }
  }

  try {
    const originUrl = new URL(origin);
    const originHost = originUrl.host.toLowerCase();
    const originHostname = originUrl.hostname.toLowerCase();

    // 2. Direct match with Next.js internal nextUrl.origin
    if (origin === request.nextUrl.origin) {
      return true;
    }

    // 3. Direct match with any candidate host
    if (candidateHosts.has(originHost) || candidateHosts.has(originHostname)) {
      return true;
    }

    // 4. Local development loopback aliases
    const loopbacks = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
    if (loopbacks.has(originHostname)) {
      return true;
    }

    // 5. VS Code Dev Tunnels, Codespaces, and public tunnel services (ALWAYS allowed)
    if (
      originHostname.endsWith(".devtunnels.ms") ||
      originHostname.includes(".devtunnels.ms") ||
      originHostname.endsWith(".githubpreview.dev") ||
      originHostname.endsWith(".app.github.dev") ||
      originHostname.endsWith(".ngrok-free.app") ||
      originHostname.includes("ngrok") ||
      originHostname.endsWith(".trycloudflare.com") ||
      originHostname.endsWith(".loca.lt")
    ) {
      return true;
    }

    // 6. Private local network IPv4 ranges (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
    if (
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(originHostname) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(originHostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(originHostname)
    ) {
      return true;
    }

    // 7. Explicitly allow NEXT_PUBLIC_SITE_URL or VERCEL_URL if configured
    if (process.env.NEXT_PUBLIC_SITE_URL) {
      try {
        const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL);
        if (originUrl.origin === siteUrl.origin || originUrl.host === siteUrl.host) {
          return true;
        }
      } catch {}
    }
    if (process.env.VERCEL_URL) {
      const cleanVercel = process.env.VERCEL_URL.toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
      if (originHostname === cleanVercel) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}
