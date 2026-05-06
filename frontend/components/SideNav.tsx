"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart2, FileText, GitCompare, Home, Search, Sparkles } from "lucide-react";

const NAV_LINKS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/query", label: "Query", icon: Search },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/compare", label: "A/B Compare", icon: GitCompare },
  { href: "/evaluate", label: "Evaluate", icon: BarChart2 },
];

export function SideNav() {
  const pathname = usePathname();

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

      <div className="relative rounded-[24px] bg-[rgb(var(--md-secondary)/0.7)] p-4 text-sm text-[rgb(var(--md-secondary-ink))]">
        <p className="font-medium">Model stack</p>
        <p className="mt-1 text-xs text-[rgb(var(--md-ink-soft))]">Groq llama-3.3 versatile</p>
        <p className="text-xs text-[rgb(var(--md-ink-soft))]">ChromaDB + all-MiniLM-L6-v2</p>
      </div>
    </aside>
  );
}
