/** Pure access filtering (no database), so it can be unit-tested. See access-policy.ts. */
import { createHttpError } from "@/lib/api-error";
import type { Config } from "@/types/config";

type AccessPolicy = {
  role: "admin" | "editor";
  entries: string[] | null;
  branches: string[] | null;
};

const ADMIN: AccessPolicy = { role: "admin", entries: ["*"], branches: ["*"] };

const parseList = (value: string | null | undefined): string[] | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

const allows = (list: string[] | null, name: string) =>
  !!list && (list.includes("*") || list.includes(name));

const filterNavigation = (nodes: any[] | undefined, policy: AccessPolicy): any[] =>
  (nodes ?? []).flatMap((node) => {
    if (node.type === "group") {
      const items = filterNavigation(node.items, policy);
      return items.length > 0 ? [{ ...node, items }] : [];
    }
    if (node.type === "media") return [node];
    return allows(policy.entries, node.name) ? [node] : [];
  });

const applyPolicy = (config: Config, policy: AccessPolicy, branch: string): Config => {
  if (policy.role === "admin") return config;
  if (!allows(policy.branches, branch)) {
    throw createHttpError(`Your role does not allow editing the branch "${branch}".`, 403);
  }
  const object = { ...config.object };
  if (Array.isArray(object.content)) {
    object.content = object.content.filter((entry: any) => allows(policy.entries, entry.name));
  }
  if (object.navigation?.content) {
    object.navigation = { ...object.navigation, content: filterNavigation(object.navigation.content, policy) };
  }
  // Editors never see the raw settings or actions of the CMS.
  delete object.actions;
  return { ...config, object };
};

export { ADMIN, allows, applyPolicy, filterNavigation, parseList };
export type { AccessPolicy };
