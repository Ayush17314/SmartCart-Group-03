import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";
const styles = cva("inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:pointer-events-none disabled:opacity-50", { variants: { variant: { default: "bg-ink text-white hover:bg-emerald-950", outline: "border border-ink/15 bg-transparent hover:bg-ink/5", ghost: "hover:bg-ink/5", soft: "bg-emerald-50 text-emerald-950 hover:bg-emerald-100" }, size: { default: "h-11 px-5", sm: "h-9 px-4 text-xs", lg: "h-12 px-7 text-sm", icon: "h-10 w-10" } }, defaultVariants: { variant: "default", size: "default" } });
export function Button({ className, variant, size, asChild = false, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof styles> & { asChild?: boolean }) { const Comp = asChild ? Slot : "button"; return <Comp className={cn(styles({ variant, size }), className)} {...props} />; }
