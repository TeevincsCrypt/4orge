import { apiRoute } from "@/lib/server/api";
import { currentGithubSession, downloadRepoFiles, resolveCommit } from "@/lib/server/github";
import { badRequest, json } from "@/lib/server/http";
import { getProject, writeProjectFiles } from "@/lib/server/services/projects";

export const maxDuration = 120;

/** Pull the latest commit of the tracked branch and replace the project's files. */
export const POST = apiRoute<{ id: string }>(async (_req, { store }, { id }) => {
  const project = await getProject(store, id);
  const [repo] = await store.list("project_repositories", { where: { projectId: id }, limit: 1 });
  if (!repo) throw badRequest("This project is not linked to a GitHub repository.");
  const token = (await currentGithubSession())?.token ?? null;
  const sha = await resolveCommit(repo.owner, repo.repo, repo.ref, token);
  if (sha === repo.commitSha) {
    await store.update("project_repositories", repo.id, { lastSyncedAt: new Date().toISOString() });
    return json({ changed: false, commitSha: sha, result: null });
  }
  const { files, skipped } = await downloadRepoFiles(repo.owner, repo.repo, sha, token);
  const result = await writeProjectFiles(store, project, files, { replace: true, redetectCompiler: true });
  await store.update("project_repositories", repo.id, { commitSha: sha, lastSyncedAt: new Date().toISOString() });
  return json({ changed: true, previousCommit: repo.commitSha, commitSha: sha, result: { ...result, skipped: [...result.skipped, ...skipped] } });
});
