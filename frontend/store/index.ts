/**
 * Global state management with Zustand.
 * Manages: query state, documents, evaluation results, UI state.
 */
import { create } from "zustand";
import {
  QueryResponse,
  CompareResponse,
  DocumentResponse,
  EvaluationResponse,
  BatchEvaluationResponse,
  RetrievalStrategy,
  MetadataFilter,
} from "@/lib/api";

// ─── Query Store ──────────────────────────────────────────────────────────────

interface QueryState {
  query: string;
  strategy: RetrievalStrategy;
  filters: MetadataFilter;
  isLoading: boolean;
  result: QueryResponse | null;
  error: string | null;
  streamingAnswer: string;
  isStreaming: boolean;

  setQuery: (q: string) => void;
  setStrategy: (s: RetrievalStrategy) => void;
  setFilters: (f: MetadataFilter) => void;
  setLoading: (v: boolean) => void;
  setResult: (r: QueryResponse | null) => void;
  setError: (e: string | null) => void;
  appendStreamToken: (token: string) => void;
  resetStream: () => void;
}

export const useQueryStore = create<QueryState>((set) => ({
  query: "",
  strategy: "hybrid_rerank",
  filters: {},
  isLoading: false,
  result: null,
  error: null,
  streamingAnswer: "",
  isStreaming: false,

  setQuery: (q) => set({ query: q }),
  setStrategy: (s) => set({ strategy: s }),
  setFilters: (f) => set({ filters: f }),
  setLoading: (v) => set({ isLoading: v }),
  setResult: (r) => set({ result: r }),
  setError: (e) => set({ error: e }),
  appendStreamToken: (token) =>
    set((state) => ({ streamingAnswer: state.streamingAnswer + token })),
  resetStream: () => set({ streamingAnswer: "", isStreaming: false }),
}));

// ─── Documents Store ──────────────────────────────────────────────────────────

interface DocumentsState {
  documents: DocumentResponse[];
  isLoading: boolean;
  error: string | null;
  selectedDocumentId: string | null;

  setDocuments: (docs: DocumentResponse[]) => void;
  addDocument: (doc: DocumentResponse) => void;
  removeDocument: (id: string) => void;
  updateDocument: (id: string, updates: Partial<DocumentResponse>) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
  setSelectedDocument: (id: string | null) => void;
}

export const useDocumentsStore = create<DocumentsState>((set) => ({
  documents: [],
  isLoading: false,
  error: null,
  selectedDocumentId: null,

  setDocuments: (docs) => set({ documents: docs }),
  addDocument: (doc) =>
    set((state) => ({ documents: [doc, ...state.documents] })),
  removeDocument: (id) =>
    set((state) => ({
      documents: state.documents.filter((d) => d.id !== id),
    })),
  updateDocument: (id, updates) =>
    set((state) => ({
      documents: state.documents.map((d) =>
        d.id === id ? { ...d, ...updates } : d
      ),
    })),
  setLoading: (v) => set({ isLoading: v }),
  setError: (e) => set({ error: e }),
  setSelectedDocument: (id) => set({ selectedDocumentId: id }),
}));

// ─── Compare Store ────────────────────────────────────────────────────────────

interface CompareState {
  query: string;
  strategyA: RetrievalStrategy;
  strategyB: RetrievalStrategy;
  result: CompareResponse | null;
  isLoading: boolean;
  error: string | null;

  setQuery: (q: string) => void;
  setStrategyA: (s: RetrievalStrategy) => void;
  setStrategyB: (s: RetrievalStrategy) => void;
  setResult: (r: CompareResponse | null) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
}

export const useCompareStore = create<CompareState>((set) => ({
  query: "",
  strategyA: "hybrid_rerank",
  strategyB: "basic_vector",
  result: null,
  isLoading: false,
  error: null,

  setQuery: (q) => set({ query: q }),
  setStrategyA: (s) => set({ strategyA: s }),
  setStrategyB: (s) => set({ strategyB: s }),
  setResult: (r) => set({ result: r }),
  setLoading: (v) => set({ isLoading: v }),
  setError: (e) => set({ error: e }),
}));

// ─── Evaluation Store ─────────────────────────────────────────────────────────

interface EvalState {
  results: EvaluationResponse[];
  batchResult: BatchEvaluationResponse | null;
  isLoading: boolean;
  error: string | null;

  setResults: (r: EvaluationResponse[]) => void;
  addResult: (r: EvaluationResponse) => void;
  setBatchResult: (r: BatchEvaluationResponse | null) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
}

export const useEvalStore = create<EvalState>((set) => ({
  results: [],
  batchResult: null,
  isLoading: false,
  error: null,

  setResults: (r) => set({ results: r }),
  addResult: (r) => set((state) => ({ results: [r, ...state.results] })),
  setBatchResult: (r) => set({ batchResult: r }),
  setLoading: (v) => set({ isLoading: v }),
  setError: (e) => set({ error: e }),
}));