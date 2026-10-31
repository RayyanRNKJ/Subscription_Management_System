"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, LayoutDashboard, Package, ReceiptIndianRupee, Users } from "lucide-react";
import type { Profile } from "@/lib/auth";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard };

const teamNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/products", label: "Products", icon: Package },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/subscriptions", label: "Subscriptions", icon: BarChart3 },
  { href: "/invoices", label: "Invoices", icon: ReceiptIndianRupee },
];

const customerNav: NavItem[] = [
  { href: "/portal", label: "My subscriptions", icon: LayoutDashboard },
  { href: "/portal/invoices", label: "My invoices", icon: ReceiptIndianRupee },
];

export function AppShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const pathname = usePathname();
  const nav = profile.role === "customer" ? customerNav : teamNav;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href={profile.role === "customer" ? "/portal" : "/dashboard"} className="font-semibold tracking-tight text-indigo-700">
            Brightloop
          </Link>
          <p className="min-w-0 truncate text-sm text-slate-600">
            {profile.full_name ?? profile.email}
            <span className="ml-2 capitalize text-slate-400">{profile.role}</span>
          </p>
        </div>
        <nav aria-label="Main navigation" className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3 sm:px-5">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
            return (
              <Link key={href} href={href} className={cn(
                "flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium",
                active ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-600 hover:text-slate-950",
              )}>
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
