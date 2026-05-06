"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart2, FileText, GitCompare, Home, LogOut, Search, Sparkles, User } from "lucide-react";
import { authApi, UserResponse } from "@/lib/api";

const NAV_LINKS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/query", label: "Query", icon: Search },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/compare", label: "A/B Compare", icon: GitCompare },
  { href: "/evaluate", label: "Evaluate", icon: BarChart2 },
];

export function SideNav({ user }: { user?: UserResponse | null }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    authApi.logout();
    router.replace("/auth");
  };

  return (
    <aside className="md-panel relative flex h-[calc(100vh-2rem)] w-full max-w-[290px] flex-col overflow-hidden p-4">
      <div
        aria-hidden="true"
        className="md-blur-orb -left-16 top-8 h-32 w-32 bg-[rgb(var(--md-primary)/0.18)]"
      />
      <div
        aria-hidden="true"
        className="md-blur-orb right-0 top-24 h-24 w-24 bg-[rgb(var(--md-tertiary)/0.18)]"
      />

      <div className="relative rounded-[28px] bg-[rgb(var(--md-surface-high)/0.7)] p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-[20px] bg-[rgb(var(--md-primary))] text-white shadow-md">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[1.1rem] font-medium tracking-tight text-[rgb(var(--md-ink))]">
              RAG Platform
            </p>
            <p className="text-sm text-[rgb(var(--md-ink-soft))]">
              Material knowledge workspace
            </p>
          </div>
        </div>
      </div>

      <nav className="relative mt-6 flex-1 space-y-2">
        {NAV_LINKS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`group flex items-center gap-3 rounded-full px-4 py-3 text-sm font-medium transition-all duration-300 active:scale-95 ${
                active
                  ? "bg-[rgb(var(--md-primary)/0.16)] text-[rgb(var(--md-primary-strong))] shadow-sm"
                  : "text-[rgb(var(--md-ink-soft))] hover:bg-[rgb(var(--md-primary)/0.08)] hover:text-[rgb(var(--md-ink))]"
              }`}
              style={{ transitionTimingFunction: "cubic-bezier(0.2, 0, 0, 1)" }}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="relative space-y-3 rounded-[24px] bg-[rgb(var(--md-secondary)/0.7)] p-4 text-sm text-[rgb(var(--md-secondary-ink))]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgb(var(--md-surface-high))] text-[rgb(var(--md-primary-strong))]">
            <User className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">{user?.name || "Your workspace"}</p>
            <p className="truncate text-xs text-[rgb(var(--md-ink-soft))]">{user?.email}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-[rgb(var(--md-surface-high)/0.8)] px-4 py-2 text-xs font-medium text-[rgb(var(--md-ink))] transition hover:bg-[rgb(var(--md-surface-high))]"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
