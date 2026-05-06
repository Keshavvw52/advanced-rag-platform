import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";
import { SideNav } from "@/components/SideNav";

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Advanced RAG Platform",
  description: "Production-grade RAG with hybrid search, reranking, and evaluation",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${roboto.className} md-shell`}>
        <div className="relative mx-auto flex min-h-screen max-w-[1800px] gap-6 p-4 md:p-6">
          <div className="hidden shrink-0 lg:block">
            <SideNav />
          </div>
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
