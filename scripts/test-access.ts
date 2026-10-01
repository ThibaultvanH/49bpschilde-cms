// Unit test of the role filter: npx tsx scripts/test-access.ts
import { ADMIN, applyPolicy, parseList, type AccessPolicy } from "../lib/access-filter";

const config: any = {
  owner: "o", repo: "r", branch: "staging", sha: "x", version: "3.0",
  object: {
    content: [
      { name: "louveteaux", type: "file", path: "a" }, { name: "lutins", type: "file", path: "b" },
      { name: "scouts", type: "file", path: "c" }, { name: "roles", type: "file", path: "roles.yml" },
      { name: "actualites", type: "collection", path: "n" },
    ],
    media: [{ name: "images" }],
    actions: [{ name: "deploy" }],
    navigation: { content: [
      { type: "group", name: "g49", items: [{ type: "file", name: "louveteaux" }, { type: "file", name: "scouts" }] },
      { type: "group", name: "gn", items: [{ type: "file", name: "lutins" }] },
      { type: "file", name: "roles" }, { type: "collection", name: "actualites" },
    ] },
  },
};
let failed = 0;
const check = (label: string, ok: boolean) => { console.log(`${ok ? "✔" : "✖"} ${label}`); if (!ok) failed++; };
const names = (c: any) => c.object.content.map((e: any) => e.name).sort().join(",");
const navNames = (nodes: any[]): string[] => nodes.flatMap((n) => (n.items ? navNames(n.items) : [n.name]));
const editor = (entries: string[] | null, branches: string[] | null): AccessPolicy => ({ role: "editor", entries, branches });

check("admin ziet alles", names(applyPolicy(config, ADMIN, "main")) === "actualites,louveteaux,lutins,roles,scouts");
let r = applyPolicy(config, editor(["lutins", "actualites"], ["staging"]), "staging");
check("takchef Lutins ziet enkel lutins + actualités", names(r) === "actualites,lutins");
check("menu bevat enkel toegelaten items", navNames(r.object.navigation.content).sort().join(",") === "actualites,lutins");
check("lege groep verdwijnt uit het menu", r.object.navigation.content.every((n: any) => n.type !== "group" || n.items.length > 0));
check("actions verborgen voor editor", r.object.actions === undefined);
check("media blijft beschikbaar", Array.isArray(r.object.media) && r.object.media.length === 1);
check("originele config niet gewijzigd", config.object.content.length === 5 && config.object.actions);
let blocked = false; try { applyPolicy(config, editor(["lutins"], ["staging"]), "main"); } catch (e: any) { blocked = e.status === 403; }
check("editor op main → 403", blocked);
check("editor met ['*'] ziet alles", names(applyPolicy(config, editor(["*"], ["staging"]), "staging")) === "actualites,louveteaux,lutins,roles,scouts");
check("null = niets (fail closed)", names(applyPolicy(config, editor(null, ["staging"]), "staging")) === "");
check("kapotte JSON = niets", JSON.stringify(parseList("{kapot")) === "[]" && parseList(null) === null);
check("roles.yml niet zichtbaar zonder toelating", !names(applyPolicy(config, editor(["lutins"], ["*"]), "staging")).includes("roles"));
process.exit(failed ? 1 : 0);
