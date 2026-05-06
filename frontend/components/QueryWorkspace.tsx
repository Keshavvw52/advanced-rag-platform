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
import { AlertCircle, CheckCircle2, Clock3, FileText, Send } from "lucide-react";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentContext({
  documents,
  selectedDocumentId,
  onSelect,
}: {
  documents: DocumentResponse[];
  selectedDocumentId?: string;
  onSelect: (id?: string) => void;
}) {
  const readyDocs = documents.filter((doc) => doc.status === "ready");
  const selectedCount = selectedDocumentId ? 1 : readyDocs.length;

  return (
    <section className="md-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[1.15rem] font-medium text-[rgb(var(--md-ink))]">Document context</h2>
          <p className="text-sm text-[rgb(var(--md-ink-soft))]">
            {documents.length ? `${selectedCount} active for retrieval` : "Upload files to query them"}
          </p>
        </div>
        {selectedDocumentId && (
          <button type="button" onClick={() => onSelect(undefined)} className="md-button-outlined text-xs">
            Use all
          </button>
        )}
      </div>

      {documents.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-[rgb(var(--md-outline)/0.3)] bg-[rgb(var(--md-surface-high)/0.45)] px-4 py-8 text-center">
          <FileText className="mx-auto mb-3 h-6 w-6 text-[rgb(var(--md-ink-soft)/0.5)]" />
          <p className="text-sm text-[rgb(var(--md-ink-soft))]">No uploads available yet.</p>
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {documents.map((doc) => {
            const selected = selectedDocumentId === doc.id;
            const disabled = doc.status !== "ready";
            const StatusIcon =
              doc.status === "ready" ? CheckCircle2 : doc.status === "failed" ? AlertCircle : Clock3;

            return (
              <button
                key={doc.id}
                type="button"
                disabled={disabled}
                onClick={() => onSelect(selected ? undefined : doc.id)}
                className={`group rounded-[24px] border p-4 text-left transition-all duration-300 active:scale-95 ${
                  selected
                    ? "border-[rgb(var(--md-primary)/0.35)] bg-[rgb(var(--md-primary)/0.12)] shadow-md"
                    : "bg-[rgb(var(--md-surface-high)/0.55)] hover:scale-[1.01] hover:bg-[rgb(var(--md-primary)/0.06)]"
                } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
                style={{ transitionTimingFunction: "cubic-bezier(0.2, 0, 0, 1)" }}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-[16px] bg-[rgb(var(--md-secondary))] text-[rgb(var(--md-secondary-ink))]">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-base font-medium text-[rgb(var(--md-ink))]">
                        {doc.original_filename}
                      </p>
                      <StatusIcon
                        className={`h-5 w-5 flex-shrink-0 ${
                          doc.status === "ready"
                            ? "text-[rgb(var(--md-success))]"
                            : doc.status === "failed"
                              ? "text-[rgb(var(--md-error))]"
                              : "text-[rgb(var(--md-tertiary))]"
                        }`}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-[rgb(var(--md-ink-soft))]">
                      <span>{formatBytes(doc.file_size)}</span>
                      <span>{doc.chunk_counts.total} chunks</span>
                      {doc.total_pages > 0 && <span>{doc.total_pages} pages</span>}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

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
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await queryApi.query({ query, strategy, filters });
      setResult(res);
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

  const handleDocumentSelect = (documentId?: string) => {
    setFilters((current) => ({
      ...current,
      document_ids: documentId ? [documentId] : undefined,
    }));
  };

  return (
    <div className="relative overflow-hidden">
      <div aria-hidden="true" className="md-blur-orb left-[24%] top-8 h-48 w-48 bg-[rgb(var(--md-primary)/0.14)]" />
      <div aria-hidden="true" className="md-blur-orb right-10 top-28 h-40 w-40 bg-[rgb(var(--md-tertiary)/0.14)]" />

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <section className="md-card p-6">
            <p className="md-chip mb-4">Workspace</p>
            <h1 className="text-[2rem] font-medium leading-tight text-[rgb(var(--md-ink))]">Query your library</h1>
            <p className="mt-2 text-sm leading-6 text-[rgb(var(--md-ink-soft))]">
              Ask questions across your uploaded sources with retrieval controls, grounded answers, and traceable context.
            </p>
          </section>

          <section className="md-card p-5">
            <StrategySelector value={strategy} onChange={setStrategy} disabled={isLoading} />
          </section>

          <section className="md-card p-5">
            <MetadataFilters filters={filters} onChange={setFilters} documents={documents} />
          </section>
        </aside>

        <div className="space-y-6">
          <section className="md-panel relative overflow-hidden p-6">
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

              <div className="mt-5">
                <DocumentContext
                  documents={documents}
                  selectedDocumentId={filters.document_ids?.[0]}
                  onSelect={handleDocumentSelect}
                />
              </div>

              {error && (
                <p className="mt-4 rounded-[20px] bg-[rgb(var(--md-error)/0.08)] px-4 py-3 text-sm text-[rgb(var(--md-error))]">
                  {error}
                </p>
              )}
            </div>
          </section>

          <section className="md-panel p-6">
            {!result && !isLoading && (
              <div className="mb-4 text-sm text-[rgb(var(--md-ink-soft))]">Ask a question to see results.</div>
            )}

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
        </div>
      </div>
    </div>
  );
}
