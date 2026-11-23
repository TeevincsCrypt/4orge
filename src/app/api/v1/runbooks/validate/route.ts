import { z } from "zod";
import { parseRunbookText, validateRunbook } from "@/lib/runbook/validate";
import { apiRoute } from "@/lib/server/api";
import { json, readJson } from "@/lib/server/http";

/** Validate a Runbook (JSON object, or JSON/YAML text) without saving it. */
export const POST = apiRoute(async (req) => {
  const body = await readJson(req, z.object({ definition: z.unknown().optional(), text: z.string().max(200_000).optional() }));
  let value = body.definition;
  if (body.text !== undefined) {
    const parsed = parseRunbookText(body.text);
    if (!parsed.ok) return json({ ok: false, errors: [{ path: "(document)", message: parsed.error }] });
    value = parsed.value;
  }
  return json(validateRunbook(value));
});
