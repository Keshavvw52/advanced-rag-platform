"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  BarChart2,
  FileText,
  GitCompare,
  LockKeyhole,
  Search,
  Sparkles,
} from "lucide-react";
import { EntryLink } from "@/components/EntryLink";
import { authApi } from "@/lib/api";

const FEATURES = [
  {
    title: "Query with traceability",
    description: "Ask grounded questions and inspect the chunks, scores, and prompt path behind every answer.",
    href: "/query",
    icon: Search,
    stat: "Hybrid + rerank",
  },
  {
    title: "Curate your library",
    description: "Upload PDFs, DOCX, markdown, and plain text files into one retrieval workspace.",
    href: "/documents",
    icon: FileText,
    stat: "Private document space",
  },
  {
    title: "Compare strategies",
    description: "Run A/B retrieval experiments and inspect latency, overlap, and answer quality side by side.",
    href: "/compare",
    icon: GitCompare,
    stat: "Side-by-side outputs",
  },
  {
    title: "Evaluate performance",
    description: "Benchmark faithfulness, relevancy, precision, and recall across strategies without leaving the app.",
    href: "/evaluate",
    icon: BarChart2,
    stat: "User-owned eval history",
  },
];

export default function HomePage() {
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    setIsSignedIn(Boolean(authApi.token()));
  }, []);

  return (
    <div className="space-y-8 pb-8">
      <section className="md-panel relative overflow-hidden px-5 py-5 md:px-8 md:py-6">
        <div aria-hidden="true" className="md-blur-orb -left-16 top-0 h-48 w-48 bg-[rgb(var(--md-primary)/0.18)]" />
        <div aria-hidden="true" className="md-blur-orb right-10 top-6 h-40 w-40 bg-[rgb(var(--md-tertiary)/0.14)]" />

        <div className="relative flex flex-col gap-5">
          <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[rgb(var(--md-primary))] text-white shadow-lg">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-lg font-medium text-[rgb(var(--md-ink))]">Advanced RAG Platform</p>
                <p className="text-sm text-[rgb(var(--md-ink-soft))]">Private retrieval workspace for every user</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <EntryLink href="/query" mode="login" className="md-button-outlined px-5 py-3">
                {isSignedIn ? "Open workspace" : "Log in"}
              </EntryLink>
              <EntryLink href="/query" mode="signup" className="md-button-primary px-5 py-3">
                {isSignedIn ? "Continue" : "Get started"}
              </EntryLink>
            </div>
          </header>

          <div className="grid gap-8 xl:grid-cols-[1.08fr_0.92fr] xl:items-center">
            <div>
              <span className="md-chip">{isSignedIn ? "Workspace ready" : "Personal knowledge system"}</span>
              <h1 className="mt-5 max-w-4xl text-[2.8rem] font-medium leading-[1.02] tracking-tight text-[rgb(var(--md-ink))] md:text-[4rem]">
                Retrieval, evaluation, and document workspaces that open with your account at the center.
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-[rgb(var(--md-ink-soft))]">
                {isSignedIn
                  ? "Jump back into your private workspace and continue working with your uploads, traces, and evaluation history."
                  : "Start on a clean home screen, sign in when you want to work, and keep every upload, trace, and evaluation tied to your own workspace."}
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <EntryLink href="/query" mode="signup" className="md-button-primary px-7 py-3">
                  <span className="inline-flex items-center gap-2">
                    {isSignedIn ? "Open query workspace" : "Create workspace"}
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </EntryLink>
                <EntryLink href="/documents" mode="login" className="md-button-tonal px-7 py-3">
                  {isSignedIn ? "Open documents" : "Sign in to upload"}
                </EntryLink>
              </div>
            </div>

            <div className="md-glass relative overflow-hidden p-6 md:p-8">
              <div aria-hidden="true" className="md-blur-orb -right-4 top-2 h-24 w-24 bg-[rgb(var(--md-secondary)/0.55)]" />
              <div className="relative space-y-4">
                <div className="flex items-center justify-between rounded-[22px] bg-[rgb(var(--md-surface-high)/0.78)] px-5 py-4 shadow-sm">
                  <div>
                    <p className="text-xs uppercase tracking-[0.08em] text-[rgb(var(--md-ink-soft))]">Access model</p>
                    <p className="mt-1 text-sm font-medium text-[rgb(var(--md-ink))]">
                      {isSignedIn ? "Signed in and ready to work" : "Protected by account login"}
                    </p>
                  </div>
                  <LockKeyhole className="h-5 w-5 text-[rgb(var(--md-primary-strong))]" />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ["Uploads", "Only your documents appear in your library"],
                    ["Queries", "History and pipeline traces stay user-scoped"],
                    ["Evaluations", "Benchmark runs persist to your account"],
                    ["Compare", "Strategy testing remains private to you"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-[22px] bg-[rgb(var(--md-surface-high)/0.72)] p-4 shadow-sm">
                      <p className="text-xs uppercase tracking-[0.08em] text-[rgb(var(--md-ink-soft))]">{label}</p>
                      <p className="mt-2 text-sm leading-6 text-[rgb(var(--md-ink))]">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-4">
        {FEATURES.map(({ title, description, href, icon: Icon, stat }) => (
          <EntryLink
            key={href}
            href={href}
            mode="signup"
            className="md-card md-card-hover group relative overflow-hidden p-6"
          >
            <div aria-hidden="true" className="md-blur-orb -right-6 top-0 h-24 w-24 bg-[rgb(var(--md-primary)/0.1)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <div className="relative">
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[rgb(var(--md-secondary))] text-[rgb(var(--md-secondary-ink))]">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-[rgb(var(--md-surface-high)/0.85)] px-3 py-1 text-[11px] font-medium text-[rgb(var(--md-ink-soft))]">
                  {isSignedIn ? "Open now" : "Sign in first"}
                </span>
              </div>

              <h2 className="mt-5 text-2xl font-medium text-[rgb(var(--md-ink))]">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-[rgb(var(--md-ink-soft))]">{description}</p>
              <p className="mt-5 text-sm font-medium text-[rgb(var(--md-primary-strong))]">{stat}</p>
              <div className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[rgb(var(--md-primary-strong))]">
                {isSignedIn ? "Open section" : "Continue to access"}
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </div>
            </div>
          </EntryLink>
        ))}
      </section>
    </div>
  );
}
