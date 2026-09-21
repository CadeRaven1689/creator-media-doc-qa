import { createServer, type ServerResponse } from "node:http";
import { ZodError, type ZodType } from "zod";
import { InfraiError, InfraiMediaClient } from "./infrai_media_client.ts";
import {
  ingestRequestSchema,
  MediaCatalogWorkflow,
  questionRequestSchema,
} from "./media_catalog_workflow.ts";

const workflow = new MediaCatalogWorkflow(new InfraiMediaClient());

function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readBody<T>(request: AsyncIterable<Uint8Array>, schema: ZodType<T>): Promise<T> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return schema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/assets/ingest") {
      const body = await readBody(request, ingestRequestSchema);
      send(response, 202, await workflow.ingest(body));
      return;
    }
    if (request.method === "POST" && request.url === "/creator/answer") {
      const body = await readBody(request, questionRequestSchema);
      send(response, 200, await workflow.answer(body));
      return;
    }
    send(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      send(response, 400, { error: "Invalid request body" });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      send(response, status, { error: error.message, code: error.code });
      return;
    }
    send(response, 500, { error: "Request could not be completed" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Creator delivery service listening on http://localhost:${port}`));
