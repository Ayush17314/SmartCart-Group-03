import { NextRequest, NextResponse } from "next/server";

const upstream = () => (process.env.API_URL || "http://localhost:4000").replace(/\/$/, "");
const authExchangeSecret = () => process.env.AUTH_EXCHANGE_SECRET || "local-auth-exchange-secret-change-me";
const sameOrigin = (request: NextRequest) => request.headers.get("origin") === request.nextUrl.origin;

async function forward(request: NextRequest, action: string) {
  try {
    const response = await fetch(`${upstream()}/api/auth/${action}`, {
      method: request.method,
      headers: { "Content-Type": "application/json", ...(["login", "customer-login", "staff-login", "super-admin-login", "super-admin-verify"].includes(action) ? { "X-Auth-Exchange-Secret": authExchangeSecret() } : {}) },
      ...(request.method === "GET" ? {} : { body: await request.text() }),
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({ success: false, message: "Authentication service returned an invalid response" }));
    return { response, body };
  } catch {
    return { response: null, body: { success: false, message: "Authentication service is unavailable" } };
  }
}

export async function register(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ success: false, message: "Cross-origin request rejected" }, { status: 403 });
  const { response, body } = await forward(request, "register");
  return NextResponse.json(body, { status: response?.status || 503 });
}

async function exchangeLogin(request: NextRequest, action: string) {
  if (!sameOrigin(request)) return NextResponse.json({ success: false, message: "Cross-origin request rejected" }, { status: 403 });
  const { response, body } = await forward(request, action);
  if (response?.status === 200 && body.success && body.data?.mfaRequired) return NextResponse.json(body, { status: response.status });
  if (!response || !response.ok || !body.success) return NextResponse.json(body, { status: response?.status || 503 });
  const token = body.data?.token;
  if (typeof token !== "string" || !body.data?.user) return NextResponse.json({ success: false, message: "Authentication service returned an invalid response" }, { status: 502 });
  const result = NextResponse.json({ success: true, data: { user: body.data.user } }, { status: response.status });
  result.cookies.set("smartcart_token", token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7,
  });
  return result;
}

export async function login(request: NextRequest, audience: "customer" | "staff" | "super_admin" = "customer") {
  const action = audience === "staff" ? "staff-login" : audience === "super_admin" ? "super-admin-login" : "customer-login";
  return exchangeLogin(request, action);
}

export async function verifySuperAdminLogin(request: NextRequest) {
  return exchangeLogin(request, "super-admin-verify");
}

export async function forwardAuth(request: NextRequest, action: string, method: "GET" | "POST" = "POST") {
  if (method !== "GET" && !sameOrigin(request)) return NextResponse.json({ success: false, message: "Cross-origin request rejected" }, { status: 403 });
  const { response, body } = await forward(request, action);
  return NextResponse.json(body, { status: response?.status || 503 });
}
