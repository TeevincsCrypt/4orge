import { z } from "zod";
import { apiRoute } from "@/lib/server/api";
import { currentGithubSession, downloadRepoFiles, getRepoInfo, parseRepoInput, resolveCommit } from "@/lib/server/github";
import { badRequest, json, readJson } from "@/lib/server/http";
import { createProject } from "@/lib/server/services/projects";

export const maxDuration = 120;

const schema = z.object({
  repository: z.string().trim().min(3).max(300),
  ref: z.string().trim().max(200).optional(),
  name: z.string().trim().max(120).optional(),
});

/** Import a GitHub repository as a new project (public, or private with GitHub connected). */
export const POST = apiRoute(async (req, { store }) => {
  const body = await readJson(req, schema);
  const parsed = parseRepoInput(body.repository);
  if (!parsed) throw badRequest("Enter a GitHub repository as owner/name or https://github.com/owner/name.");
  const session = await currentGithubSession();
  const token = session?.token ?? null;
  const info = await getRepoInfo(parsed.owner, parsed.repo, token);
  const ref = body.ref || parsed.ref || info.default_branch;
  const sha = await resolveCommit(parsed.owner, parsed.repo, ref, token);
  const { files, skipped } = await downloadRepoFiles(parsed.owner, parsed.repo, sha, token);
  if (!files.some((f) => f.path.endsWith(".sol"))) {
    throw badRequest(`No Solidity files were found in ${info.full_name}@${ref}. 4ORGE supports Hardhat, Foundry and plain Solidity repositories.`);
  }
  const { project, result } = await createProject(store, {
    name: body.name || info.full_name.split("/")[1],
    description: info.description ?? `Imported from ${info.full_name}`,
    source: "github",
    files,
  });
  await store.insert("project_repositories", {
    projectId: project.id,
    provider: "github",
    url: info.html_url,
    owner: parsed.owner,
    repo: parsed.repo,
    ref,
    commitSha: sha,
    isPrivate: info.private,
    lastSyncedAt: new Date().toISOString(),
  });
  return json({ project, files: { ...result, skipped: [...result.skipped, ...skipped] } }, 201);
});
