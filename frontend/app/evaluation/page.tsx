"use client";

import { useState } from "react";
import { evaluationApi, RetrievalStrategy, BatchEvaluationResponse } from "@/lib/api";
import { EvalDashboard } from "@/components/EvalDashboard";
import { BarChart2, Play, FlaskConical } from "lucide-react";

const ALL_STRATEGIES: RetrievalStrategy[] = [
  "hybrid_rerank",
  "hybrid",
  "basic_vector",
  "parent_child",
  "multi_query",
];

export default function EvaluatePage() {
  const [selectedStrategies, setSelectedStrategies] = useState<RetrievalStrategy[]>([
    "hybrid_rerank",
    "hybrid",
    "basic_vector",
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchEvaluationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");

  // Single question eval
  const [singleQ, setSingleQ] = useState("");
  const [singleRef, setSingleRef] = useState("");
  const [singleStrategy, setSingleStrategy] = useState<RetrievalStrategy>("hybrid_rerank");
  const [singleResult, setSingleResult] = useState<any>(null);
  const [singleLoading, setSingleLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"batch" | "single">("batch");

  const toggleStrategy = (s: RetrievalStrategy) => {
    setSelectedStrategies((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  const handleBatchEval = async () => {
    if (selectedStrategies.length === 0) {
      setError("Select at least one strategy");
      return;
    }
    setIsLoading(true);
    setError(null);
    setProgress("Starting batch evaluation...");

    try {
      const result = await evaluationApi.batchEvaluate({ strategies: selectedStrategies });
      setBatchResult(result);
      setProgress("");
    } catch (err: any) {
      setError(err.message || "Batch evaluation failed. Ensure documents are uploaded.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSingleEval = async () => {
    if (!singleQ.trim() || !singleRef.trim()) return;
    setSingleLoading(true);
    setSingleResult(null);

    try {
      const result = await evaluationApi.evaluate({
        question: singleQ,
        reference_answer: singleRef,
        strategy: singleStrategy,
      });
      setSingleResult(result);
    } catch (err: any) {
      setError(err.message || "Evaluation failed");
    } finally {
      setSingleLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="md-panel p-8">
        <div className="flex items-center gap-2 mb-1">
          <BarChart2 className="h-5 w-5 text-[rgb(var(--md-primary))]" />
          <h1 className="text-[2.1rem] font-medium text-[rgb(var(--md-ink))]">RAG Evaluation</h1>
        </div>
        <p className="text-sm leading-7 text-[rgb(var(--md-ink-soft))]">
          Benchmark retrieval strategies using 20 built-in Q&A pairs. Measures faithfulness, relevancy, precision, and recall.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex w-fit gap-2 rounded-full bg-[rgb(var(--md-secondary))] p-1.5">
        <button
          onClick={() => setActiveTab("batch")}
          className={`rounded-full px-5 py-2 text-sm font-medium transition-all ${
            activeTab === "batch" ? "bg-[rgb(var(--md-background))] text-[rgb(var(--md-ink))] shadow-sm" : "text-[rgb(var(--md-ink-soft))]"
          }`}
        >
          Batch Evaluation
        </button>
        <button
          onClick={() => setActiveTab("single")}
          className={`rounded-full px-5 py-2 text-sm font-medium transition-all ${
            activeTab === "single" ? "bg-[rgb(var(--md-background))] text-[rgb(var(--md-ink))] shadow-sm" : "text-[rgb(var(--md-ink-soft))]"
          }`}
        >
          Single Question
        </button>
      </div>

      {activeTab === "batch" && (
        <div className="space-y-6">
          {/* Strategy selection */}
          <div className="md-panel p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[rgb(var(--md-ink))]">
              <FlaskConical className="h-4 w-4 text-[rgb(var(--md-tertiary))]" />
              Select Strategies to Evaluate
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ALL_STRATEGIES.map((s) => (
                <label
                  key={s}
                  className={`flex cursor-pointer items-center gap-2 rounded-[20px] border p-3 transition-colors ${
                    selectedStrategies.includes(s)
                      ? "border-[rgb(var(--md-primary)/0.3)] bg-[rgb(var(--md-primary)/0.1)]"
                      : "border-[rgb(var(--md-outline)/0.16)] bg-[rgb(var(--md-surface-high)/0.55)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedStrategies.includes(s)}
                    onChange={() => toggleStrategy(s)}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <span className="text-sm font-medium capitalize text-[rgb(var(--md-ink))]">
                    {s.replace(/_/g, " ")}
                  </span>
                </label>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-[rgb(var(--md-ink-soft))]">
                Runs 20 built-in Q&A pairs × {selectedStrategies.length} strategies
                = {20 * selectedStrategies.length} evaluations
              </p>
              <button
                onClick={handleBatchEval}
                disabled={isLoading || selectedStrategies.length === 0}
                className="md-button-primary text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                {isLoading ? "Evaluating..." : "Run Evaluation"}
              </button>
            </div>

            {isLoading && (
              <div className="mt-3 flex items-center gap-2 text-sm text-[rgb(var(--md-primary))]">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[rgb(var(--md-primary))] border-t-transparent" />
                This may take several minutes...
              </div>
            )}

            {error && (
              <p className="mt-3 rounded-[18px] bg-[rgb(var(--md-error)/0.08)] p-2 text-sm text-[rgb(var(--md-error))]">{error}</p>
            )}
          </div>

          {/* Results */}
          {batchResult && <EvalDashboard batchResult={batchResult} />}
        </div>
      )}

      {activeTab === "single" && (
        <div className="space-y-4">
          <div className="md-panel space-y-4 p-5">
            <h3 className="text-sm font-semibold text-[rgb(var(--md-ink))]">Evaluate a Single Question</h3>

            <div className="space-y-1">
              <label className="text-xs font-medium text-[rgb(var(--md-ink-soft))]">Question</label>
              <textarea
                value={singleQ}
                onChange={(e) => setSingleQ(e.target.value)}
                placeholder="Enter your question..."
                rows={2}
                className="md-input min-h-[96px] resize-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-[rgb(var(--md-ink-soft))]">Reference Answer</label>
              <textarea
                value={singleRef}
                onChange={(e) => setSingleRef(e.target.value)}
                placeholder="Enter the expected/reference answer..."
                rows={3}
                className="md-input min-h-[126px] resize-none"
              />
            </div>

            <div className="flex items-center gap-3">
              <select
                value={singleStrategy}
                onChange={(e) => setSingleStrategy(e.target.value as RetrievalStrategy)}
                className="md-input h-14 w-full max-w-[240px]"
              >
                {ALL_STRATEGIES.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                ))}
              </select>
              <button
                onClick={handleSingleEval}
                disabled={singleLoading || !singleQ.trim() || !singleRef.trim()}
                className="md-button-primary text-sm disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                {singleLoading ? "Evaluating..." : "Evaluate"}
              </button>
            </div>
          </div>

          {singleResult && (
            <div className="md-panel space-y-4 p-5">
              <h3 className="text-sm font-semibold text-[rgb(var(--md-ink))]">Evaluation Results</h3>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Faithfulness", value: singleResult.metrics.faithfulness, color: "text-blue-600" },
                  { label: "Relevancy", value: singleResult.metrics.answer_relevancy, color: "text-purple-600" },
                  { label: "Precision", value: singleResult.metrics.context_precision, color: "text-green-600" },
                  { label: "Recall", value: singleResult.metrics.context_recall, color: "text-yellow-600" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center rounded-lg bg-gray-50 p-3">
                    <p className={`text-2xl font-bold ${color}`}>{Math.round(value * 100)}%</p>
                    <p className="text-xs text-gray-500">{label}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500">GENERATED ANSWER</p>
                <p className="text-sm text-gray-700 bg-gray-50 rounded p-3 leading-relaxed">
                  {singleResult.generated_answer}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
