import { NextRequest } from "next/server";
import { login } from "@/lib/auth-route";

export const POST = (request: NextRequest) => login(request, "staff");
