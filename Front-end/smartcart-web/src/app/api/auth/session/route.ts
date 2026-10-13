import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const token = (await cookies()).get("smartcart_token")?.value;
  if (!token) return NextResponse.json({ authenticated: false }, { status: 200 });
  try {
    const upstream = (process.env.API_URL || "http://localhost:4000").replace(/\/$/, "");
    const response = await fetch(`${upstream}/api/auth/session`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!response.ok) return NextResponse.json({ authenticated: false }, { status: response.status === 401 ? 200 : 503 });
    const body = await response.json();
    return NextResponse.json({ authenticated: true, user: body.data?.user || null });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 503 });
  }
}
