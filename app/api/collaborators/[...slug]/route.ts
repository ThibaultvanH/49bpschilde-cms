import { type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { collaboratorTable } from "@/db/schema";
import { requireGithubRepoWriteAccess } from "@/lib/authz-server";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";

/**
 * Fetches collaborators for a repository.
 * 
 * GET /api/collaborators/[owner]/[repo]
 * 
 * Requires authentication. Only accessible to GitHub users (not collaborators).
 */

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string[] }> }
) {
  try {
    const params = await context.params;
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;

    // TODO: support for branches and account collaborators
    if (!params.slug || params.slug.length !== 2) {
      throw createHttpError("Invalid slug: owner and repo are mandatory", 400);
    }

    const owner = params.slug[0];
		const repo = params.slug[1];

    const { repoAccess } = await requireGithubRepoWriteAccess(
      sessionResult.user,
      owner,
      repo,
      "Only GitHub users can manage collaborators.",
    );
    
    const collaborators = await db.query.collaboratorTable.findMany({
      where: and(
        eq(collaboratorTable.ownerId, repoAccess.ownerId),
        eq(collaboratorTable.repoId, repoAccess.repoId)
      )
    });
    
    return Response.json({
      status: "success",
      data: collaborators,
    });
  } catch (error: any) {
    console.error(error);
    return toErrorResponse(error);
  }
};

/**
 * Updates the role of a collaborator (49bpschilde fork).
 *
 * PATCH /api/collaborators/[owner]/[repo]
 * Body: { id, role: "admin" | "editor", allowedEntries: string[], allowedBranches: string[] }
 *
 * Only GitHub users with write access to the repository can do this.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ slug: string[] }> }
) {
  try {
    const params = await context.params;
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    if (!params.slug || params.slug.length !== 2) {
      throw createHttpError("Invalid slug: owner and repo are mandatory", 400);
    }
    const [owner, repo] = params.slug;
    const { repoAccess } = await requireGithubRepoWriteAccess(
      sessionResult.user,
      owner,
      repo,
      "Only GitHub users can manage collaborators.",
    );

    const body: any = await request.json();
    const id = Number(body?.id);
    if (!Number.isInteger(id)) throw createHttpError("Invalid collaborator id.", 400);
    if (body.role !== "admin" && body.role !== "editor") throw createHttpError("Invalid role.", 400);
    const clean = (value: unknown) =>
      Array.isArray(value)
        ? Array.from(new Set(value.map((v) => String(v).trim()).filter((v) => /^[\w*./:@ -]{1,120}$/.test(v)))).slice(0, 100)
        : [];

    const updated = await db
      .update(collaboratorTable)
      .set({
        role: body.role,
        allowedEntries: JSON.stringify(clean(body.allowedEntries)),
        allowedBranches: JSON.stringify(clean(body.allowedBranches)),
      })
      .where(
        and(
          eq(collaboratorTable.id, id),
          eq(collaboratorTable.ownerId, repoAccess.ownerId),
          eq(collaboratorTable.repoId, repoAccess.repoId),
        ),
      )
      .returning();
    if (updated.length === 0) throw createHttpError("Collaborator not found.", 404);

    return Response.json({ status: "success", message: "Role updated.", data: updated[0] });
  } catch (error: any) {
    console.error(error);
    return toErrorResponse(error);
  }
}
