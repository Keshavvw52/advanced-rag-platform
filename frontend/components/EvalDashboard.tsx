"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar
} from "recharts";
import { BatchEvaluationResponse, EvaluationResponse } from "@/lib/api";
import { Award, TrendingUp, CheckCircle, AlertCircle } from "lucide-react";

const STRATEGY_LABELS: Record<string, string> = {
  basic_vector: "Basic Vector",
  hybrid: "Hybrid",
  hybrid_rerank: "Hybrid+Rerank",
  parent_child: "Parent-Child",
  multi_query: "Multi-Query",
  hyde: "HyDE",
  decomposition: "Decompose",
};

const METRIC_COLORS = {
  faithfulness: "#3b82f6",
  relevancy: "#8b5cf6",
  precision: "#10b981",
  recall: "#f59e0b",
};

function MetricCard({
  label, value, color, icon: Icon
}: {
  label: string; value: number; color: string; icon: any
}) {
  const pct = Math.round(value * 100);
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-600">{label}</span>
        <Icon className="h-4 w-4 text-gray-400" />
      </div>
      <div className="text-2xl font-bold" style={{ color }}>{pct}%</div>
      <div className="mt-2 h-1.5 rounded-full bg-gray-100">
        <div
          className="h-1.5 rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

interface EvalDashboardProps {
  batchResult: BatchEvaluationResponse;
}

export function EvalDashboard({ batchResult }: EvalDashboardProps) {
  const { leaderboard, summaries, per_question_results } = batchResult;

  // Prepare bar chart data
  const barData = summaries.map((s) => ({
    name: STRATEGY_LABELS[s.strategy] || s.strategy,
    Faithfulness: Math.round(s.avg_faithfulness * 100),
    Relevancy: Math.round(s.avg_relevancy * 100),
    Precision: Math.round(s.avg_precision * 100),
    Recall: Math.round(s.avg_recall * 100),
  }));

  // Prepare radar chart data for top strategy
  const top = leaderboard[0];
  const radarData = [
    { metric: "Faithfulness", value: Math.round(top.avg_faithfulness * 100) },
    { metric: "Relevancy", value: Math.round(top.avg_relevancy * 100) },
    { metric: "Precision", value: Math.round(top.avg_precision * 100) },
    { metric: "Recall", value: Math.round(top.avg_recall * 100) },
  ];

  // Failed questions (below 0.5 average)
  const failedQuestions = per_question_results.filter(
    (r) => r.metrics.average < 0.5
  );

  return (
    <div className="space-y-6">
      {/* Leaderboard */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Award className="h-4 w-4 text-yellow-500" />
          Strategy Leaderboard
        </h3>
        <div className="space-y-2">
          {leaderboard.map((s, i) => (
            <div
              key={s.strategy}
              className={`flex items-center justify-between rounded-lg border p-3 ${
                i === 0 ? "border-yellow-300 bg-yellow-50" : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`text-lg font-bold ${i === 0 ? "text-yellow-600" : "text-gray-400"}`}>
                  #{i + 1}
                </span>
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    {STRATEGY_LABELS[s.strategy] || s.strategy}
                  </p>
                  <p className="text-xs text-gray-500">{s.num_questions} questions</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-gray-800">
                  {Math.round(s.avg_overall * 100)}%
                </p>
                <p className="text-xs text-gray-400">Overall</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top strategy metrics */}
      {top && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-500" />
            Top Strategy: {STRATEGY_LABELS[top.strategy] || top.strategy}
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard
              label="Faithfulness"
              value={top.avg_faithfulness}
              color={METRIC_COLORS.faithfulness}
              icon={CheckCircle}
            />
            <MetricCard
              label="Relevancy"
              value={top.avg_relevancy}
              color={METRIC_COLORS.relevancy}
              icon={CheckCircle}
            />
            <MetricCard
              label="Precision"
              value={top.avg_precision}
              color={METRIC_COLORS.precision}
              icon={CheckCircle}
            />
            <MetricCard
              label="Recall"
              value={top.avg_recall}
              color={METRIC_COLORS.recall}
              icon={CheckCircle}
            />
          </div>
        </div>
      )}

      {/* Bar chart comparison */}
      {barData.length > 1 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Strategy Comparison (%)
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Faithfulness" fill={METRIC_COLORS.faithfulness} radius={[2, 2, 0, 0]} />
                <Bar dataKey="Relevancy" fill={METRIC_COLORS.relevancy} radius={[2, 2, 0, 0]} />
                <Bar dataKey="Precision" fill={METRIC_COLORS.precision} radius={[2, 2, 0, 0]} />
                <Bar dataKey="Recall" fill={METRIC_COLORS.recall} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Radar chart for top strategy */}
      {radarData.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Top Strategy Radar
          </h3>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12 }} />
                <Radar
                  name={STRATEGY_LABELS[top?.strategy] || "Strategy"}
                  dataKey="value"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.25}
                />
                <Tooltip formatter={(v: number) => `${v}%`} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Failed questions */}
      {failedQuestions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-500" />
            Failure Analysis ({failedQuestions.length} below 50%)
          </h3>
          <div className="space-y-2">
            {failedQuestions.map((r) => (
              <div key={r.id} className="rounded-lg border border-red-100 bg-red-50 p-3">
                <div className="flex items-start justify-between">
                  <p className="text-sm text-gray-700 font-medium">{r.question}</p>
                  <span className="text-sm font-bold text-red-600 ml-3 flex-shrink-0">
                    {Math.round(r.metrics.average * 100)}%
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{r.generated_answer}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-question results table */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">All Results</h3>
        <div className="overflow-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-500">Question</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-500">Strategy</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-500">Faith.</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-500">Relev.</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-500">Prec.</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-500">Recall</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-500">Avg</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {per_question_results.map((r) => (
                <tr key={r.id} className={r.metrics.average >= 0.7 ? "bg-white" : "bg-red-50"}>
                  <td className="px-3 py-2 text-gray-700 max-w-xs truncate">{r.question}</td>
                  <td className="px-3 py-2 text-center text-gray-500">
                    {STRATEGY_LABELS[r.strategy] || r.strategy}
                  </td>
                  {[r.metrics.faithfulness, r.metrics.answer_relevancy, r.metrics.context_precision, r.metrics.context_recall, r.metrics.average].map(
                    (v, i) => (
                      <td key={i} className={`px-3 py-2 text-center font-medium ${
                        v >= 0.7 ? "text-green-600" : v >= 0.5 ? "text-yellow-600" : "text-red-600"
                      }`}>
                        {Math.round(v * 100)}%
                      </td>
                    )
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}