import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ success: false, message: "Cross-origin request rejected" }, { status: 403 });
  const token = (await cookies()).get("smartcart_token")?.value;
  let status = 200;
  if (token) {
    try {
      const upstream = (process.env.API_URL || "http://localhost:4000").replace(/\/$/, "");
      const response = await fetch(`${upstream}/api/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}", cache: "no-store" });
      if (!response.ok) status = 503;
    } catch { status = 503; }
  }
  const result = NextResponse.json({ success: status === 200, ...(status === 503 ? { message: "Could not revoke the session. Please try again." } : {}) }, { status });
  result.cookies.set("smartcart_token", "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return result;
}
