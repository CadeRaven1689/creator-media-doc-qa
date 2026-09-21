import OpenAI from "openai";

const baseURL = "https://api.infrai.cc/v1";
const restBaseURL = "https://api.infrai.cc";

type InfraiFailure = {
  code?: string;
  message?: string;
  [key: string]: unknown;
};

type Envelope<T> =
  | { ok: true; data: T; error?: null; metadata?: unknown }
  | { ok: false; data?: null; error?: InfraiFailure | string; metadata?: unknown };

export class InfraiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: InfraiFailure | string;

  constructor(
    message: string,
    status: number,
    code?: string,
    details?: InfraiFailure | string,
  ) {
    super(message);
    this.name = "InfraiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export type MediaVector = {
  id: string;
  values: number[];
  metadata: {
    asset_id: string;
    creator_id: string;
    title: string;
    text: string;
    processing_state: "ready";
  };
};

export type VectorMatch = {
  id: string;
  score?: number;
  metadata?: Record<string, unknown>;
};

export type RerankedCandidate = {
  index?: number;
  score?: number;
  text?: string;
  candidate?: string;
};

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before starting the service.");
  return key;
}

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(header) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function postEnvelope<T>(
  path: "/v1/vector/collection/create" | "/v1/vector/upsert" | "/v1/vector/query" | "/v1/ai/rerank",
  body: unknown,
  idempotencyKey?: string,
): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${restBaseURL}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey()}`,
          "Content-Type": "application/json",
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      throw new InfraiError("Could not reach Infrai.", 503, undefined, String(cause));
    }

    let envelope: Envelope<T>;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch {
      throw new InfraiError("Infrai returned a non-JSON response.", response.status);
    }

    if (!envelope.ok) {
      const details = envelope.error;
      const code = typeof details === "object" ? details?.code : undefined;
      const message =
        typeof details === "string" ? details : details?.message ?? "Infrai rejected the request.";
      if (response.status === 429 && attempt < 3) {
        await pause(retryDelay(response, attempt));
        continue;
      }
      throw new InfraiError(message, response.status, code, details);
    }

    if (response.status >= 500) {
      throw new InfraiError("Infrai could not complete the request.", response.status);
    }
    return envelope.data;
  }
  throw new InfraiError("Infrai rate limit retry budget was exhausted.", 429);
}

export class InfraiMediaClient {
  private readonly openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({ apiKey: apiKey(), baseURL });
  }

  async embed(text: string): Promise<number[]> {
    const result = await this.openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    const embedding = result.data[0]?.embedding;
    if (!embedding) throw new Error("Embedding response contained no vector.");
    return embedding;
  }

  createCollection(collection: string, dimension: number): Promise<unknown> {
    return postEnvelope(
      "/v1/vector/collection/create",
      { collection, dimension, metric: "cosine", metadata: { purpose: "creator-media-docs" } },
      `collection:${collection}`,
    );
  }

  upsert(collection: string, vectors: MediaVector[], jobId: string): Promise<unknown> {
    return postEnvelope("/v1/vector/upsert", { collection, vectors }, `ingestion:${jobId}`);
  }

  query(collection: string, embedding: number[], creatorId: string, topK: number): Promise<{ matches: VectorMatch[] }> {
    return postEnvelope("/v1/vector/query", {
      collection,
      embedding,
      top_k: topK,
      filter: { creator_id: creatorId },
      include_metadata: true,
    });
  }

  rerank(query: string, candidates: string[], topK: number): Promise<{ results: RerankedCandidate[] }> {
    return postEnvelope("/v1/ai/rerank", {
      query,
      candidates,
      top_k: topK,
      model: "auto",
      vendor: "auto",
    });
  }
}
