"use client";

import { useState } from "react";
import { RetrievedChunk } from "@/lib/api";
import { FileText, ChevronDown, ChevronUp } from "lucide-react";

function ScoreBadge({ label, value, color }: { label: string; value?: number; color: string }) {
  if (value === undefined || value === null) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${color}`}>
      {label}: {value.toFixed(3)}
    </span>
  );
}

function RankBadge({ rank, label }: { rank?: number; label: string }) {
  if (!rank) return null;
  const colors = ["bg-yellow-100 text-yellow-800", "bg-gray-100 text-gray-700", "bg-orange-100 text-orange-700"];
  const color = rank <= 3 ? colors[rank - 1] : "bg-gray-50 text-gray-600";
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${color}`}>
      #{rank} {label}
    </span>
  );
}

interface ChunkCardProps {
  chunk: RetrievedChunk;
  index: number;
  isHighlighted?: boolean;
}

function ChunkCard({ chunk, index, isHighlighted }: ChunkCardProps) {
  const [expanded, setExpanded] = useState(false);

const strategyColors: Record<string, string> = {
  recursive: "bg-blue-100 text-blue-700",
  semantic: "bg-purple-100 text-purple-700",
  parent_child: "bg-green-100 text-green-700",
  section: "bg-orange-100 text-orange-700",
  hybrid: "bg-indigo-100 text-indigo-700",
  hybrid_rerank: "bg-pink-100 text-pink-700",
  multi_query: "bg-cyan-100 text-cyan-700",
  hyde: "bg-emerald-100 text-emerald-700",
  decomposition: "bg-yellow-100 text-yellow-700",
  unknown: "bg-gray-100 text-gray-600",
};

  const hasRerank = chunk.rerank_score !== undefined && chunk.rerank_score !== null;

  return (
    <div
      className={`rounded-[24px] border p-4 transition-all duration-300 ${
        isHighlighted
          ? "border-[rgb(var(--md-tertiary)/0.35)] bg-[rgb(var(--md-tertiary)/0.08)]"
          : "border-[rgb(var(--md-outline)/0.18)] bg-[rgb(var(--md-surface-high)/0.55)] hover:bg-[rgb(var(--md-primary)/0.05)]"
      }`}
      style={{ transitionTimingFunction: "cubic-bezier(0.2, 0, 0, 1)" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-[rgb(var(--md-ink-soft))]">#{index + 1}</span>
          {chunk.reranked_rank && hasRerank && (
            <RankBadge rank={chunk.reranked_rank} label="reranked" />
          )}
          {chunk.original_rank && !hasRerank && (
            <RankBadge rank={chunk.original_rank} label="" />
          )}
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              strategyColors[chunk.strategy] || strategyColors.unknown
            }`}
          >
            {chunk.strategy.replace("_", "-")}
          </span>
          {isHighlighted && (
            <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full font-medium">
              In both strategies
            </span>
          )}
        </div>
        <button onClick={() => setExpanded(!expanded)} className="flex-shrink-0 text-[rgb(var(--md-ink-soft))]">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Source info */}
      <div className="mt-2 flex items-center gap-1 text-xs text-[rgb(var(--md-ink-soft))]">
        <FileText className="h-3 w-3" />
        <span>{chunk.source || "Unknown source"}</span>
        {chunk.page_number && <span>· Page {chunk.page_number}</span>}
        {chunk.section_header && (
          <span>· §{chunk.section_header.substring(0, 30)}</span>
        )}
      </div>

      {/* Scores */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <ScoreBadge
          label="Semantic"
          value={chunk.similarity_score}
          color="bg-[rgb(var(--md-primary)/0.12)] text-[rgb(var(--md-primary-strong))]"
        />
        <ScoreBadge
          label="BM25"
          value={chunk.bm25_score}
          color="bg-[rgb(var(--md-secondary))] text-[rgb(var(--md-secondary-ink))]"
        />
        <ScoreBadge
          label="Rerank"
          value={chunk.rerank_score}
          color="bg-[rgb(var(--md-success)/0.12)] text-[rgb(var(--md-success))]"
        />
        {chunk.original_rank && chunk.reranked_rank && chunk.original_rank !== chunk.reranked_rank && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            chunk.original_rank > chunk.reranked_rank
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}>
            {chunk.original_rank > chunk.reranked_rank
              ? `↑ +${chunk.original_rank - chunk.reranked_rank}`
              : `↓ ${chunk.original_rank - chunk.reranked_rank}`}
          </span>
        )}
      </div>

      {/* Content preview */}
      <div className="mt-3">
        <p className="text-sm leading-relaxed text-[rgb(var(--md-ink-soft))]">
          {expanded ? chunk.content : (chunk.content || "").substring(0, 200)+ (chunk.content.length > 200 ? "..." : "")}
        </p>
      </div>
    </div>
  );
}

interface ChunkInspectorProps {
  chunks: RetrievedChunk[];
  title?: string;
  highlightIds?: string[];
}

export function ChunkInspector({
  chunks,
  title = "Retrieved Chunks",
  highlightIds = [],
}: ChunkInspectorProps) {
  if (!chunks || chunks.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 text-sm">
        No chunks retrieved yet.
      </div>
    );
  }

  const highlightSet = new Set(highlightIds);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[rgb(var(--md-ink))]">{title}</h3>
        <span className="rounded-full bg-[rgb(var(--md-secondary))] px-3 py-1 text-xs text-[rgb(var(--md-secondary-ink))]">
          {chunks.length} chunks
        </span>
      </div>
      <div className="space-y-2">
        {chunks.map((chunk, i) => (
          <ChunkCard
            key={`${chunk.chunk_id}-${i}`}
            chunk={chunk}
            index={i}
            isHighlighted={highlightSet.has(chunk.chunk_id)}
          />
        ))}
      </div>
    </div>
  );
}
