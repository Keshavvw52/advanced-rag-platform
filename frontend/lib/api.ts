const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");
const TOKEN_KEY = "rag_access_token";

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) {
    window.localStorage.setItem(TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(TOKEN_KEY);
  }
}

function authHeaders(headers?: HeadersInit): HeadersInit {
  const token = getStoredToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type RetrievalStrategy =
  | "basic_vector"
  | "hybrid"
  | "hybrid_rerank"
  | "parent_child"
  | "multi_query"
  | "hyde"
  | "decomposition";

export interface MetadataFilter {
  source?: string;
  page_min?: number;
  page_max?: number;
  section?: string;
  tags?: string[];
  chunk_strategy?: string;
  document_ids?: string[];
}

export interface RetrievedChunk {
  chunk_id: string;
  content: string;
  source?: string;
  page_number?: number;
  section_header?: string;
  strategy: string;
  similarity_score?: number;
  bm25_score?: number;
  rerank_score?: number;
  original_rank?: number;
  reranked_rank?: number;
}

export interface PipelineStep {
  step_name: string;
  description: string;
  input?: any;
  output?: any;
  latency_ms?: number;
  metadata: Record<string, any>;
}

export interface PipelineTrace {
  query_id: string;
  original_query: string;
  transformed_queries: string[];
  strategy: string;
  steps: PipelineStep[];
  retrieved_chunks: RetrievedChunk[];
  reranked_chunks: RetrievedChunk[];
  final_context: string;
  prompt_sent: string;
  total_latency_ms: number;
  input_tokens: number;
  output_tokens: number;
}

export interface QueryResponse {
  query_id: string;
  query: string;
  answer: string;
  strategy: string;
  retrieved_chunks: RetrievedChunk[];
  pipeline_trace: PipelineTrace;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
}

export interface CompareResponse {
  query: string;
  result_a: QueryResponse;
  result_b: QueryResponse;
  overlap_chunk_ids: string[];
}

export interface DocumentResponse {
  id: string;
  filename: string;
  original_filename: string;
  file_type: string;
  file_size: number;
  total_pages: number;
  upload_date: string;
  tags: string[];
  status: string;
  chunk_counts: {
    recursive: number;
    semantic: number;
    parent_child: number;
    section: number;
    total: number;
  };
  error_message?: string;
}

export interface EvaluationMetrics {
  faithfulness: number;
  answer_relevancy: number;
  context_precision: number;
  context_recall: number;
  average: number;
}

export interface UserResponse {
  id: string;
  email: string;
  name?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: UserResponse;
}

export interface EvaluationResponse {
  id: string;
  question: string;
  reference_answer: string;
  generated_answer: string;
  strategy: string;
  metrics: EvaluationMetrics;
  retrieved_chunks: RetrievedChunk[];
  details: Record<string, any>;
}

export interface StrategyEvalSummary {
  strategy: string;
  avg_faithfulness: number;
  avg_relevancy: number;
  avg_precision: number;
  avg_recall: number;
  avg_overall: number;
  num_questions: number;
}

export interface BatchEvaluationResponse {
  batch_id: string;
  strategies_evaluated: string[];
  summaries: StrategyEvalSummary[];
  per_question_results: EvaluationResponse[];
  leaderboard: StrategyEvalSummary[];
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: authHeaders({ "Content-Type": "application/json", ...options.headers }),
    ...options,
  });

  if (!res.ok) {
    let error: any = {};
    try {
      error = await res.json();
    } catch {}

    if (res.status === 401) {
      setStoredToken(null);
    }

    throw new Error(
      error?.detail ||
      error?.message ||
      `HTTP ${res.status}`
    );
  }

  return res.json();
}

export const authApi = {
  signup: async (params: {
    email: string;
    password: string;
    name?: string;
  }): Promise<AuthResponse> => {
    const response = await apiFetch<AuthResponse>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(params),
    });
    setStoredToken(response.access_token);
    return response;
  },

  login: async (params: {
    email: string;
    password: string;
  }): Promise<AuthResponse> => {
    const response = await apiFetch<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(params),
    });
    setStoredToken(response.access_token);
    return response;
  },

  me: (): Promise<UserResponse> => apiFetch("/api/auth/me"),

  logout: () => setStoredToken(null),

  token: getStoredToken,
};

// ─── Documents API ────────────────────────────────────────────────────────────

export const documentsApi = {
  upload: async (file: File, tags: string = ""): Promise<any> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("tags", tags);
    const res = await fetch(`${API_BASE}/api/documents/upload`, {
      method: "POST",
      headers: authHeaders(),
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Upload failed");
    }
    return res.json();
  },

  list: (): Promise<DocumentResponse[]> =>
    apiFetch("/api/documents"),

  get: (id: string): Promise<DocumentResponse> =>
    apiFetch(`/api/documents/${id}`),

  getChunks: (id: string, strategy?: string): Promise<any[]> =>
    apiFetch(`/api/documents/${id}/chunks${strategy ? `?strategy=${strategy}` : ""}`),

  delete: (id: string): Promise<any> =>
    apiFetch(`/api/documents/${id}`, { method: "DELETE" }),
};

// ─── Query API ────────────────────────────────────────────────────────────────

export const queryApi = {
  query: (params: {
    query: string;
    strategy: RetrievalStrategy;
    filters?: MetadataFilter;
    top_k?: number;
    semantic_weight?: number;
  }): Promise<QueryResponse> =>
    apiFetch("/api/query", {
      method: "POST",
      body: JSON.stringify(params),
    }),

  compare: (params: {
    query: string;
    strategy_a: RetrievalStrategy;
    strategy_b: RetrievalStrategy;
    filters?: MetadataFilter;
  }): Promise<CompareResponse> =>
    apiFetch("/api/query/compare", {
      method: "POST",
      body: JSON.stringify(params),
    }),

  getPipeline: (queryId: string): Promise<PipelineTrace> =>
    apiFetch(`/api/query/${queryId}/pipeline`),

  getChunks: (queryId: string): Promise<RetrievedChunk[]> =>
    apiFetch(`/api/query/${queryId}/chunks`),

  getStrategies: (): Promise<any> =>
    apiFetch("/api/strategies"),

  streamQuery: (params: {
    query: string;
    strategy: RetrievalStrategy;
    filters?: MetadataFilter;
  }): EventSource => {
    // Note: EventSource doesn't support POST, so we use a workaround
    // In production, use a POST-based SSE library
    const url = new URL(`${API_BASE}/api/query/stream`);
    const token = getStoredToken();
    if (token) {
      url.searchParams.set("token", token);
    }
    return new EventSource(url.toString());
  },
};

// ─── Evaluation API ───────────────────────────────────────────────────────────

export const evaluationApi = {
  evaluate: (params: {
    question: string;
    reference_answer: string;
    strategy: RetrievalStrategy;
  }): Promise<EvaluationResponse> =>
    apiFetch("/api/evaluate", {
      method: "POST",
      body: JSON.stringify(params),
    }),

  batchEvaluate: (params: {
    strategies: RetrievalStrategy[];
  }): Promise<BatchEvaluationResponse> =>
    apiFetch("/api/evaluate/batch", {
      method: "POST",
      body: JSON.stringify(params),
    }),

  getResults: (strategy?: string): Promise<EvaluationResponse[]> =>
    apiFetch(`/api/evaluate/results${strategy ? `?strategy=${strategy}` : ""}`),
};

// ─── Stats API ────────────────────────────────────────────────────────────────

export const statsApi = {
  get: (): Promise<any> => apiFetch("/api/stats"),
  health: (): Promise<any> => apiFetch("/api/health"),
};
