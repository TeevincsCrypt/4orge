import "server-only";
import { validateRunbook } from "@/lib/runbook/validate";
import type { RunbookDefinition } from "@/lib/runbook/schema";
import type { Runbook } from "@/lib/types";
import { HttpError, notFound } from "../http";
import type { DataStore } from "../store/types";

export function assertValidDefinition(input: unknown): { definition: RunbookDefinition; warnings: { path: string; message: string }[] } {
  const result = validateRunbook(input);
  if (!result.ok) throw new HttpError(422, "invalid_runbook", "The Runbook definition is invalid.", result.errors);
  return { definition: result.definition, warnings: result.warnings };
}

export async function getRunbook(store: DataStore, id: string): Promise<Runbook> {
  const r = await store.get("runbooks", id);
  if (!r) throw notFound("Runbook");
  return r;
}

/** Keep the normalised runbook_steps table in sync with the JSON definition. */
export async function syncRunbookSteps(store: DataStore, runbook: Runbook) {
  await store.remove("runbook_steps", { runbookId: runbook.id });
  await store.insertMany(
    "runbook_steps",
    runbook.definition.steps.map((s, position) => ({
      runbookId: runbook.id,
      position,
      stepKey: s.id,
      uses: s.uses,
      config: (s.with ?? {}) as Record<string, unknown>,
    })),
  );
}

export async function saveRunbook(
  store: DataStore,
  input: { id?: string; projectId: string; definition: unknown },
): Promise<{ runbook: Runbook; warnings: { path: string; message: string }[] }> {
  const { definition, warnings } = assertValidDefinition(input.definition);
  const project = await store.get("projects", input.projectId);
  if (!project) throw notFound("Project");
  let runbook: Runbook;
  if (input.id) {
    await getRunbook(store, input.id);
    runbook = await store.update("runbooks", input.id, {
      projectId: project.id,
      name: definition.name,
      description: definition.description,
      definition,
    });
  } else {
    runbook = await store.insert("runbooks", {
      projectId: project.id,
      name: definition.name,
      description: definition.description,
      definition,
      lastExecutionId: null,
    });
  }
  await syncRunbookSteps(store, runbook);
  return { runbook, warnings };
}
