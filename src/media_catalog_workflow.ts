import { randomUUID } from "node:crypto";
import { z } from "zod";
import { InfraiMediaClient } from "./infrai_media_client.ts";
import { chooseDeliveryEvidence } from "./delivery_policy.ts";

export const ingestRequestSchema = z.object({
  assetId: z.string().min(1),
  creatorId: z.string().min(1),
  title: z.string().min(1),
  documentText: z.string().min(20),
});

export const questionRequestSchema = z.object({
  creatorId: z.string().min(1),
  question: z.string().min(3),
});

export type IngestRequest = z.infer<typeof ingestRequestSchema>;
export type QuestionRequest = z.infer<typeof questionRequestSchema>;

export class MediaCatalogWorkflow {
  private readonly client: InfraiMediaClient;
  private readonly collection: string;

  constructor(
    client: InfraiMediaClient,
    collection = "creator-media-docs",
  ) {
    this.client = client;
    this.collection = collection;
  }

  async ingest(input: IngestRequest) {
    const jobId = randomUUID();
    const embedding = await this.client.embed(`${input.title}\n\n${input.documentText}`);
    await this.client.createCollection(this.collection, embedding.length);
    await this.client.upsert(this.collection, [{
      id: input.assetId,
      values: embedding,
      metadata: {
        asset_id: input.assetId,
        creator_id: input.creatorId,
        title: input.title,
        text: input.documentText,
        processing_state: "ready",
      },
    }], jobId);

    return { jobId, assetId: input.assetId, processingState: "ready" as const };
  }

  async answer(input: QuestionRequest) {
    const embedding = await this.client.embed(input.question);
    const { matches } = await this.client.query(this.collection, embedding, input.creatorId, 8);
    const candidates = matches.flatMap((match) =>
      typeof match.metadata?.text === "string" ? [match.metadata.text] : [],
    );
    if (candidates.length === 0) {
      return { deliveryState: "needs_documents" as const, answer: null, evidence: [] };
    }

    const { results } = await this.client.rerank(input.question, candidates, 3);
    const evidence = chooseDeliveryEvidence(matches, results);
    if (evidence.length === 0) {
      return { deliveryState: "needs_documents" as const, answer: null, evidence: [] };
    }
    return {
      deliveryState: "ready" as const,
      answer: evidence[0].excerpt,
      evidence,
    };
  }
}
