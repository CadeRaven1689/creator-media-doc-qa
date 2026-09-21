const base = process.env.SERVICE_URL ?? "http://localhost:3000";

async function post(path: string, body: unknown) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(result));
  return result;
}

const asset = await post("/assets/ingest", {
  assetId: "returns-policy-spring",
  creatorId: "creator-ada",
  title: "Spring livestream returns policy",
  documentText: "Viewers who purchase during the spring livestream may request a return within 30 days. Opened personalized items are excluded.",
});
console.log("Ingestion:", asset);

const delivery = await post("/creator/answer", {
  creatorId: "creator-ada",
  question: "How long does a livestream customer have to request a return?",
});
console.log("Creator delivery:", delivery);
