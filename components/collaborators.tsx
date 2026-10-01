"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useActionState } from "react";
import {
  handleAddCollaborator,
  handleRemoveCollaborator,
  handleResendCollaboratorInvite,
} from "@/lib/actions/collaborator";
import { useRepoHeader } from "@/components/repo/repo-header-context";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { requireApiSuccess } from "@/lib/api-client";
import { useConfig } from "@/contexts/config-context";
import { toast } from "sonner";
import { BookText, EllipsisVertical, Loader } from "lucide-react";

type Collaborator = {
  id: number;
  email: string;
  role?: string;
  allowedEntries?: string | null;
  allowedBranches?: string | null;
};

const readList = (value?: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

// Dialog to set a collaborator's role: admin (everything) or editor (chosen entries + branches).
function RoleDialog({
  owner,
  repo,
  collaborator,
  entries,
  onClose,
  onSaved,
}: {
  owner: string;
  repo: string;
  collaborator: Collaborator | null;
  entries: { name: string; label: string }[];
  onClose: () => void;
  onSaved: (updated: Collaborator) => void;
}) {
  const [role, setRole] = useState<"admin" | "editor">("editor");
  const [selected, setSelected] = useState<string[]>([]);
  const [branches, setBranches] = useState("staging");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!collaborator) return;
    setRole(collaborator.role === "admin" ? "admin" : "editor");
    const stored = readList(collaborator.allowedEntries);
    setSelected(stored.includes("*") ? entries.map((e) => e.name) : stored);
    const storedBranches = readList(collaborator.allowedBranches);
    setBranches(storedBranches.length > 0 ? storedBranches.join(", ") : "staging");
  }, [collaborator, entries]);

  const toggle = (name: string) =>
    setSelected((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));

  const save = async () => {
    if (!collaborator) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/collaborators/${owner}/${repo}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: collaborator.id,
          role,
          allowedEntries: selected,
          allowedBranches: branches.split(/[\n,]+/).map((b) => b.trim()).filter(Boolean),
        }),
      });
      const data = await requireApiSuccess<{ data: Collaborator; message?: string }>(response, "Failed to update role");
      onSaved(data.data);
      toast.success(`Role of ${collaborator.email} updated.`);
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(collaborator)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Role of {collaborator?.email}</DialogTitle>
          <DialogDescription>
            Admins can do everything. Editors only see and edit what you tick below, and only on the listed branches.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="flex gap-4">
            {(["editor", "admin"] as const).map((r) => (
              <label key={r} className="flex items-center gap-2">
                <input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} />
                {r === "admin" ? "Admin (everything)" : "Editor (limited)"}
              </label>
            ))}
          </div>
          {role === "editor" ? (
            <>
              <div>
                <div className="font-medium mb-2">Allowed content</div>
                <div className="max-h-56 overflow-y-auto space-y-1 border rounded-md p-2">
                  {entries.map((entry) => (
                    <label key={entry.name} className="flex items-center gap-2">
                      <input type="checkbox" checked={selected.includes(entry.name)} onChange={() => toggle(entry.name)} />
                      {entry.label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div className="font-medium mb-2">Allowed branches (comma separated)</div>
                <input
                  className="w-full border rounded-md px-2 py-1"
                  value={branches}
                  onChange={(e) => setBranches(e.target.value)}
                  placeholder="staging"
                />
              </div>
            </>
          ) : null}
        </div>
        <DialogFooter>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type AddCollaboratorState = {
  message?: string;
  error?: string;
  errors?: string[];
  data?: Collaborator[];
};

function InviteCollaboratorsDialog({
  owner,
  repo,
  state,
  action,
  open,
  onOpenChange,
  value,
  onValueChange,
  disabled,
  triggerLabel,
  triggerVariant = "outline",
  triggerSize = "default",
}: {
  owner: string;
  repo: string;
  state: AddCollaboratorState;
  action: (payload: FormData) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onValueChange: (value: string) => void;
  disabled: boolean;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline";
  triggerSize?: "default" | "sm";
}) {
  const parsedInviteEmails = useMemo(() => {
    return Array.from(
      new Set(
        value
          .split(/[\n,]+/)
          .map((email) => email.trim())
          .filter(Boolean),
      ),
    );
  }, [value]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize} disabled={disabled}>
          {triggerLabel || "Invite"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite collaborators</DialogTitle>
          <DialogDescription>
            Enter one or multiple email addresses, separated by commas or new
            lines.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="owner" value={owner} />
          <input type="hidden" name="repo" value={repo} />
          <Textarea
            name="emails"
            placeholder="alice@example.com, bob@example.com"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            required
            rows={6}
          />
          {state?.error ? (
            <p className="text-sm font-medium text-destructive">
              {state.error}
            </p>
          ) : null}
          <DialogFooter>
            <SubmitButton
              type="submit"
              disabled={parsedInviteEmails.length === 0}
            >
              Send invite{parsedInviteEmails.length > 1 ? "s" : ""}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function Collaborators({
  owner,
  repo,
  branch,
}: {
  owner: string;
  repo: string;
  branch?: string;
}) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [addCollaboratorState, addCollaboratorAction] = useActionState<
    AddCollaboratorState,
    FormData
  >(handleAddCollaborator, {});
  const [emails, setEmails] = useState("");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [removing, setRemoving] = useState<number[]>([]);
  const [resending, setResending] = useState<number[]>([]);
  const [pendingRemoveId, setPendingRemoveId] = useState<number | null>(null);
  const [roleEditId, setRoleEditId] = useState<number | null>(null);
  const { config } = useConfig();
  const contentEntries = useMemo(
    () =>
      ((config?.object?.content as any[]) ?? [])
        .filter((entry) => entry?.name)
        .map((entry) => ({ name: String(entry.name), label: String(entry.label || entry.name) })),
    [config],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined | null>(null);

  const addNewCollaborator = useCallback((newCollaborators: Collaborator[]) => {
    setCollaborators((prevCollaborators) => {
      const seenIds = new Set(
        prevCollaborators.map((collaborator) => collaborator.id),
      );
      const uniqueCollaborators = newCollaborators.filter(
        (collaborator) => !seenIds.has(collaborator.id),
      );
      return [...prevCollaborators, ...uniqueCollaborators];
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchCollaborators() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/collaborators/${owner}/${repo}`, {
          signal: controller.signal,
        });
        const data = await requireApiSuccess<{
          status: string;
          data: Collaborator[];
          message?: string;
        }>(response, "Failed to fetch collaborators");

        setCollaborators(data.data);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error(err);
        setError(
          err instanceof Error ? err.message : "Failed to fetch collaborators",
        );
      } finally {
        // In React Strict Mode, an aborted first pass can race with the active request.
        // Keep the loading state until the non-aborted request finishes.
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    fetchCollaborators();

    return () => controller.abort();
  }, [owner, repo, branch]);

  useEffect(() => {
    if (addCollaboratorState?.message) {
      if (
        Array.isArray(addCollaboratorState.data) &&
        addCollaboratorState.data.length > 0
      ) {
        addNewCollaborator(addCollaboratorState.data);
      }

      toast.success(addCollaboratorState.message, { duration: 10000 });
      if (
        Array.isArray(addCollaboratorState.errors) &&
        addCollaboratorState.errors.length > 0
      ) {
        toast.error(addCollaboratorState.errors.join("\n"), {
          duration: 10000,
        });
      }
      setEmails("");
      setInviteDialogOpen(false);
    }
  }, [addCollaboratorState, addNewCollaborator]);

  const handleConfirmRemove = async (collaboratorId: number) => {
    setRemoving((prev) => [...prev, collaboratorId]);

    try {
      const removed = await handleRemoveCollaborator(
        collaboratorId,
        owner,
        repo,
      );

      if (removed.error) {
        toast.error(removed.error);
      } else {
        setCollaborators((prev) =>
          prev.filter((collaborator) => collaborator.id !== collaboratorId),
        );
        toast.success(removed.message);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPendingRemoveId(null);
      setRemoving((prev) => prev.filter((id) => id !== collaboratorId));
    }
  };

  const handleResendInvite = async (collaboratorId: number) => {
    setResending((prev) => [...prev, collaboratorId]);

    try {
      const resent = await handleResendCollaboratorInvite(
        collaboratorId,
        owner,
        repo,
      );
      if (resent.error) {
        toast.error(resent.error);
      } else {
        toast.success(resent.message);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setResending((prev) => prev.filter((id) => id !== collaboratorId));
    }
  };

  const headerNode = useMemo(() => {
    const showInviteAction = !isLoading && !error && collaborators.length > 0;

    return (
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="font-semibold text-lg">Collaborators</h1>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
              >
                <Link
                  href="https://pagescms.org/docs/configuration/collaborators/"
                  target="_blank"
                  rel="noreferrer"
                >
                  <BookText />
                  <span className="sr-only">Collaborators docs</span>
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>View docs</TooltipContent>
          </Tooltip>
        </div>
        {showInviteAction ? (
          <InviteCollaboratorsDialog
            owner={owner}
            repo={repo}
            state={addCollaboratorState}
            action={addCollaboratorAction}
            open={inviteDialogOpen}
            onOpenChange={setInviteDialogOpen}
            value={emails}
            onValueChange={setEmails}
            disabled={isLoading}
            triggerVariant="default"
            triggerSize="default"
          />
        ) : null}
      </div>
    );
  }, [
    addCollaboratorAction,
    addCollaboratorState,
    collaborators.length,
    emails,
    error,
    inviteDialogOpen,
    isLoading,
    owner,
    repo,
  ]);

  useRepoHeader({ header: headerNode });

  const loadingSkeleton = useMemo(
    () => (
      <ul>
        {[0, 1, 2].map((index) => (
          <li
            key={index}
            className="flex gap-x-2 items-center border border-b-0 last:border-b first:rounded-t-md last:rounded-b-md px-3 py-2 text-sm"
          >
            <Skeleton className="h-6 w-6 rounded-full" />
            <Skeleton className="h-5 w-24 text-left rounded" />
            <Button
              variant="outline"
              size="icon-xs"
              className="ml-auto"
              disabled
            >
              <EllipsisVertical />
            </Button>
          </li>
        ))}
      </ul>
    ),
    [],
  );

  if (error) {
    return (
      <div className="absolute inset-0 p-4 md:p-6 flex items-center justify-center">
        <Empty className="max-w-[420px] flex-none">
          <EmptyHeader>
            <EmptyTitle>Something went wrong</EmptyTitle>
            <EmptyDescription>
              We couldn&apos;t load the list of collaborators.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const collaboratorToRemove =
    pendingRemoveId === null
      ? null
      : collaborators.find(
          (collaborator) => collaborator.id === pendingRemoveId,
        ) || null;

  return (
    <div className="h-full flex flex-col gap-4">
      {isLoading ? (
        loadingSkeleton
      ) : collaborators.length > 0 ? (
        <>
          <ul>
            {collaborators.map((collaborator) => (
              <li
                key={collaborator.id}
                className="flex gap-x-2 items-center border border-b-0 last:border-b first:rounded-t-md last:rounded-b-md px-3 py-2 text-sm"
              >
                <Avatar className="h-6 w-6">
                  <AvatarImage
                    src={`https://unavatar.io/${collaborator.email}?fallback=false`}
                    alt={`${collaborator.email}'s avatar`}
                  />
                  <AvatarFallback className="font-medium text-muted-foreground uppercase text-xs">
                    {collaborator.email.split("@")[0].substring(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div className="font-medium text-left truncate">
                  {collaborator.email}
                </div>
                <span className="text-xs rounded-full border px-2 py-0.5 text-muted-foreground whitespace-nowrap">
                  {collaborator.role === "admin"
                    ? "Admin"
                    : (() => {
                        const n = readList(collaborator.allowedEntries);
                        return n.includes("*") ? "Editor · all content" : `Editor · ${n.length} item${n.length === 1 ? "" : "s"}`;
                      })()}
                </span>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon-xs"
                      variant="outline"
                      className="ml-auto"
                      disabled={
                        removing.includes(collaborator.id) ||
                        resending.includes(collaborator.id)
                      }
                    >
                      {removing.includes(collaborator.id) ||
                      resending.includes(collaborator.id) ? (
                        <Loader className="animate-spin" />
                      ) : (
                        <EllipsisVertical />
                      )}
                      <span className="sr-only">Collaborator actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setRoleEditId(collaborator.id)}>
                      Edit role…
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => void handleResendInvite(collaborator.id)}
                      disabled={
                        removing.includes(collaborator.id) ||
                        resending.includes(collaborator.id)
                      }
                    >
                      Resend invitation
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setPendingRemoveId(collaborator.id)}
                      disabled={
                        removing.includes(collaborator.id) ||
                        resending.includes(collaborator.id)
                      }
                    >
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>

          <RoleDialog
            owner={owner}
            repo={repo}
            collaborator={collaborators.find((c) => c.id === roleEditId) || null}
            entries={contentEntries}
            onClose={() => setRoleEditId(null)}
            onSaved={(updated) =>
              setCollaborators((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)))
            }
          />

          <AlertDialog
            open={Boolean(collaboratorToRemove)}
            onOpenChange={(open) => {
              if (!open) setPendingRemoveId(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove access to &quot;{owner}/{repo}&quot; for
                  &quot;{collaboratorToRemove?.email}&quot;.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (!collaboratorToRemove) return;
                    void handleConfirmRemove(collaboratorToRemove.id);
                  }}
                >
                  Remove collaborator
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : (
        <div className="flex-1 flex items-center">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No collaborators</EmptyTitle>
              <EmptyDescription>
                Invite collaborators to give them access to this repository.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <InviteCollaboratorsDialog
                owner={owner}
                repo={repo}
                state={addCollaboratorState}
                action={addCollaboratorAction}
                open={inviteDialogOpen}
                onOpenChange={setInviteDialogOpen}
                value={emails}
                onValueChange={setEmails}
                disabled={isLoading}
                triggerLabel="Invite a collaborator"
                triggerVariant="default"
                triggerSize="default"
              />
            </EmptyContent>
          </Empty>
        </div>
      )}
    </div>
  );
}
