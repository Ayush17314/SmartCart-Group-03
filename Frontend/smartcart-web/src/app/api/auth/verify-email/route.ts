import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/same-origin";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ success: false, message: "Cross-origin request rejected" }, { status: 403 });
  try {
    const body = await request.json();
    const upstream = (process.env.API_URL || "https://smartcart-backend-0nnc.onrender.com").replace(/\/$/, "");
    const response = await fetch(`${upstream}/api/auth/verify-email`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: body.token }), cache: "no-store" });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ success: false, message: "Authentication service is unavailable" }, { status: 503 });
  }
}
