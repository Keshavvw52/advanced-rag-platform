"use client";

import { useState } from "react";
import { queryApi, CompareResponse, RetrievalStrategy } from "@/lib/api";
import { StrategyDropdown } from "@/components/StrategySelector";
import { ChunkInspector } from "@/components/ChunkInspector";
import { AnswerDisplay } from "@/components/AnswerDisplay";
import { GitCompare, Send, Clock } from "lucide-react";

function MetricsComparison({
  resultA,
  resultB,
}: {
  resultA: any;
  resultB: any;
}) {
  const metrics = [
    { label: "Latency", a: `${(resultA.latency_ms / 1000).toFixed(2)}s`, b: `${(resultB.latency_ms / 1000).toFixed(2)}s` },
    { label: "Input Tokens", a: resultA.input_tokens.toLocaleString(), b: resultB.input_tokens.toLocaleString() },
    { label: "Output Tokens", a: resultA.output_tokens.toLocaleString(), b: resultB.output_tokens.toLocaleString() },
    { label: "Chunks Retrieved", a: resultA.retrieved_chunks.length, b: resultB.retrieved_chunks.length },
  ];

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Metric</th>
            <th className="px-4 py-2 text-center text-xs font-semibold text-blue-600">Strategy A</th>
            <th className="px-4 py-2 text-center text-xs font-semibold text-purple-600">Strategy B</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {metrics.map(({ label, a, b }) => (
            <tr key={label}>
              <td className="px-4 py-2 text-gray-600 font-medium">{label}</td>
              <td className="px-4 py-2 text-center text-gray-800">{a}</td>
              <td className="px-4 py-2 text-center text-gray-800">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ComparePage() {
  const [query, setQuery] = useState("");
  const [strategyA, setStrategyA] = useState<RetrievalStrategy>("hybrid_rerank");
  const [strategyB, setStrategyB] = useState<RetrievalStrategy>("basic_vector");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<CompareResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCompare = async () => {
    if (!query.trim()) return;
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await queryApi.compare({
        query,
        strategy_a: strategyA,
        strategy_b: strategyB,
      });
      setResult(res);
    } catch (err: any) {
      setError(err.message || "Comparison failed");
    } finally {
      setIsLoading(false);
    }
  };

  const overlapSet = new Set(result?.overlap_chunk_ids || []);

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="md-panel p-8">
        <div className="flex items-center gap-2 mb-1">
          <GitCompare className="h-5 w-5 text-[rgb(var(--md-primary))]" />
          <h1 className="text-[2.1rem] font-medium text-[rgb(var(--md-ink))]">A/B Strategy Comparison</h1>
        </div>
        <p className="text-sm leading-7 text-[rgb(var(--md-ink-soft))]">
          Run the same query with two strategies side-by-side to compare quality.
        </p>
      </div>

      {/* Query + strategy selectors */}
      <div className="md-panel space-y-4 p-5">
        <div className="flex gap-3">
          <StrategyDropdown
            value={strategyA}
            onChange={setStrategyA}
            label="Strategy A"
            disabled={isLoading}
          />
          <StrategyDropdown
            value={strategyB}
            onChange={setStrategyB}
            label="Strategy B"
            disabled={isLoading}
          />
        </div>

        <div className="flex gap-3">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter a question to compare both strategies..."
            disabled={isLoading}
            rows={3}
            className="md-input min-h-[132px] flex-1 resize-none disabled:opacity-50"
          />
          <button
            onClick={handleCompare}
            disabled={isLoading || !query.trim()}
            className="md-button-primary self-end h-12 px-6 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {isLoading ? "Comparing..." : "Compare"}
          </button>
        </div>

        {error && (
          <p className="rounded-[18px] bg-[rgb(var(--md-error)/0.08)] px-3 py-2 text-sm text-[rgb(var(--md-error))]">{error}</p>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-3 py-12 text-[rgb(var(--md-ink-soft))]">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[rgb(var(--md-primary))] border-t-transparent" />
          Running both strategies in parallel...
        </div>
      )}

      {result && (
        <div className="space-y-6">
          {/* Metrics comparison */}
          <MetricsComparison resultA={result.result_a} resultB={result.result_b} />

          {/* Overlap indicator */}
          {overlapSet.size > 0 && (
            <div className="md-card border-[rgb(var(--md-tertiary)/0.22)] bg-[rgb(var(--md-tertiary)/0.08)] px-4 py-3 text-sm text-[rgb(var(--md-secondary-ink))]">
              <strong>{overlapSet.size} chunk(s)</strong> retrieved by both strategies (highlighted below)
            </div>
          )}

          {/* Side-by-side answers */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="h-3 w-3 rounded-full bg-blue-500" />
                <span className="text-sm font-semibold text-blue-700">
                  Strategy A: {strategyA.replace(/_/g, " ")}
                </span>
                <div className="flex items-center gap-1 text-xs text-gray-400 ml-auto">
                  <Clock className="h-3 w-3" />
                  {(result.result_a.latency_ms / 1000).toFixed(2)}s
                </div>
              </div>
              <AnswerDisplay result={result.result_a} />
            </div>

            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="h-3 w-3 rounded-full bg-purple-500" />
                <span className="text-sm font-semibold text-purple-700">
                  Strategy B: {strategyB.replace(/_/g, " ")}
                </span>
                <div className="flex items-center gap-1 text-xs text-gray-400 ml-auto">
                  <Clock className="h-3 w-3" />
                  {(result.result_b.latency_ms / 1000).toFixed(2)}s
                </div>
              </div>
              <AnswerDisplay result={result.result_b} />
            </div>
          </div>

          {/* Side-by-side chunks */}
          <div className="grid grid-cols-2 gap-6">
            <ChunkInspector
              chunks={result.result_a.retrieved_chunks}
              title={`Strategy A Chunks (${result.result_a.retrieved_chunks.length})`}
              highlightIds={result.overlap_chunk_ids}
            />
            <ChunkInspector
              chunks={result.result_b.retrieved_chunks}
              title={`Strategy B Chunks (${result.result_b.retrieved_chunks.length})`}
              highlightIds={result.overlap_chunk_ids}
            />
          </div>
        </div>
      )}
    </div>
  );
}
