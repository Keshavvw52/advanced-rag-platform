"use client";

import { useState } from "react";
import { DocumentResponse, documentsApi } from "@/lib/api";
import {
  FileText, Trash2, RefreshCw, CheckCircle, Clock, AlertCircle, ChevronDown, ChevronUp, Tag
} from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  const config = {
    ready: { icon: CheckCircle, color: "text-green-600", bg: "bg-green-50", label: "Ready" },
    processing: { icon: Clock, color: "text-yellow-600", bg: "bg-yellow-50", label: "Processing" },
    failed: { icon: AlertCircle, color: "text-red-600", bg: "bg-red-50", label: "Failed" },
  }[status] || { icon: Clock, color: "text-gray-500", bg: "bg-gray-50", label: status };

  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${config.bg} ${config.color}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentCard({
  doc,
  onDelete,
  onRefresh,
}: {
  doc: DocumentResponse;
  onDelete: (id: string) => void;
  onRefresh: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Delete "${doc.original_filename}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await documentsApi.delete(doc.id);
      onDelete(doc.id);
    } catch (err) {
      alert("Failed to delete document");
      setDeleting(false);
    }
  };

  const extColor: Record<string, string> = {
    pdf: "bg-red-100 text-red-700",
    txt: "bg-blue-100 text-blue-700",
    docx: "bg-indigo-100 text-indigo-700",
    md: "bg-green-100 text-green-700",
    markdown: "bg-green-100 text-green-700",
  };

  return (
    <div className="md-card overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[18px] bg-[rgb(var(--md-secondary))]">
              <FileText className="h-5 w-5 text-[rgb(var(--md-secondary-ink))]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="truncate text-base font-medium text-[rgb(var(--md-ink))]">
                  {doc.original_filename}
                </p>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium uppercase ${extColor[doc.file_type] || "bg-gray-100 text-gray-600"}`}>
                  {doc.file_type}
                </span>
                <StatusBadge status={doc.status} />
              </div>
              <div className="mt-1 flex items-center gap-3 text-xs text-[rgb(var(--md-ink-soft))]">
                <span>{formatBytes(doc.file_size)}</span>
                {doc.total_pages > 0 && <span>{doc.total_pages} pages</span>}
                <span>{new Date(doc.upload_date).toLocaleDateString()}</span>
              </div>
              {doc.tags.length > 0 && (
                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                  <Tag className="h-3 w-3 text-[rgb(var(--md-ink-soft))]" />
                  {doc.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-[rgb(var(--md-secondary))] px-2 py-0.5 text-xs text-[rgb(var(--md-secondary-ink))]">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {doc.status === "processing" && (
              <button
                onClick={() => onRefresh(doc.id)}
                className="rounded-full p-2 text-[rgb(var(--md-ink-soft))] hover:bg-[rgb(var(--md-primary)/0.08)] hover:text-[rgb(var(--md-primary))]"
                title="Refresh status"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-full p-2 text-[rgb(var(--md-ink-soft))] hover:bg-[rgb(var(--md-error)/0.08)] hover:text-[rgb(var(--md-error))] disabled:opacity-50"
              title="Delete document"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className="rounded-full p-2 text-[rgb(var(--md-ink-soft))] hover:bg-[rgb(var(--md-primary)/0.08)]"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {doc.status === "failed" && doc.error_message && (
          <p className="mt-2 rounded-[18px] bg-[rgb(var(--md-error)/0.08)] p-2 text-xs text-[rgb(var(--md-error))]">
            Error: {doc.error_message}
          </p>
        )}
      </div>

      {/* Expanded: chunk counts */}
      {expanded && doc.status === "ready" && (
        <div className="border-t border-[rgb(var(--md-outline)/0.14)] bg-[rgb(var(--md-surface-high)/0.45)] px-4 py-3">
          <p className="mb-2 text-xs font-semibold text-[rgb(var(--md-ink-soft))]">CHUNKS BY STRATEGY</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "Recursive", count: doc.chunk_counts.recursive, color: "bg-blue-50 text-blue-700" },
              { label: "Semantic", count: doc.chunk_counts.semantic, color: "bg-purple-50 text-purple-700" },
              { label: "Parent-Child", count: doc.chunk_counts.parent_child, color: "bg-green-50 text-green-700" },
              { label: "Section", count: doc.chunk_counts.section, color: "bg-orange-50 text-orange-700" },
            ].map(({ label, count, color }) => (
              <div key={label} className={`rounded-[18px] p-2 text-center ${color}`}>
                <p className="text-lg font-bold">{count}</p>
                <p className="text-xs">{label}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-right text-xs text-[rgb(var(--md-ink-soft))]">
            Total: {doc.chunk_counts.total} chunks
          </p>
        </div>
      )}
    </div>
  );
}

interface DocumentListProps {
  documents: DocumentResponse[];
  onDelete: (id: string) => void;
  onRefresh: (id: string) => void;
  isLoading?: boolean;
}

export function DocumentList({
  documents,
  onDelete,
  onRefresh,
  isLoading,
}: DocumentListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="md-card p-4 animate-pulse">
            <div className="flex gap-3">
              <div className="h-10 w-10 rounded-lg bg-gray-200" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-1/2" />
                <div className="h-3 bg-gray-100 rounded w-1/3" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="md-card border-dashed border-[rgb(var(--md-outline)/0.25)] bg-[rgb(var(--md-surface-high)/0.45)] py-12 text-center">
        <FileText className="mx-auto mb-3 h-8 w-8 text-[rgb(var(--md-ink-soft)/0.5)]" />
        <p className="text-sm text-[rgb(var(--md-ink-soft))]">No documents uploaded yet</p>
        <p className="mt-1 text-xs text-[rgb(var(--md-ink-soft)/0.8)]">
          Upload PDF, TXT, DOCX, or Markdown files
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {documents.map((doc) => (
        <DocumentCard
          key={doc.id}
          doc={doc}
          onDelete={onDelete}
          onRefresh={onRefresh}
        />
      ))}
    </div>
  );
}
