"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import { authApi } from "@/lib/api";

type Mode = "login" | "signup";

const BENEFITS = [
  "Keep every upload tied to your account",
  "Save query traces and evaluation history",
  "Compare strategies inside your private workspace",
];

export default function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const redirectTo = searchParams.get("redirect") || "/query";
  const requestedMode = searchParams.get("mode");

  useEffect(() => {
    if (requestedMode === "signup" || requestedMode === "login") {
      setMode(requestedMode);
    }
  }, [requestedMode]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (mode === "signup") {
        await authApi.signup({ name, email, password });
      } else {
        await authApi.login({ email, password });
      }
      router.replace(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode);
    setError(null);
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", nextMode);
    router.replace(`/auth?${params.toString()}`);
  };

  return (
    <div className="grid min-h-[calc(100vh-2rem)] w-full place-items-center px-2">
      <section className="md-panel relative w-full max-w-[1100px] overflow-hidden p-4 md:p-6">
        <div aria-hidden="true" className="md-blur-orb -left-12 top-12 h-64 w-64 bg-[rgb(var(--md-primary)/0.16)]" />
        <div aria-hidden="true" className="md-blur-orb bottom-0 right-10 h-56 w-56 bg-[rgb(var(--md-tertiary)/0.14)]" />

        <div className="relative grid gap-5 lg:grid-cols-[0.94fr_1.06fr]">
          <div className="flex flex-col justify-between rounded-[28px] bg-[rgb(var(--md-surface-high)/0.6)] p-6 md:p-8">
            <div>
              <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-[rgb(var(--md-primary-strong))]">
                <Sparkles className="h-4 w-4" />
                Advanced RAG Platform
              </Link>

              <h1 className="mt-8 max-w-md text-[2.8rem] font-medium leading-[1.02] tracking-tight text-[rgb(var(--md-ink))]">
                {mode === "signup" ? "Create your private workspace" : "Welcome back to your workspace"}
              </h1>
              <p className="mt-4 max-w-md text-base leading-7 text-[rgb(var(--md-ink-soft))]">
                {mode === "signup"
                  ? "Open a personal RAG environment where documents, queries, evaluations, and experiments belong only to you."
                  : "Pick up right where you left off with your documents, traces, and evaluation history waiting for you."}
              </p>
            </div>

            <div className="mt-10 space-y-3">
              {BENEFITS.map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 rounded-[20px] bg-[rgb(var(--md-surface)/0.85)] px-4 py-3 text-sm text-[rgb(var(--md-ink))]"
                >
                  <ShieldCheck className="h-4 w-4 text-[rgb(var(--md-primary-strong))]" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={submit} className="md-glass relative overflow-hidden p-6 md:p-8">
            <div aria-hidden="true" className="md-blur-orb right-0 top-0 h-28 w-28 bg-[rgb(var(--md-secondary)/0.4)]" />

            <div className="relative">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-[rgb(var(--md-primary-strong))]">
                    {mode === "signup" ? "New account" : "Account access"}
                  </p>
                  <h2 className="mt-1 text-2xl font-medium text-[rgb(var(--md-ink))]">
                    {mode === "signup" ? "Start with your email" : "Sign in to continue"}
                  </h2>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[rgb(var(--md-primary))] text-white shadow-lg">
                  <LockKeyhole className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 rounded-[18px] bg-[rgb(var(--md-surface-high)/0.8)] p-1.5 shadow-inner">
                {(["login", "signup"] as Mode[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => switchMode(item)}
                    className={`rounded-[14px] px-4 py-3 text-sm font-medium transition ${
                      mode === item
                        ? "bg-[rgb(var(--md-primary))] text-white shadow-sm"
                        : "text-[rgb(var(--md-ink-soft))] hover:text-[rgb(var(--md-ink))]"
                    }`}
                  >
                    {item === "login" ? "Log in" : "Sign up"}
                  </button>
                ))}
              </div>

              <div className="mt-6 space-y-4">
                {mode === "signup" && (
                  <label className="block">
                    <span className="mb-2.5 block text-[15px] font-medium text-[rgb(var(--md-ink))]">Name</span>
                    <span className="flex min-h-[64px] items-center gap-3 rounded-[22px] border border-[rgb(var(--md-outline)/0.18)] bg-[rgb(var(--md-surface-high)/0.82)] px-5 py-4">
                      <User className="h-5 w-5 text-[rgb(var(--md-ink-soft))]" />
                      <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        className="w-full bg-transparent text-base text-[rgb(var(--md-ink))] outline-none placeholder:text-[rgb(var(--md-ink-soft))]"
                        placeholder="Your name"
                      />
                    </span>
                  </label>
                )}

                <label className="block">
                  <span className="mb-2.5 block text-[15px] font-medium text-[rgb(var(--md-ink))]">Email</span>
                  <span className="flex min-h-[64px] items-center gap-3 rounded-[22px] border border-[rgb(var(--md-outline)/0.18)] bg-[rgb(var(--md-surface-high)/0.82)] px-5 py-4">
                    <Mail className="h-5 w-5 text-[rgb(var(--md-ink-soft))]" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="w-full bg-transparent text-base text-[rgb(var(--md-ink))] outline-none placeholder:text-[rgb(var(--md-ink-soft))]"
                      placeholder="you@example.com"
                    />
                  </span>
                </label>

                <label className="block">
                  <span className="mb-2.5 block text-[15px] font-medium text-[rgb(var(--md-ink))]">Password</span>
                  <span className="flex min-h-[64px] items-center gap-3 rounded-[22px] border border-[rgb(var(--md-outline)/0.18)] bg-[rgb(var(--md-surface-high)/0.82)] px-5 py-4">
                    <LockKeyhole className="h-5 w-5 text-[rgb(var(--md-ink-soft))]" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="w-full bg-transparent text-base text-[rgb(var(--md-ink))] outline-none placeholder:text-[rgb(var(--md-ink-soft))]"
                      placeholder={mode === "signup" ? "Create a password" : "Enter your password"}
                    />
                  </span>
                </label>
              </div>

              {error && (
                <p className="mt-4 rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </p>
              )}

              <button type="submit" disabled={isLoading} className="md-button-primary mt-6 flex w-full items-center justify-center gap-2 px-5 py-4 disabled:opacity-60">
                <span>{isLoading ? "Please wait..." : mode === "signup" ? "Create account" : "Log in"}</span>
                {!isLoading && <ArrowRight className="h-4 w-4" />}
              </button>

              <p className="mt-5 text-center text-sm text-[rgb(var(--md-ink-soft))]">
                {mode === "signup" ? "Already have an account?" : "Need a new account?"}{" "}
                <button
                  type="button"
                  onClick={() => switchMode(mode === "signup" ? "login" : "signup")}
                  className="font-medium text-[rgb(var(--md-primary-strong))]"
                >
                  {mode === "signup" ? "Log in" : "Sign up"}
                </button>
              </p>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
