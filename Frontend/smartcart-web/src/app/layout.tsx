import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import { Providers } from "@/components/providers";
import { StoreLayout } from "@/components/layout";
import "./globals.css";

const sans = DM_Sans({ subsets: ["latin"], variable: "--font-body" });
const display = Fraunces({ subsets: ["latin"], variable: "--font-display-face" });

export const metadata: Metadata = {
  title: { default: "SmartCart — Modern Online Shopping", template: "%s — SmartCart" },
  description: "Shop quality electronics, fashion, home essentials, and beauty with fast delivery, authentic products, and secure checkout on SmartCart.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${sans.variable} ${display.variable}`}><Providers><StoreLayout>{children}</StoreLayout></Providers></body></html>;
}
