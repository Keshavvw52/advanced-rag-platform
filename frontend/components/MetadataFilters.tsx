"use client";

import { useState } from "react";
import { MetadataFilter } from "@/lib/api";
import { ChevronDown, ChevronUp, Filter } from "lucide-react";

interface MetadataFiltersProps {
  filters: MetadataFilter;
  onChange: (f: MetadataFilter) => void;
  documents?: Array<{ id: string; original_filename: string }>;
}

export function MetadataFilters({
  filters,
  onChange,
  documents = [],
}: MetadataFiltersProps) {
  const [expanded, setExpanded] = useState(false);

  const activeCount = Object.values(filters).filter(
    (v) => v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)
  ).length;

  const update = (key: keyof MetadataFilter, value: any) => {
    onChange({ ...filters, [key]: value !== "" ? value : undefined });
  };

  const clear = () => onChange({});

  return (
    <div className="rounded-[24px] bg-transparent">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between rounded-full bg-[rgb(var(--md-secondary))] px-4 py-3 text-sm font-medium text-[rgb(var(--md-secondary-ink))] transition-colors duration-300 hover:bg-[rgb(var(--md-secondary)/0.85)]"
      >
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-[rgb(var(--md-secondary-ink))]" />
          <span>Metadata Filters</span>
          {activeCount > 0 && (
            <span className="rounded-full bg-[rgb(var(--md-primary)/0.14)] px-2 py-0.5 text-xs font-medium text-[rgb(var(--md-primary-strong))]">
              {activeCount} active
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-[rgb(var(--md-ink-soft))]" />
        ) : (
          <ChevronDown className="h-4 w-4 text-[rgb(var(--md-ink-soft))]" />
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-4 rounded-[24px] bg-[rgb(var(--md-surface-high)/0.5)] p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Source document filter */}
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--md-ink-soft))]">
                Source Document
              </label>
              {documents.length > 0 ? (
                <select
                  value={filters.document_ids?.[0] || ""}
                  onChange={(e) =>
                    update("document_ids", e.target.value ? [e.target.value] : undefined)
                  }
                  className="md-input h-14 w-full rounded-t-[16px]"
                >
                  <option value="">All documents</option>
                  {documents.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.original_filename}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="e.g. report.pdf"
                  value={filters.source || ""}
                  onChange={(e) => update("source", e.target.value)}
                  className="md-input"
                />
              )}
            </div>

            {/* Section filter */}
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--md-ink-soft))]">
                Section Header
              </label>
              <input
                type="text"
                placeholder="e.g. Introduction"
                value={filters.section || ""}
                onChange={(e) => update("section", e.target.value)}
                className="md-input"
              />
            </div>

            {/* Page range */}
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--md-ink-soft))]">
                Page Range
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="From"
                  min={1}
                  value={filters.page_min || ""}
                  onChange={(e) =>
                    update("page_min", e.target.value ? parseInt(e.target.value) : undefined)
                  }
                  className="md-input"
                />
                <span className="text-sm text-[rgb(var(--md-ink-soft))]">–</span>
                <input
                  type="number"
                  placeholder="To"
                  min={1}
                  value={filters.page_max || ""}
                  onChange={(e) =>
                    update("page_max", e.target.value ? parseInt(e.target.value) : undefined)
                  }
                  className="md-input"
                />
              </div>
            </div>

            {/* Chunk strategy filter */}
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--md-ink-soft))]">
                Chunk Strategy
              </label>
              <select
                value={filters.chunk_strategy || ""}
                onChange={(e) => update("chunk_strategy", e.target.value)}
                className="md-input h-14 w-full rounded-t-[16px]"
              >
                <option value="">All strategies</option>
                <option value="recursive">Recursive</option>
                <option value="semantic">Semantic</option>
                <option value="parent_child">Parent-Child</option>
                <option value="section">Section</option>
              </select>
            </div>

            {/* Tags filter */}
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--md-ink-soft))]">
                Tags (comma-separated)
              </label>
              <input
                type="text"
                placeholder="e.g. finance, legal, technical"
                value={(filters.tags || []).join(", ")}
                onChange={(e) => {
                  const tags = e.target.value
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean);
                  update("tags", tags.length > 0 ? tags : undefined);
                }}
                className="md-input"
              />
            </div>
          </div>

          {activeCount > 0 && (
            <button
              onClick={clear}
              className="text-xs font-medium text-[rgb(var(--md-error))]"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
