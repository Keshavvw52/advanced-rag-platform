"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SideNav } from "@/components/SideNav";
import { authApi, UserResponse } from "@/lib/api";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<UserResponse | null>(null);
  const [checked, setChecked] = useState(false);
  const isAuthPage = pathname === "/auth";
  const isHomePage = pathname === "/";
  const isPublicRoute = isAuthPage || isHomePage;

  useEffect(() => {
    let alive = true;
    const token = authApi.token();
    const redirectTarget = searchParams.get("redirect") || "/query";

    if (!token) {
      setUser(null);
      setChecked(true);
      if (!isPublicRoute) {
        router.replace(`/auth?redirect=${encodeURIComponent(pathname)}`);
      }
      return;
    }

    authApi
      .me()
      .then((currentUser) => {
        if (!alive) return;
        setUser(currentUser);
        setChecked(true);
        if (isAuthPage) router.replace(redirectTarget);
      })
      .catch(() => {
        if (!alive) return;
        setUser(null);
        setChecked(true);
        if (!isPublicRoute) {
          router.replace(`/auth?redirect=${encodeURIComponent(pathname)}`);
        }
      });

    return () => {
      alive = false;
    };
  }, [isAuthPage, isPublicRoute, pathname, router, searchParams]);

  if (isPublicRoute) {
    return <main className="min-w-0 flex-1">{children}</main>;
  }

  if (!checked || !user) {
    return (
      <main className="grid min-h-[calc(100vh-2rem)] flex-1 place-items-center text-sm text-[rgb(var(--md-ink-soft))]">
        Loading workspace...
      </main>
    );
  }

  return (
    <>
      <div className="hidden shrink-0 lg:block">
        <SideNav user={user} />
      </div>
      <main className="min-w-0 flex-1">{children}</main>
    </>
  );
}
