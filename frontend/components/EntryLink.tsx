"use client";

import Link from "next/link";
import { MouseEvent, ReactNode, useMemo } from "react";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api";

type EntryLinkProps = {
  href: string;
  mode?: "login" | "signup";
  className?: string;
  children: ReactNode;
};

function buildAuthHref(href: string, mode: "login" | "signup") {
  return `/auth?mode=${mode}&redirect=${encodeURIComponent(href)}`;
}

export function EntryLink({
  href,
  mode = "signup",
  className,
  children,
}: EntryLinkProps) {
  const router = useRouter();
  const targetHref = useMemo(() => {
    return authApi.token() ? href : buildAuthHref(href, mode);
  }, [href, mode]);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    router.push(authApi.token() ? href : buildAuthHref(href, mode));
  };

  return (
    <Link href={targetHref} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}
