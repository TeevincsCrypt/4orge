import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { cookies } from "next/headers";
import * as tar from "tar";
import { acceptProjectFile } from "@/lib/project/paths";
import { getConfig } from "./config";
import { HttpError } from "./http";

/**
 * GitHub repository import.
 *
 * Authentication uses the GitHub OAuth web flow (server-side code exchange).
 * The resulting token is encrypted with AES-256-GCM (key derived from
 * FORGE_SESSION_SECRET) and stored in an httpOnly, SameSite=Lax cookie — it
 * is never sent to browser JavaScript, logged, or written to the database.
 * Public repositories can be imported without connecting GitHub.
 */

export const GH_COOKIE = "forge_gh";
const API = "https://api.github.com";

function key(): Buffer {
  const secret = getConfig().sessionSecret;
  if (!secret) throw new HttpError(503, "github_not_configured", "FORGE_SESSION_SECRET is not configured.");
  return createHash("sha256").update(`4orge-github:${secret}`).digest();
}

export function sealToken(payload: { token: string; login: string; scope: string }): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64url");
}

export function unsealToken(value: string): { token: string; login: string; scope: string } | null {
  try {
    const raw = Buffer.from(value, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const dec = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
    return JSON.parse(dec.toString("utf8"));
  } catch {
    return null;
  }
}

export async function currentGithubSession() {
  if (!getConfig().github.configured) return null;
  const c = (await cookies()).get(GH_COOKIE)?.value;
  return c ? unsealToken(c) : null;
}

export function parseRepoInput(input: string): { owner: string; repo: string; ref: string | null } | null {
  const s = input.trim();
  const short = s.match(/^([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})$/);
  if (short) return { owner: short[1], repo: short[2].replace(/\.git$/, ""), ref: null };
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/, "");
  if (!/^[A-Za-z0-9-]{1,39}$/.test(owner) || !/^[A-Za-z0-9._-]{1,100}$/.test(repo)) return null;
  const ref = parts[2] === "tree" && parts.length > 3 ? decodeURIComponent(parts.slice(3).join("/")) : null;
  return { owner, repo, ref };
}

async function gh(pathname: string, token: string | null, init: RequestInit = {}) {
  const res = await fetch(`${API}${pathname}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "4orge",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 404) {
    throw new HttpError(
      404,
      "repo_not_found",
      token
        ? "Repository not found, or your GitHub authorization does not include it."
        : "Repository not found. If it is private, connect GitHub first.",
    );
  }
  if (res.status === 401) throw new HttpError(401, "github_unauthorized", "GitHub rejected the authorization. Reconnect GitHub.");
  if (res.status === 403 || res.status === 429) {
    const reset = res.headers.get("x-ratelimit-reset");
    throw new HttpError(
      429,
      "github_rate_limited",
      `GitHub rate limit reached${reset ? ` (resets ${new Date(Number(reset) * 1000).toLocaleTimeString()})` : ""}. Connect GitHub for a higher limit.`,
    );
  }
  if (!res.ok) throw new HttpError(502, "github_error", `GitHub API error (HTTP ${res.status}).`);
  return res;
}

export async function getRepoInfo(owner: string, repo: string, token: string | null) {
  const res = await gh(`/repos/${owner}/${repo}`, token);
  const body = (await res.json()) as { default_branch: string; private: boolean; html_url: string; full_name: string; description: string | null };
  return body;
}

export async function resolveCommit(owner: string, repo: string, ref: string, token: string | null): Promise<string> {
  const res = await gh(`/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`, token, {
    headers: { accept: "application/vnd.github.sha" },
  });
  return (await res.text()).trim();
}

export interface DownloadedFile {
  path: string;
  content: string;
}

/** Download a repository snapshot and keep only files 4ORGE uses. */
export async function downloadRepoFiles(owner: string, repo: string, sha: string, token: string | null) {
  const res = await gh(`/repos/${owner}/${repo}/tarball/${sha}`, token);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > 100 * 1024 * 1024) throw new HttpError(413, "repo_too_large", "Repository archive is larger than 100 MB.");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 100 * 1024 * 1024) throw new HttpError(413, "repo_too_large", "Repository archive is larger than 100 MB.");

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "4orge-gh-"));
  const files: DownloadedFile[] = [];
  const skipped: { path: string; reason: string }[] = [];
  try {
    const tgz = path.join(tmp, "repo.tgz");
    await fs.writeFile(tgz, buf);
    const out = path.join(tmp, "out");
    await fs.mkdir(out);
    await tar.x({
      file: tgz,
      cwd: out,
      strip: 1,
      filter: (p, entry) => {
        const type = (entry as { type?: string }).type;
        if (type && type !== "File" && type !== "OldFile") return false; // no symlinks/devices
        const rel = p.split("/").slice(1).join("/");
        const size = (entry as { size?: number }).size ?? 0;
        const check = acceptProjectFile(rel, size);
        if (!check.ok && rel.endsWith(".sol")) skipped.push({ path: rel, reason: check.reason });
        return check.ok;
      },
    });
    const walk = async (dir: string) => {
      for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) await walk(full);
        else if (ent.isFile()) {
          const rel = path.relative(out, full).split(path.sep).join("/");
          files.push({ path: rel, content: await fs.readFile(full, "utf8") });
        }
      }
    };
    await walk(out);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
  return { files, skipped };
}

export async function listUserRepos(token: string) {
  const res = await gh(`/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member`, token);
  const body = (await res.json()) as { full_name: string; private: boolean; default_branch: string; pushed_at: string; description: string | null; language: string | null }[];
  return body.map((r) => ({
    fullName: r.full_name,
    private: r.private,
    defaultBranch: r.default_branch,
    pushedAt: r.pushed_at,
    description: r.description,
    language: r.language,
  }));
}
