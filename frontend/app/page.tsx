import Link from "next/link";
import { ArrowRight, BarChart2, FileText, GitCompare, Search, Sparkles } from "lucide-react";

const FEATURES = [
  {
    title: "Query with traceability",
    description: "Ask grounded questions and inspect the chunks, scores, and prompt path behind every answer.",
    href: "/query",
    icon: Search,
  },
  {
    title: "Curate your library",
    description: "Upload PDFs, DOCX, markdown, and plain text files into one retrieval workspace.",
    href: "/documents",
    icon: FileText,
  },
  {
    title: "Compare strategies",
    description: "Run A/B retrieval experiments and inspect latency, overlap, and answer quality side by side.",
    href: "/compare",
    icon: GitCompare,
  },
  {
    title: "Evaluate performance",
    description: "Benchmark faithfulness, relevancy, precision, and recall across strategies without leaving the app.",
    href: "/evaluate",
    icon: BarChart2,
  },
];

export default function HomePage() {
  return (
    <div className="space-y-8 pb-8">
      <section className="md-panel relative overflow-hidden px-6 py-10 md:px-10 md:py-12">
        <div aria-hidden="true" className="md-blur-orb -left-16 top-0 h-56 w-56 bg-[rgb(var(--md-primary)/0.22)]" />
        <div aria-hidden="true" className="md-blur-orb bottom-0 right-8 h-52 w-52 bg-[rgb(var(--md-tertiary)/0.18)]" />
        <div className="relative grid gap-8 xl:grid-cols-[1.15fr_0.85fr] xl:items-center">
          <div>
            <span className="md-chip">Material knowledge system</span>
            <h1 className="mt-5 max-w-3xl text-[2.8rem] font-medium leading-[1.1] tracking-tight text-[rgb(var(--md-ink))] md:text-[3.5rem]">
              Build a retrieval workflow that feels as polished as the answers it gives.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[rgb(var(--md-ink-soft))]">
              Advanced RAG Platform combines document ingestion, hybrid search, chunk inspection, and evaluation in one friendly workspace. Keep the pipeline transparent while giving the interface a softer, more adaptive Material You feel.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/query" className="md-button-primary px-7 py-3">
                <span className="inline-flex items-center gap-2">
                  Open query workspace
                  <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
              <Link href="/documents" className="md-button-tonal px-7 py-3">
                Upload documents
              </Link>
            </div>
          </div>

          <div className="md-glass relative overflow-hidden p-6 md:p-8">
            <div aria-hidden="true" className="md-blur-orb right-4 top-4 h-24 w-24 bg-[rgb(var(--md-secondary)/0.65)]" />
            <div className="relative space-y-5">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-[rgb(var(--md-primary))] text-white shadow-lg">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.08em] text-[rgb(var(--md-ink-soft))]">
                    Platform snapshot
                  </p>
                  <p className="text-xl font-medium text-[rgb(var(--md-ink))]">RAG workflow, one surface</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Retrieval", "Hybrid, rerank, parent-child, HyDE"],
                  ["Transparency", "Chunk scores, sources, and pipeline steps"],
                  ["Evaluation", "Faithfulness, relevancy, precision, recall"],
                  ["Workspace", "Documents, query, compare, and reports"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[24px] bg-[rgb(var(--md-surface-high)/0.7)] p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-[0.08em] text-[rgb(var(--md-ink-soft))]">{label}</p>
                    <p className="mt-2 text-sm leading-6 text-[rgb(var(--md-ink))]">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-4">
        {FEATURES.map(({ title, description, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="md-card md-card-hover group relative overflow-hidden p-6"
          >
            <div aria-hidden="true" className="md-blur-orb right-0 top-0 h-20 w-20 bg-[rgb(var(--md-primary)/0.12)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <div className="relative">
              <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[rgb(var(--md-secondary))] text-[rgb(var(--md-secondary-ink))]">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="mt-5 text-2xl font-medium text-[rgb(var(--md-ink))]">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-[rgb(var(--md-ink-soft))]">{description}</p>
              <div className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[rgb(var(--md-primary-strong))]">
                Explore
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </div>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
