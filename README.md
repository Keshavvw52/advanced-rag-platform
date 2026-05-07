# Advanced RAG Platform

Advanced RAG Platform is a full-stack document retrieval workspace with:

- a FastAPI backend for ingestion, retrieval, reranking, and evaluation
- a Next.js frontend for querying, document management, A/B comparison, and evaluation
- account-based workspaces so each user's documents, queries, and evaluation history stay scoped to their login

## Repo Structure

- `backend/` - FastAPI app, vector store persistence, evaluation pipeline
- `frontend/` - Next.js App Router frontend

## Local Setup

### Backend

1. Create and activate a virtual environment in `backend/`
2. Install dependencies:

```powershell
pip install -r requirements.txt
```

3. Create local env file from the example:

```powershell
Copy-Item .env.example .env
```

4. Start the API:

```powershell
uvicorn app.main:app --reload
```

### Frontend

1. Install dependencies in `frontend/`:

```powershell
npm install
```

2. Create local env file from the example:

```powershell
Copy-Item .env.local.example .env.local
```

3. Start the frontend:

```powershell
npm run dev
```

## Environment Files

- `backend/.env.example` documents the backend settings
- `frontend/.env.local.example` documents the frontend API URL

Do not commit real `.env` or `.env.local` files.
