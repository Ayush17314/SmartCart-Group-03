import { NextRequest } from "next/server";
import { forwardAuth } from "@/lib/auth-route";
export const POST = (request: NextRequest) => forwardAuth(request, "reset-password");
