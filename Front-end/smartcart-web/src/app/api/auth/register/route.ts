import { NextRequest } from "next/server";
import { register } from "@/lib/auth-route";
export const POST = (request: NextRequest) => register(request);
