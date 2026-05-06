"use client";

import { useEffect, useState, useRef } from "react";
import { documentsApi, DocumentResponse } from "@/lib/api";
import { DocumentList } from "@/components/DocumentList";
import { Tag, Upload } from "lucide-react";

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [tags, setTags] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = async () => {
    try {
      const docs = await documentsApi.list();
      setDocuments(docs);
    } catch (err) {
      console.error("Failed to load documents", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
    // Poll for processing documents
    const interval = setInterval(async () => {
      const hasProcessing = documents.some((d) => d.status === "processing");
      if (hasProcessing) loadDocuments();
    }, 3000);
    return () => clearInterval(interval);
  }, [documents]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      await documentsApi.upload(file, tags);
      await loadDocuments();
      setTags("");
    } catch (err: any) {
      setUploadError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const handleRefresh = async (id: string) => {
    try {
      const doc = await documentsApi.get(id);
      setDocuments((prev) => prev.map((d) => (d.id === id ? doc : d)));
    } catch {}
  };

  const handleDelete = (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const totalChunks = documents.reduce((sum, d) => sum + d.chunk_counts.total, 0);
  const readyDocs = documents.filter((d) => d.status === "ready").length;

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="md-panel relative overflow-hidden p-8">
        <div aria-hidden="true" className="md-blur-orb right-8 top-8 h-24 w-24 bg-[rgb(var(--md-primary)/0.15)]" />
        <div className="relative">
          <span className="md-chip">Library</span>
          <h1 className="mt-4 text-[2.2rem] font-medium text-[rgb(var(--md-ink))]">Documents</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-[rgb(var(--md-ink-soft))]">
          Upload documents to build your knowledge base. All chunking strategies run automatically.
          </p>
        </div>
      </div>

      {/* Stats */}
      {documents.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md-card p-5 text-center">
            <p className="text-3xl font-medium text-[rgb(var(--md-ink))]">{documents.length}</p>
            <p className="text-sm text-[rgb(var(--md-ink-soft))]">Documents</p>
          </div>
          <div className="md-card p-5 text-center">
            <p className="text-3xl font-medium text-[rgb(var(--md-ink))]">{readyDocs}</p>
            <p className="text-sm text-[rgb(var(--md-ink-soft))]">Ready</p>
          </div>
          <div className="md-card p-5 text-center">
            <p className="text-3xl font-medium text-[rgb(var(--md-ink))]">{totalChunks.toLocaleString()}</p>
            <p className="text-sm text-[rgb(var(--md-ink-soft))]">Total Chunks</p>
          </div>
        </div>
      )}

      {/* Upload area */}
      <div className="md-panel border-2 border-dashed border-[rgb(var(--md-outline)/0.25)] p-8">
        <div
          className={`rounded-[28px] p-4 transition-colors duration-300 ${dragActive ? "bg-[rgb(var(--md-primary)/0.08)]" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
        >
          <div className="text-center">
            <Upload className="mx-auto mb-3 h-10 w-10 text-[rgb(var(--md-primary))]" />
            <p className="text-sm font-medium text-[rgb(var(--md-ink))]">
              Drop a file here or{" "}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="font-semibold text-[rgb(var(--md-primary-strong))]"
              >
                browse
              </button>
            </p>
            <p className="mt-1 text-xs text-[rgb(var(--md-ink-soft))]">
              PDF, TXT, DOCX, Markdown · Max {50}MB
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.txt,.docx,.md,.markdown"
            onChange={handleFileInput}
          />

          {/* Tags input */}
          <div className="mt-5 max-w-sm mx-auto">
            <div className="flex items-center gap-2 rounded-[20px] bg-[rgb(var(--md-surface-low))] px-3 py-2">
              <Tag className="h-4 w-4 text-[rgb(var(--md-ink-soft))]" />
              <input
                type="text"
                placeholder="Optional tags (e.g. finance, legal)"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none"
              />
            </div>
          </div>

          {uploading && (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-[rgb(var(--md-primary))]">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[rgb(var(--md-primary))] border-t-transparent" />
              Uploading and processing...
            </div>
          )}

          {uploadError && (
            <p className="mt-3 rounded-[18px] bg-[rgb(var(--md-error)/0.08)] p-2 text-center text-sm text-[rgb(var(--md-error))]">
              {uploadError}
            </p>
          )}
        </div>
      </div>

      {/* Document list */}
      <DocumentList
        documents={documents}
        onDelete={handleDelete}
        onRefresh={handleRefresh}
        isLoading={isLoading}
      />
    </div>
  );
}
