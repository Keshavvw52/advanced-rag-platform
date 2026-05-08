"use client";

import { useEffect, useState } from "react";
import {
  DocumentResponse,
  MetadataFilter,
  QueryResponse,
  RetrievalStrategy,
  documentsApi,
  queryApi,
} from "@/lib/api";
import { AnswerDisplay } from "@/components/AnswerDisplay";
import { ChunkInspector } from "@/components/ChunkInspector";
import { MetadataFilters } from "@/components/MetadataFilters";
import { PipelineVisualizer } from "@/components/PipelineVisualizer";
import { StrategySelector } from "@/components/StrategySelector";
import { Send } from "lucide-react";

export function QueryWorkspace() {
  const [query, setQuery] = useState("");
  const [strategy, setStrategy] = useState<RetrievalStrategy>("hybrid_rerank");
  const [filters, setFilters] = useState<MetadataFilter>({});
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [activeTab, setActiveTab] = useState<"chunks" | "pipeline">("chunks");

  useEffect(() => {
    documentsApi.list().then(setDocuments).catch((err) => {
      console.warn("Failed to fetch documents", err);
    });
  }, []);

  const handleQuery = async () => {
    const submittedQuery = query.trim();
    if (!submittedQuery) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await queryApi.query({ query: submittedQuery, strategy, filters });
      setResult(res);
      setQuery("");
    } catch (err: any) {
      setError(err?.message || "Query failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      handleQuery();
    }
  };

  return (
    <div className="relative overflow-hidden">
      <div aria-hidden="true" className="md-blur-orb left-[24%] top-8 h-48 w-48 bg-[rgb(var(--md-primary)/0.14)]" />
      <div aria-hidden="true" className="md-blur-orb right-10 top-28 h-40 w-40 bg-[rgb(var(--md-tertiary)/0.14)]" />

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <section className="md-card p-5">
            <MetadataFilters filters={filters} onChange={setFilters} documents={documents} />
          </section>

          <section className="md-card p-5">
            <StrategySelector value={strategy} onChange={setStrategy} disabled={isLoading} />
          </section>
        </aside>

        <div className="flex h-[calc(100vh-2rem)] min-h-0 flex-col gap-6 overflow-hidden">
          {(result || isLoading) && (
            <section className="md-panel min-h-0 flex-1 overflow-y-auto p-6">
              <AnswerDisplay result={result} isLoading={isLoading} />

              {result && (
                <div className="mt-6">
                  <div className="mb-4 flex flex-wrap gap-2">
                    <button
                      onClick={() => setActiveTab("chunks")}
                      className={activeTab === "chunks" ? "md-button-primary text-xs" : "md-button-tonal text-xs"}
                    >
                      Chunks ({result.retrieved_chunks.length})
                    </button>
                    <button
                      onClick={() => setActiveTab("pipeline")}
                      className={activeTab === "pipeline" ? "md-button-primary text-xs" : "md-button-tonal text-xs"}
                    >
                      Pipeline
                    </button>
                  </div>

                  {activeTab === "chunks" && <ChunkInspector chunks={result.retrieved_chunks} />}
                  {activeTab === "pipeline" && <PipelineVisualizer trace={(result as any)?.pipeline_trace || null} />}
                </div>
              )}
            </section>
          )}

          <section className="md-panel relative mt-auto shrink-0 overflow-hidden p-6">
            <div aria-hidden="true" className="md-blur-orb right-[-4rem] top-[-4rem] h-40 w-40 bg-[rgb(var(--md-secondary)/0.45)]" />
            <div className="relative">
              <div className="flex flex-col gap-4 xl:flex-row">
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a question about your documents... (Ctrl+Enter)"
                  disabled={isLoading}
                  rows={4}
                  className="md-input min-h-[132px] flex-1 resize-none"
                />
                <button
                  onClick={handleQuery}
                  disabled={isLoading || !query.trim()}
                  className="md-button-primary h-12 px-7 text-sm disabled:opacity-50"
                >
                  <span className="inline-flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    {isLoading ? "Querying..." : "Ask"}
                  </span>
                </button>
              </div>

              {error && (
                <p className="mt-4 rounded-[20px] bg-[rgb(var(--md-error)/0.08)] px-4 py-3 text-sm text-[rgb(var(--md-error))]">
                  {error}
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
