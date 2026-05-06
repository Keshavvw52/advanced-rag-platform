"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { QueryResponse } from "@/lib/api";
import { Clock, Zap, FileText } from "lucide-react";

interface AnswerDisplayProps {
  result: QueryResponse | null;
  isLoading?: boolean;
  streamingAnswer?: string;
}

export function AnswerDisplay({
  result,
  isLoading,
  streamingAnswer,
}: AnswerDisplayProps) {
  if (isLoading) {
    return (
      <div className="md-card p-6 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[rgb(var(--md-primary))] border-t-transparent" />
          <span className="text-sm text-[rgb(var(--md-ink-soft))]">Retrieving and generating answer...</span>
        </div>
        {streamingAnswer && (
          <div className="prose prose-sm max-w-none text-[rgb(var(--md-ink))]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {streamingAnswer}
            </ReactMarkdown>
            <span className="animate-pulse">▊</span>
          </div>
        )}
      </div>
    );
  }

  if (!result) {
    return (
      <div className="md-card border-dashed border-[rgb(var(--md-outline)/0.3)] bg-[rgb(var(--md-surface-high)/0.55)] p-12 text-center">
        <div className="text-4xl mb-3">🔍</div>
        <p className="text-sm text-[rgb(var(--md-ink-soft))]">Ask a question to get started</p>
        <p className="mt-1 text-xs text-[rgb(var(--md-ink-soft)/0.8)]">
          Upload documents first, then query them
        </p>
      </div>
    );
  }

  // Group chunks by source for citations
  const sources = Array.from(
    new Map(
      result.retrieved_chunks
        .filter((c) => c.source)
        .map((c) => [c.source, c])
    ).values()
  );

  return (
    <div className="md-card overflow-hidden">
      {/* Answer header */}
      <div className="border-b border-[rgb(var(--md-outline)/0.14)] bg-[rgb(var(--md-secondary)/0.55)] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-[rgb(var(--md-primary))]" />
            <span className="text-sm font-semibold text-[rgb(var(--md-secondary-ink))]">Answer</span>
            <span className="rounded-full bg-[rgb(var(--md-primary)/0.14)] px-2.5 py-1 text-xs font-medium capitalize text-[rgb(var(--md-primary-strong))]">
              {result.strategy.replace(/_/g, " ")}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-[rgb(var(--md-ink-soft))]">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{(result.latency_ms / 1000).toFixed(2)}s</span>
            </div>
            <span>{result.input_tokens} in / {result.output_tokens} out tokens</span>
          </div>
        </div>
      </div>

      {/* Answer body */}
      <div className="px-6 py-5">
        <div className="prose prose-sm max-w-none leading-relaxed text-[rgb(var(--md-ink))]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {result.answer}
          </ReactMarkdown>
        </div>
      </div>

      {/* Source citations */}
      {sources.length > 0 && (
        <div className="border-t border-[rgb(var(--md-outline)/0.14)] bg-[rgb(var(--md-surface-high)/0.55)] px-6 py-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-3.5 w-3.5 text-[rgb(var(--md-ink-soft))]" />
            <span className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--md-ink-soft))]">
              Sources ({sources.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {sources.map((chunk) => (
              <div
                key={chunk.chunk_id}
                className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--md-outline)/0.15)] bg-[rgb(var(--md-surface))] px-3 py-1.5 text-xs shadow-sm"
              >
                <FileText className="h-3 w-3 text-[rgb(var(--md-ink-soft))]" />
                <span className="font-medium text-[rgb(var(--md-ink))]">
                  {chunk.source}
                </span>
                {chunk.page_number && (
                  <span className="text-[rgb(var(--md-ink-soft))]">p.{chunk.page_number}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
