import Link from "next/link";

type BrandLogoProps = { compact?: boolean; className?: string; brandName?: string; logoUrl?: string };

export function BrandLogo({ compact = false, className = "", brandName = "SmartCart", logoUrl }: BrandLogoProps) {
  return <Link href="/" aria-label={`${brandName} home`} className={`inline-flex items-center gap-2.5 ${className}`}>
    {logoUrl ? <img src={logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-xl object-contain" /> : <svg aria-hidden="true" viewBox="0 0 40 40" className="h-9 w-9 shrink-0">
      <rect x="1" y="1" width="38" height="38" rx="13" fill="#176b52"/>
      <path d="M11 17h18l-2 12H13l-2-12Z" fill="none" stroke="#f8f7f2" strokeWidth="1.7" strokeLinejoin="round"/>
      <path d="m15 17 2-5m8 5-2-5M16 21v4m8-4v4" fill="none" stroke="#f8f7f2" strokeWidth="1.7" strokeLinecap="round"/>
      <circle cx="15" cy="32" r="1.4" fill="#f8f7f2"/><circle cx="25" cy="32" r="1.4" fill="#f8f7f2"/>
      <path d="m30 8 .7 2.1 2.1.7-2.1.7L30 14l-.7-2.5-2.3-.7 2.3-.7L30 8Z" fill="#e5c98b"/>
    </svg>}
    {!compact && (brandName === "SmartCart" ? <span className="font-display text-[1.45rem] font-semibold tracking-[-.045em] text-ink">Smart<span className="text-emerald-700">Cart</span></span> : <span className="font-display text-[1.45rem] font-semibold tracking-[-.045em] text-ink">{brandName}</span>)}
  </Link>;
}
