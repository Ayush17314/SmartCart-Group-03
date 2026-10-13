import { NextRequest } from "next/server";
import { verifySuperAdminLogin } from "@/lib/auth-route";

export const POST = (request: NextRequest) => verifySuperAdminLogin(request);
