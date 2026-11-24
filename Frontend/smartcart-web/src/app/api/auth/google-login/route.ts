import { NextRequest } from "next/server";
import { googleLogin } from "@/lib/auth-route";

export async function POST(request: NextRequest) {
  return googleLogin(request);
}
