export type SourceMatch = {
  id: string;
  metadata?: Record<string, unknown>;
};

export type RankedCandidate = {
  index?: number;
  score?: number;
  text?: string;
  candidate?: string;
};

export type Evidence = {
  assetId: string;
  title: string;
  excerpt: string;
  relevance: number;
};

export function chooseDeliveryEvidence(
  matches: SourceMatch[],
  reranked: RankedCandidate[],
  limit = 3,
): Evidence[] {
  const candidates = matches.flatMap((match) => {
    const text = match.metadata?.text;
    const title = match.metadata?.title;
    const assetId = match.metadata?.asset_id;
    return typeof text === "string" && typeof title === "string" && typeof assetId === "string"
      ? [{ text, title, assetId }]
      : [];
  });

  return reranked.flatMap((ranked, rank) => {
    const index = ranked.index ?? candidates.findIndex((item) => item.text === (ranked.text ?? ranked.candidate));
    const source = candidates[index];
    if (!source) return [];
    return [{
      assetId: source.assetId,
      title: source.title,
      excerpt: source.text,
      relevance: ranked.score ?? Math.max(0, 1 - rank * 0.1),
    }];
  }).slice(0, limit);
}
