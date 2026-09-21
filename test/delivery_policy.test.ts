import assert from "node:assert/strict";
import test from "node:test";
import { chooseDeliveryEvidence } from "../src/delivery_policy.ts";

test("creator delivery follows rerank order and ignores metadata-free matches", () => {
  const matches = [
    { id: "shipping", metadata: { asset_id: "shipping", title: "Shipping", text: "Orders leave in two days." } },
    { id: "returns", metadata: { asset_id: "returns", title: "Returns", text: "Livestream returns are accepted for 30 days." } },
    { id: "draft" },
  ];
  const reranked = [
    { index: 1, score: 0.97 },
    { index: 0, score: 0.31 },
    { index: 2, score: 0.1 },
  ];

  assert.deepEqual(chooseDeliveryEvidence(matches, reranked), [
    { assetId: "returns", title: "Returns", excerpt: "Livestream returns are accepted for 30 days.", relevance: 0.97 },
    { assetId: "shipping", title: "Shipping", excerpt: "Orders leave in two days.", relevance: 0.31 },
  ]);
});
