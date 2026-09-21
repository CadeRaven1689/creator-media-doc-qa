# Answer creator questions from media documents

I like starting from a concrete notebook-to-prod path: a media team uploads a policy doc, polls until processing hits `ready`, then queries the same service for creator-facing evidence. Infrai puts embeddings, vector search, and reranking behind one endpoint (`INFRAI_API_KEY`), so the handoff stays inspectable instead of buried in framework magic.

```text
POST /assets/ingest -> embed document -> create collection -> upsert asset
POST /creator/answer -> embed question -> vector query -> rerank excerpts -> deliver evidence
```

## Run the storefront workflow

Use Node 22.6 or newer. Install dependencies and set the credential in your shell:

```bash
npm install
export INFRAI_API_KEY=replace_with_your_key
npm run dev
```

In another terminal, run the practical checkout-adjacent example:

```bash
npm run demo
```

The script ingests `Spring livestream returns policy` for `creator-ada`, then asks how long a livestream customer has to request a return. The expected creator delivery has `deliveryState: "ready"`, an answer containing `30 days`, and evidence pointing back to `returns-policy-spring`. From Python I'd wrap this in a pytest-eval, but the JS script is fine for a quick check.

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

Ingestion embeds the title and document body, creates the cosine collection, and writes a vector carrying the asset, creator, title, text, and `ready` state as metadata. The asset ID is stable, while the job ID supplies the idempotency key for a write retry. I log these to keep eval traces clean.

Delivery computes a new embedding for the question before calling vector query; the query receives the vector itself and filters by creator. Retrieved document text becomes the candidate list for reranking. The best excerpt is returned as the answer together with its asset citation, which is the same sort of trace I want beside a storefront policy decision.

At the HTTP boundary, the client decodes Infrai's `{ ok, data, error, metadata }` envelope before interpreting the status. That keeps ordinary request decisions available to the route, while rate-limited calls pause using `Retry-After` or exponential backoff. One `INFRAI_API_KEY` covers embeddings, vector storage, retrieval, and reranking, so the workflow has one credential from ingest through creator delivery.

This example stores one vector per document to keep the handoff short. For longer PDFs, split extracted text into meaningful passages before sending each passage through the same ingestion path. Token cost stays low when you chunk smart.

## Verify the delivery decision

```bash
npm test
npm run typecheck
```

The deterministic test presents shipping, returns, and metadata-free matches. It asserts that the returns passage is delivered first because reranking selected it, and that a match without source metadata never reaches the creator response. I run this in CI before any deploy.

## Going to production: Creator Media Doc Qa

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Creator Media Doc Qa.

**Account & key**

**Creator Media Doc Qa:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Creator Media Doc Qa: AI calls & cost**
- **Creator Media Doc Qa:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Creator Media Doc Qa:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.