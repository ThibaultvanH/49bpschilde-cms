/**
 * Role-based access (49bpschilde fork).
 *
 * - GitHub users with access to the repository are admins: no restriction.
 * - Collaborators (invited by e-mail) are admins or editors. An editor only sees and may
 *   change the content entries listed in `allowedEntries`, and only on `allowedBranches`.
 *   Both lists are JSON arrays; ["*"] means everything; missing means nothing (fail closed).
 * The config is filtered *before* it reaches the menu or any API route, so what is not allowed
 * is neither shown nor reachable (not found), even if someone guesses the URL.
 */
import { cache } from "react";
import { db } from "@/db";
import { createHttpError } from "@/lib/api-error";
import { collaboratorMatchesUserForRepo } from "@/lib/collaborator-access";
import { getConfig } from "@/lib/config-store";
import { getToken } from "@/lib/token";
import type { Config } from "@/types/config";
import { ADMIN, applyPolicy, parseList, type AccessPolicy } from "@/lib/access-filter";
import type { User } from "@/types/user";

const getAccessPolicy = cache(async (user: User, owner: string, repo: string): Promise<AccessPolicy> => {
  const { source } = await getToken(user, owner, repo);
  if (source === "user") return ADMIN;

  const row = await db.query.collaboratorTable.findFirst({
    where: collaboratorMatchesUserForRepo(user, owner, repo),
  });
  if (!row) throw createHttpError(`You do not have permission to access "${owner}/${repo}".`, 403);
  if (row.role === "admin") return ADMIN;
  return {
    role: "editor",
    entries: parseList(row.allowedEntries),
    branches: parseList(row.allowedBranches),
  };
});

/** Drop-in replacement for getConfig() that enforces the user's role. */
const getAccessConfig = async (
  user: User,
  owner: string,
  repo: string,
  branch: string,
  options: Parameters<typeof getConfig>[3],
): Promise<Config | null> => {
  const policy = await getAccessPolicy(user, owner, repo);
  const config = await getConfig(owner, repo, branch, options);
  if (!config) return config;
  return applyPolicy(config, policy, decodeURIComponent(branch));
};

/** Throws unless the user is an admin (GitHub user or admin collaborator). */
const requireAdmin = async (user: User, owner: string, repo: string) => {
  const policy = await getAccessPolicy(user, owner, repo);
  if (policy.role !== "admin") throw createHttpError("Only admins can do this.", 403);
};

export { getAccessConfig, getAccessPolicy, requireAdmin };
