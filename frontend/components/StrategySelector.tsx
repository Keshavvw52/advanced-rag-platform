"use client";

import { RetrievalStrategy } from "@/lib/api";

const STRATEGIES: {
  id: RetrievalStrategy;
  name: string;
  description: string;
  badge?: string;
}[] = [
  {
    id: "hybrid_rerank",
    name: "Hybrid + Rerank",
    description: "Best quality: BM25 + Vector + Cross-encoder reranking",
    badge: "Recommended",
  },
  {
    id: "hybrid",
    name: "Hybrid Search",
    description: "BM25 + Vector search merged via RRF",
  },
  {
    id: "basic_vector",
    name: "Basic Vector",
    description: "Standard cosine similarity on embeddings",
  },
  {
    id: "parent_child",
    name: "Parent-Child",
    description: "Search small chunks, return large parent chunks",
  },
  {
    id: "multi_query",
    name: "Multi-Query",
    description: "LLM generates 3-5 query variants, merges results",
  },
  {
    id: "hyde",
    name: "HyDE",
    description: "Hypothetical document embeddings for abstract queries",
  },
  {
    id: "decomposition",
    name: "Decomposition",
    description: "Breaks complex queries into sub-questions",
  },
];

interface StrategySelectorProps {
  value: RetrievalStrategy;
  onChange: (s: RetrievalStrategy) => void;
  disabled?: boolean;
}

export function StrategySelector({
  value,
  onChange,
  disabled,
}: StrategySelectorProps) {
  return (
    <div className="space-y-4">
      <label className="text-base font-medium text-[rgb(var(--md-ink))]">
        Retrieval Strategy
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {STRATEGIES.map((s) => (
          <button
            key={s.id}
            disabled={disabled}
            onClick={() => onChange(s.id)}
            className={`relative overflow-hidden text-left rounded-[24px] border p-4 transition-all duration-300 text-sm active:scale-95 ${
              value === s.id
                ? "border-[rgb(var(--md-primary)/0.35)] bg-[rgb(var(--md-primary)/0.14)] shadow-md"
                : "border-[rgb(var(--md-outline)/0.2)] bg-[rgb(var(--md-surface-high)/0.6)] hover:scale-[1.02] hover:bg-[rgb(var(--md-primary)/0.06)]"
            } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            style={{ transitionTimingFunction: "cubic-bezier(0.2, 0, 0, 1)" }}
          >
            <div className="space-y-1">
              <span className="block text-base font-medium text-[rgb(var(--md-ink))]">{s.name}</span>
              {s.badge && (
                <span className="inline-flex max-w-full items-center rounded-full bg-[rgb(var(--md-secondary))] px-2.5 py-1 text-[11px] font-medium text-[rgb(var(--md-secondary-ink))]">
                  {s.badge}
                </span>
              )}
            </div>
            <p className="mt-3 text-xs leading-5 text-[rgb(var(--md-ink-soft))]">{s.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// Compact dropdown variant for comparison page
export function StrategyDropdown({
  value,
  onChange,
  label,
  disabled,
}: StrategySelectorProps & { label?: string }) {
  return (
    <div className="space-y-2">
      {label && (
        <label className="text-sm font-medium text-[rgb(var(--md-ink))]">{label}</label>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as RetrievalStrategy)}
        disabled={disabled}
        className="md-input h-14 w-full rounded-t-[16px] disabled:opacity-50"
      >
        {STRATEGIES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}{s.badge ? ` ★` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
