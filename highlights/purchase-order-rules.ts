/**
 * EXCERPT from the private repository (src/doctypes/purchase-order/rules.ts).
 *
 * Purchase-order business rules. Claude extracts the document; this code verifies it.
 * Any 'error' issue routes the order to human review with the exact field or line.
 */
import type { ValidationIssue } from "./document-type-contract";

// Helpers (from src/core/money.ts)
const MONEY_TOLERANCE = 0.02;
const round2 = (n: number) => Math.round(n * 100) / 100;
const moneyDiffers = (a: number, b: number) => Math.abs(round2(a) - round2(b)) > MONEY_TOLERANCE;
const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

// Domain type (abridged)
type PurchaseOrder = {
  po_number: string | null; po_date: string | null; delivery_date: string | null;
  supplier: { name: string | null }; currency: string | null;
  line_items: Array<{ quantity: number | null; unit_price: number | null; line_total: number | null }>;
  subtotal: number | null; discount: number | null; tax_amount: number | null; shipping: number | null; total: number | null;
};

/**
 * Purchase-order business rules. Claude extracts; code verifies.
 * Generic checks (confidence, model warnings) are added by the engine in core/validate.ts.
 */
export function purchaseOrderRules(po: PurchaseOrder): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (code: string, severity: ValidationIssue["severity"], field: string, message: string) =>
    issues.push({ code, severity, field, message });

  // 1. Required fields
  const required: Array<[string, unknown]> = [
    ["po_number", po.po_number],
    ["po_date", po.po_date],
    ["supplier.name", po.supplier.name],
    ["currency", po.currency],
    ["total", po.total],
  ];
  for (const [field, value] of required) {
    if (value === null || value === "") add("MISSING_FIELD", "error", field, `${field} is missing`);
  }
  if (po.line_items.length === 0) add("NO_LINE_ITEMS", "error", "line_items", "No line items found");

  // 2. Dates
  if (po.po_date && !isIsoDate(po.po_date)) {
    add("INVALID_DATE", "error", "po_date", `po_date "${po.po_date}" is not a valid YYYY-MM-DD date`);
  }
  if (po.delivery_date && !isIsoDate(po.delivery_date)) {
    add("INVALID_DATE", "warning", "delivery_date", `delivery_date "${po.delivery_date}" is not a valid date`);
  }
  if (po.po_date && po.delivery_date && isIsoDate(po.po_date) && isIsoDate(po.delivery_date) && po.delivery_date < po.po_date) {
    add("DELIVERY_BEFORE_PO", "warning", "delivery_date", "Delivery date is earlier than PO date");
  }

  // 3. Line arithmetic: quantity x unit_price = line_total
  po.line_items.forEach((line, i) => {
    const f = `line_items[${i}]`;
    if (line.quantity === null || line.unit_price === null) {
      add("LINE_INCOMPLETE", "error", f, `Line ${i + 1} is missing quantity or unit price`);
      return;
    }
    if (line.quantity <= 0) add("LINE_NON_POSITIVE_QTY", "error", f, `Line ${i + 1} has quantity ${line.quantity}`);
    if (line.line_total !== null) {
      const expected = line.quantity * line.unit_price;
      if (moneyDiffers(expected, line.line_total)) {
        add(
          "LINE_TOTAL_MISMATCH",
          "error",
          f,
          `Line ${i + 1}: ${line.quantity} x ${line.unit_price} = ${round2(expected)}, document says ${line.line_total}`,
        );
      }
    }
  });

  // 4. Subtotal = sum of line totals
  const lineSum = po.line_items.reduce((acc, l) => acc + (l.line_total ?? (l.quantity ?? 0) * (l.unit_price ?? 0)), 0);
  if (po.subtotal !== null && po.line_items.length > 0 && moneyDiffers(lineSum, po.subtotal)) {
    add("SUBTOTAL_MISMATCH", "error", "subtotal", `Sum of lines is ${round2(lineSum)}, subtotal says ${po.subtotal}`);
  }

  // 5. Total = subtotal - discount + tax + shipping
  if (po.total !== null) {
    const base = po.subtotal ?? lineSum;
    const expected = base - (po.discount ?? 0) + (po.tax_amount ?? 0) + (po.shipping ?? 0);
    if (moneyDiffers(expected, po.total)) {
      add("TOTAL_MISMATCH", "error", "total", `Expected total ${round2(expected)}, document says ${po.total}`);
    }
  }

  return issues;
}
