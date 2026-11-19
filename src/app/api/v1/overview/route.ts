import { apiRoute } from "@/lib/server/api";
import { json } from "@/lib/server/http";

/** Dashboard data — computed from real records only. */
export const GET = apiRoute(async (_req, { store }) => {
  const [projects, deployments, runbooks, executions, builds, testRuns] = await Promise.all([
    store.list("projects", { columns: ["id", "name", "updatedAt", "createdAt"], orderBy: "updatedAt", desc: true }),
    store.list("deployments", { orderBy: "createdAt", desc: true }),
    store.list("runbooks", { columns: ["id", "name", "projectId", "updatedAt", "lastExecutionId"], orderBy: "updatedAt", desc: true }),
    store.list("runbook_executions", {
      orderBy: "createdAt",
      desc: true,
      limit: 50,
      columns: ["id", "runbookId", "runbookName", "projectId", "status", "network", "createdAt", "finishedAt"],
    }),
    store.list("builds", { orderBy: "createdAt", desc: true, limit: 20, columns: ["id", "projectId", "status", "compilerVersion", "createdAt", "contractCount", "errors"] }),
    store.list("test_runs", { orderBy: "createdAt", desc: true, limit: 20, columns: ["id", "projectId", "status", "passed", "failed", "createdAt"] }),
  ]);
  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? "(deleted project)";

  type Activity = { kind: string; id: string; at: string; title: string; status: string; href: string };
  const activity: Activity[] = [
    ...deployments.slice(0, 15).map((d) => ({
      kind: "deployment",
      id: d.id,
      at: d.createdAt,
      title: `Deployed ${d.contractName} · ${projectName(d.projectId)}`,
      status: d.status,
      href: `/deployments/${d.id}`,
    })),
    ...executions.slice(0, 15).map((e) => ({
      kind: "execution",
      id: e.id,
      at: e.createdAt,
      title: `Ran “${e.runbookName}”`,
      status: e.status,
      href: `/runbooks/${e.runbookId}/executions/${e.id}`,
    })),
    ...builds.slice(0, 10).map((b) => ({
      kind: "build",
      id: b.id,
      at: b.createdAt,
      title: `Compiled ${projectName(b.projectId)} (${b.contractCount} contracts)`,
      status: b.status,
      href: `/projects/${b.projectId}?tab=build`,
    })),
    ...testRuns.slice(0, 10).map((t) => ({
      kind: "test",
      id: t.id,
      at: t.createdAt,
      title: `Tested ${projectName(t.projectId)} (${t.passed} passed, ${t.failed} failed)`,
      status: t.status,
      href: `/projects/${t.projectId}?tab=tests`,
    })),
  ]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 12);

  // Raw event timestamps for the last 8 days; the browser buckets them by local day.
  const since = Date.now() - 8 * 86_400_000;
  const [allBuilds, allTests, allExecutions] = await Promise.all([
    store.list("builds", { columns: ["createdAt"] }),
    store.list("test_runs", { columns: ["createdAt"] }),
    store.list("runbook_executions", { columns: ["createdAt"] }),
  ]);
  const recent = (rows: { createdAt: string }[], kind: string) =>
    rows.filter((r) => new Date(r.createdAt).getTime() >= since).map((r) => ({ kind, at: r.createdAt }));
  const timeline = [
    ...recent(allBuilds, "build"),
    ...recent(allTests, "test"),
    ...recent(allExecutions, "execution"),
    ...recent(deployments, "deployment"),
  ];
  const latestTest = testRuns[0] ?? null;

  const active = executions.filter((e) => ["running", "awaiting_confirmation", "awaiting_wallet"].includes(e.status));
  return json({
    stats: {
      projects: projects.length,
      deployments: deployments.length,
      confirmed: deployments.filter((d) => d.status === "confirmed").length,
      failed: deployments.filter((d) => d.status === "failed").length,
      pending: deployments.filter((d) => d.status === "pending").length,
      runbooks: runbooks.length,
      activeExecutions: active.length,
    },
    activeExecutions: active.slice(0, 5),
    recentDeployments: deployments.slice(0, 5).map((d) => ({ ...d, projectName: projectName(d.projectId) })),
    recentProjects: projects.slice(0, 5),
    activity,
    timeline,
    latestTest,
  });
});
