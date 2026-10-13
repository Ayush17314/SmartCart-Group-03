import type { ReactNode } from "react";
import { Header } from "@/components/header";
import { CartDrawer } from "@/components/cart-drawer";
import { StoreFooter } from "@/components/store-footer";

export function StoreLayout({ children }: { children: ReactNode }) {
  return <><Header/><main>{children}</main><StoreFooter/><CartDrawer/></>;
}
