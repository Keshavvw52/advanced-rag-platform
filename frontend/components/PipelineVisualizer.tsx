"use client";

import { useState } from "react";
import { PipelineTrace, PipelineStep } from "@/lib/api";
import {
  Search, Zap, Filter, FileText, Brain, ChevronDown, ChevronUp, Clock
} from "lucide-react";

const STEP_ICONS: Record<string, any> = {
  "Query Transformation": Zap,
  "Document Retrieval": Search,
  "Cross-Encoder Reranking": Filter,
  "Context Assembly": FileText,
  "LLM Generation": Brain,
};

const STEP_COLORS: Record<string, string> = {
  "Query Transformation": "border-purple-200 bg-purple-50",
  "Document Retrieval": "border-blue-200 bg-blue-50",
  "Cross-Encoder Reranking": "border-orange-200 bg-orange-50",
  "Context Assembly": "border-green-200 bg-green-50",
  "LLM Generation": "border-red-200 bg-red-50",
};

const ICON_COLORS: Record<string, string> = {
  "Query Transformation": "text-purple-600",
  "Document Retrieval": "text-blue-600",
  "Cross-Encoder Reranking": "text-orange-600",
  "Context Assembly": "text-green-600",
  "LLM Generation": "text-red-600",
};

function StepCard({ step, index }: { step: PipelineStep; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = STEP_ICONS[step.step_name] || Search;
  const borderColor = STEP_COLORS[step.step_name] || "border-[rgb(var(--md-outline)/0.16)] bg-[rgb(var(--md-surface-high)/0.55)]";
  const iconColor = ICON_COLORS[step.step_name] || "text-[rgb(var(--md-ink-soft))]";

  return (
    <div className={`rounded-[24px] border p-4 ${borderColor}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[rgb(var(--md-surface-high))] shadow-sm">
            <Icon className={`h-4 w-4 ${iconColor}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[rgb(var(--md-ink-soft))]">Step {index + 1}</span>
            </div>
            <p className="text-sm font-semibold text-[rgb(var(--md-ink))]">{step.step_name}</p>
            <p className="text-xs text-[rgb(var(--md-ink-soft))]">{step.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {step.latency_ms && (
            <div className="flex items-center gap-1 text-xs text-[rgb(var(--md-ink-soft))]">
              <Clock className="h-3 w-3" />
              <span>{step.latency_ms.toFixed(0)}ms</span>
            </div>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[rgb(var(--md-ink-soft))]"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (step.input !== null || step.output !== null) && (
        <div className="mt-4 space-y-3 border-t border-[rgb(var(--md-surface-high)/0.7)] pt-3">
          {step.input !== null && step.input !== undefined && (
            <div>
              <p className="mb-1 text-xs font-semibold text-[rgb(var(--md-ink-soft))]">INPUT</p>
              <pre className="max-h-40 overflow-auto rounded-[18px] border border-[rgb(var(--md-outline)/0.14)] bg-[rgb(var(--md-surface-high))] p-3 text-xs text-[rgb(var(--md-ink-soft))]">
                {typeof step.input === "string"
                  ? step.input
                  : JSON.stringify(step.input, null, 2).slice(0, 2000)}
              </pre>
            </div>
          )}
          {step.output !== null && step.output !== undefined && (
            <div>
              <p className="mb-1 text-xs font-semibold text-[rgb(var(--md-ink-soft))]">OUTPUT</p>
              <pre className="max-h-40 overflow-auto rounded-[18px] border border-[rgb(var(--md-outline)/0.14)] bg-[rgb(var(--md-surface-high))] p-3 text-xs text-[rgb(var(--md-ink-soft))]">
                {typeof step.output === "string"
                  ? step.output
                  : JSON.stringify(step.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface PipelineVisualizerProps {
  trace: PipelineTrace;
}

export function PipelineVisualizer({ trace }: PipelineVisualizerProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [showContext, setShowContext] = useState(false);

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-[20px] bg-[rgb(var(--md-surface-high)/0.55)] p-3 text-center">
          <p className="text-xs text-[rgb(var(--md-ink-soft))]">Strategy</p>
          <p className="text-sm font-semibold capitalize text-[rgb(var(--md-ink))]">
            {(trace.strategy || "").replace(/_/g, " ")}
          </p>
        </div>
        <div className="rounded-[20px] bg-[rgb(var(--md-surface-high)/0.55)] p-3 text-center">
          <p className="text-xs text-[rgb(var(--md-ink-soft))]">Total Time</p>
          <p className="text-sm font-semibold text-[rgb(var(--md-ink))]">
           {trace.total_latency_ms
           ? (trace.total_latency_ms / 1000).toFixed(2) + "s"
           : "-"}
          </p>
        </div>
        <div className="rounded-[20px] bg-[rgb(var(--md-surface-high)/0.55)] p-3 text-center">
          <p className="text-xs text-[rgb(var(--md-ink-soft))]">Input Tokens</p>
          <p className="text-sm font-semibold text-[rgb(var(--md-ink))]">
            {trace.input_tokens.toLocaleString()}
          </p>
        </div>
        <div className="rounded-[20px] bg-[rgb(var(--md-surface-high)/0.55)] p-3 text-center">
          <p className="text-xs text-[rgb(var(--md-ink-soft))]">Output Tokens</p>
          <p className="text-sm font-semibold text-[rgb(var(--md-ink))]">
            {trace.output_tokens.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Query transformations */}
      {trace.transformed_queries?.length > 1 && (
        <div className="rounded-[24px] border border-[rgb(var(--md-primary)/0.18)] bg-[rgb(var(--md-primary)/0.08)] p-4">
          <p className="mb-2 text-xs font-semibold text-[rgb(var(--md-primary-strong))]">
            TRANSFORMED QUERIES ({trace.transformed_queries.length})
          </p>
          <div className="space-y-1">
            {trace.transformed_queries.map((q, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-[rgb(var(--md-ink-soft))]">
                <span className="mt-0.5 font-mono text-xs text-[rgb(var(--md-primary))]">{i + 1}.</span>
                <span>{q}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pipeline steps */}
      <div className="space-y-2">
        {trace.steps.map((step, i) => (
          <div key={i} className="relative">
            <StepCard step={step} index={i} />
            {i < trace.steps.length - 1 && (
              <div className="flex justify-center py-1">
                <div className="h-4 w-0.5 bg-[rgb(var(--md-outline)/0.3)]" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Context & Prompt toggles */}
      <div className="space-y-2">
        {trace.final_context && (
          <div className="rounded-[24px] border border-[rgb(var(--md-outline)/0.16)] bg-[rgb(var(--md-surface-high)/0.45)]">
            <button
              onClick={() => setShowContext(!showContext)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-[rgb(var(--md-ink))]"
            >
              <span>Final Context Sent to LLM</span>
              {showContext ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showContext && (
              <div className="border-t border-[rgb(var(--md-outline)/0.14)] px-4 pb-4">
                <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-[18px] bg-[rgb(var(--md-surface-low))] p-3 text-xs text-[rgb(var(--md-ink-soft))]">
                  {trace.final_context}
                </pre>
              </div>
            )}
          </div>
        )}

        {trace.prompt_sent && (
          <div className="rounded-[24px] border border-[rgb(var(--md-outline)/0.16)] bg-[rgb(var(--md-surface-high)/0.45)]">
            <button
              onClick={() => setShowPrompt(!showPrompt)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-[rgb(var(--md-ink))]"
            >
              <span>Full Prompt Sent to LLM</span>
              {showPrompt ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showPrompt && (
              <div className="border-t border-[rgb(var(--md-outline)/0.14)] px-4 pb-4">
                <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-[18px] bg-[rgb(var(--md-surface-low))] p-3 text-xs text-[rgb(var(--md-ink-soft))]">
                  {trace.prompt_sent}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
