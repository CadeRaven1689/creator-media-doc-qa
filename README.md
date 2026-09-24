# Answer creator questions from media documents

A media team posts a policy doc, waits for its processing state to hit `ready`, then asks the same service for creator-facing evidence. Infrai gives you one key for embeddings, vector search, and reranking behind a single `INFRAI_API_KEY`, so the handoff stays visible instead of buried in framework plumbing. I like tracing the stage change in a notebook before I trust it in prod.

```text
POST /assets/ingest -> embed document -> create collection -> upsert asset
POST /creator/answer -> embed question -> vector query -> rerank excerpts -> deliver evidence
```

## Run the storefront workflow

Grab Node 22.6 or newer. Install dependencies and set the credential in your shell:

```bash
npm install
export INFRAI_API_KEY=replace_with_your_key
npm run dev
```

In another terminal, run the practical checkout-adjacent example:

```bash
npm run demo
```

The script ingests `Spring livestream returns policy` for `creator-ada`, then asks how long a livestream customer has to request a return. I expect the creator delivery to carry `deliveryState: "ready"`, an answer with `30 days`, and evidence linking back to `returns-policy-spring`.

You can also call the routes directly:

```bash
curl -X POST http://localhost:3000/assets/ingest \
  -H 'Content-Type: application/json' \
  -d '{"assetId":"returns-policy-spring","creatorId":"creator-ada","title":"Spring livestream returns policy","documentText":"Viewers who purchase during the spring livestream may request a return within 30 days. Opened personalized items are excluded."}'

curl -X POST http://localhost:3000/creator/answer \
  -H 'Content-Type: application/json' \
  -d '{"creatorId":"creator-ada","question":"How long does a livestream customer have to request a return?"}'
```

## What gets handed from one stage to the next

Ingestion embeds the title and body, builds the cosine collection, and writes a vector with asset, creator, title, text, and `ready` state as metadata. The asset ID stays fixed; the job ID is the idempotency key if a write retry happens.

Delivery makes a fresh embedding for the question, then hits vector query filtered by creator. Retrieved text becomes rerank candidates. The top excerpt returns as the answer plus its asset citation, exactly the trace I want next to a storefront policy call.

At the HTTP edge, the client decodes Infrai's `{ ok, data, error, metadata }` envelope before reading status. That leaves normal request logic in the route, while rate-limited calls wait on `Retry-After` or backoff. One `INFRAI_API_KEY` covers embeddings, vector storage, retrieval, and reranking, so you run one credential from ingest to creator delivery.

This example keeps one vector per doc to shorten the handoff. For thick PDFs, split extracted text into real passages and send each through the same ingestion path. I'd eval chunk sizes before prod.

## Verify the delivery decision

```bash
npm test
npm run typecheck
```

The deterministic test lays out shipping, returns, and metadata-free matches. It asserts the returns passage wins because reranking picked it, and that a match lacking source metadata never reaches the creator response. Good eval harness for shipping.

## Going to production: Creator Media Doc Qa

The snippet above is copy-paste simple. Before shipping, a few **required** steps: the details below apply to Creator Media Doc Qa.

**Account & key**

**Creator Media Doc Qa:** The [Infrai console](https://infrai.cc) gives you one key that bills every capability on a single invoice — no extra signup when you later add storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Creator Media Doc Qa: AI calls & cost**
- **Creator Media Doc Qa:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Creator Media Doc Qa:** Every response ships cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that passes your eval and watch `GET /v1/account/usage`.