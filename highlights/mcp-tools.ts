/**
 * EXCERPT from the private repository (src/mcp/server.ts), abridged.
 *
 * The same engine is exposed as a Model Context Protocol server, so a team can work by talking to
 * Claude Desktop, Claude Code or any MCP client: "process this order", "what's in the review
 * queue?", "reject #12, the customer must reissue it".
 *
 * One process_<type> tool is registered per document type, plus generic tools for any type.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "claude-document-intake", version: "0.2.0" });

for (const type of allDocumentTypes()) {
  server.registerTool(
    `process_${type.id}`,
    {
      title: `Process ${type.label.toLowerCase()}`,
      description:
        `Extract, validate and store a ${type.label.toLowerCase()} from a PDF file or an .eml email with PDF attachments. ` +
        "Returns a summary with status (auto_approved or needs_review) and any validation issues.",
      inputSchema: { file_path: z.string().describe("Path to a .pdf or .eml file") },
    },
    async ({ file_path }) => {
      const records = await pipeline.processFile(resolveInput(file_path), { docType: type.id });
      return text(records.map(renderSummary).join("\n---\n"));
    },
  );
}

server.registerTool(
  "list_documents",
  {
    title: "List documents",
    description: "List processed documents, newest first. Use status=needs_review to see the human review queue.",
    inputSchema: {
      status: z.enum(["auto_approved", "needs_review", "approved", "rejected"]).optional(),
      doc_type: z.string().optional(),
      limit: z.number().int().min(1).max(200).optional(),
    },
  },
  async ({ status, doc_type, limit }) => text(renderBatchSummary(repo.list({ status, docType: doc_type, limit: limit ?? 50 }))),
);

server.registerTool(
  "resolve_review",
  {
    title: "Resolve review",
    description:
      "Record a human reviewer's decision on a document in the needs_review queue. " +
      "Only call this when the user explicitly states the decision; do not decide on their behalf.",
    inputSchema: {
      id: z.number().int(),
      decision: z.enum(["approve", "reject"]),
      note: z.string().describe("Reason for the decision, kept for audit"),
    },
  },
  async ({ id, decision, note }) =>
    text(renderSummary(repo.resolveReview(id, decision === "approve" ? "approved" : "rejected", note))),
);

// Also: list_document_types, get_document

await server.connect(new StdioServerTransport());

// --- declared elsewhere in the private repository ---
declare function allDocumentTypes(): Array<{ id: string; label: string }>;
declare const pipeline: { processFile(path: string, o: { docType: string }): Promise<unknown[]> };
declare const repo: { list(f: object): unknown[]; resolveReview(id: number, d: string, n: string): unknown };
declare function resolveInput(p: string): string;
declare function renderSummary(r: unknown): string;
declare function renderBatchSummary(r: unknown[]): string;
declare function text(t: string): { content: Array<{ type: "text"; text: string }> };
