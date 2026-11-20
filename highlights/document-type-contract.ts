/**
 * EXCERPT from the private repository (src/core/types.ts).
 *
 * The engine is generic. Every document kind (purchase order, invoice, delivery note…) is one
 * module implementing this contract. The pipeline, storage, MCP tools and web app only depend on
 * it, so a new document type does not require changes anywhere else.
 */
import type { z } from "zod";

export interface ValidationIssue {
  code: string;
  severity: "error" | "warning";
  /** Path of the offending field, e.g. "total" or "line_items[2]" (highlighted in the UI). */
  field: string;
  message: string;
}

/** Columns indexed for every document type (lists, search, CSV export, duplicates). */
export interface KeyFields {
  reference: string | null;
  counterparty: string | null;
  date: string | null;
  currency: string | null;
  total: number | null;
}

export interface DocumentType<TDoc, TWire> {
  id: string;
  label: string;
  description: string;

  /** How Claude should read this kind of document. */
  systemPrompt: string;
  userInstruction: string;

  /** Schema sent to the Claude API as structured output. */
  wireSchema: z.ZodType<TWire>;
  /** Business-facing schema that is stored and validated. */
  domainSchema: z.ZodType<TDoc>;
  toDomain(wire: TWire): TDoc;

  /** Deterministic business rules: Claude extracts, code verifies. */
  validate(doc: TDoc): ValidationIssue[];

  keyFields(doc: TDoc): KeyFields;
  /** Identifies the same business document received twice. */
  duplicateKey(doc: TDoc): string | null;
  /** Presentation-neutral view rendered by the web app, reports and CSV export. */
  view(doc: TDoc): DocumentView;
}

export interface DocumentView {
  title: string;
  fields: Array<{ label: string; value: string | number | null; path: string }>;
  table?: { title: string; path: string; columns: Array<{ label: string; kind?: "text" | "number" | "money" }>; rows: Array<Array<string | number | null>> };
  totals: Array<{ label: string; value: number | null; path: string; emphasis?: boolean }>;
}
