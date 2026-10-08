"use client";

/**
 * Google Docs-style share dialog: people with access, general access
 * ("restricted" / "anyone with the link") and publish to web.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, Globe, Link2, Lock, Share2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  addPersonApi,
  getPublishStateApi,
  listPeopleApi,
  removePersonApi,
  setGeneralAccessApi,
  setPublishedApi,
  updatePersonRoleApi,
} from "../api/sharing-api";
import { can, KIND_LABEL, RESOURCE_PATH, shareKeys } from "../constants";
import type { AccessRole, LinkAccess, ResourceKind, Share, ShareRole } from "../types";

export interface ShareDialogProps {
  kind: ResourceKind;
  id: string;
  title: string;
  myRole: AccessRole;
  initialLinkAccess: LinkAccess;
  initialLinkRole: ShareRole;
  /** Icon-only trigger for tight headers. */
  iconOnly?: boolean;
}

export function ShareDialog(props: ShareDialogProps) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {props.iconOnly ? (
          <Button variant="ghost" size="sm" className="size-8 p-0" aria-label="Share">
            <Share2 className="size-3.5" />
          </Button>
        ) : (
          <Button size="sm" className="gap-1.5">
            <Share2 className="size-3.5" />
            Share
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">Share “{props.title || "Untitled"}”</DialogTitle>
          <DialogDescription>
            {can.share(props.myRole)
              ? `Choose who can open this ${KIND_LABEL[props.kind]}.`
              : `You have view access to this ${KIND_LABEL[props.kind]}.`}
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open so the queries don't run for every header render. */}
        {open ? <ShareDialogBody {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ShareDialogBody({ kind, id, myRole, initialLinkAccess, initialLinkRole }: ShareDialogProps) {
  return (
    <div className="flex flex-col gap-5">
      {can.share(myRole) ? <PeopleSection kind={kind} id={id} /> : null}
      <GeneralAccessSection
        kind={kind}
        id={id}
        canManage={can.manage(myRole)}
        initialLinkAccess={initialLinkAccess}
        initialLinkRole={initialLinkRole}
      />
      {can.manage(myRole) ? <PublishSection kind={kind} id={id} /> : null}
    </div>
  );
}

// --- People with access ------------------------------------------------------

function PeopleSection({ kind, id }: { kind: ResourceKind; id: string }) {
  const qc = useQueryClient();
  const key = shareKeys.people(kind, id);
  const people = useQuery({ queryKey: key, queryFn: () => listPeopleApi(kind, id) });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("editor");

  const add = useMutation({
    mutationFn: () => addPersonApi({ resourceKind: kind, resourceId: id, email, role }),
    onSuccess: (share) => {
      setEmail("");
      qc.invalidateQueries({ queryKey: key });
      if (!share.emailSent) {
        toast.warning("Access granted, but the email couldn't be sent. Share the link directly.");
      } else if (share.status === "pending") {
        toast.success(`Invited ${share.pendingEmail}. They'll get access when they sign up.`);
      } else {
        toast.success(`Shared with ${share.user?.name ?? share.user?.email ?? "them"}.`);
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't share."),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (email.trim()) add.mutate();
  }

  return (
    <section className="flex flex-col gap-3">
      <form onSubmit={onSubmit} className="flex gap-2">
        <Input
          type="email"
          placeholder="Add people by email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Email address"
          className="flex-1"
        />
        <RoleSelect value={role} onChange={setRole} />
        <Button type="submit" disabled={!email.trim() || add.isPending}>
          Share
        </Button>
      </form>
      <div className="flex flex-col gap-1">
        <h3 className="text-muted-foreground text-xs font-medium">People with access</h3>
        {people.isLoading ? (
          <p className="text-muted-foreground py-2 text-sm">Loading…</p>
        ) : people.data && people.data.length > 0 ? (
          <ul className="flex max-h-56 flex-col gap-1 overflow-auto">
            {people.data.map((share) => (
              <PersonRow key={share.id} share={share} queryKey={key} />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground py-2 text-sm">
            Only people in your workspace have access.
          </p>
        )}
      </div>
    </section>
  );
}

function PersonRow({ share, queryKey }: { share: Share; queryKey: readonly unknown[] }) {
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: async (value: ShareRole | "remove") => {
      if (value === "remove") await removePersonApi(share.id);
      else await updatePersonRoleApi(share.id, value);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't update access."),
  });
  const name = share.user?.name ?? share.pendingEmail ?? "Unknown";
  const email = share.user?.email ?? share.pendingEmail ?? "";

  return (
    <li className="flex items-center gap-3 py-1.5">
      <Avatar className="size-8">
        {share.user?.avatarUrl ? <AvatarImage src={share.user.avatarUrl} alt="" /> : null}
        <AvatarFallback className="text-xs">{name.slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{name}</span>
          {share.status === "pending" ? (
            <Badge variant="outline" className="text-[10px]">
              Invited
            </Badge>
          ) : null}
        </div>
        {share.user ? <p className="text-muted-foreground truncate text-xs">{email}</p> : null}
      </div>
      <Select
        value={share.role}
        onValueChange={(v) => update.mutate(v as ShareRole | "remove")}
        disabled={update.isPending}
      >
        <SelectTrigger size="sm" className="w-28" aria-label={`Access for ${email}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="viewer">Viewer</SelectItem>
          <SelectItem value="editor">Editor</SelectItem>
          <SelectSeparator />
          <SelectItem value="remove" className="text-destructive">
            Remove access
          </SelectItem>
        </SelectContent>
      </Select>
    </li>
  );
}

function RoleSelect({ value, onChange }: { value: ShareRole; onChange: (r: ShareRole) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as ShareRole)}>
      <SelectTrigger className="w-28" aria-label="Role">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="viewer">Viewer</SelectItem>
        <SelectItem value="editor">Editor</SelectItem>
      </SelectContent>
    </Select>
  );
}

// --- General access ----------------------------------------------------------

function GeneralAccessSection({
  kind,
  id,
  canManage,
  initialLinkAccess,
  initialLinkRole,
}: {
  kind: ResourceKind;
  id: string;
  canManage: boolean;
  initialLinkAccess: LinkAccess;
  initialLinkRole: ShareRole;
}) {
  const [linkAccess, setLinkAccess] = useState(initialLinkAccess);
  const [linkRole, setLinkRole] = useState(initialLinkRole);
  const save = useMutation({
    mutationFn: (next: { linkAccess: LinkAccess; linkRole: ShareRole }) =>
      setGeneralAccessApi(kind, id, next.linkAccess, next.linkRole),
    onError: (err) => {
      setLinkAccess(initialLinkAccess);
      setLinkRole(initialLinkRole);
      toast.error(err instanceof Error ? err.message : "Couldn't change access.");
    },
  });

  function change(next: { linkAccess: LinkAccess; linkRole: ShareRole }) {
    setLinkAccess(next.linkAccess);
    setLinkRole(next.linkRole);
    save.mutate(next);
  }

  const isOpen = linkAccess === "anyone_with_link";
  const link = typeof window === "undefined" ? "" : `${window.location.origin}${RESOURCE_PATH[kind](id)}`;

  return (
    <section className="flex flex-col gap-2">
      <Separator />
      <h3 className="text-muted-foreground text-xs font-medium">General access</h3>
      <div className="flex items-center gap-3">
        <div className="bg-muted grid size-8 shrink-0 place-items-center rounded-full">
          {isOpen ? <Link2 className="size-4" /> : <Lock className="size-4" />}
        </div>
        <div className="min-w-0 flex-1">
          {canManage ? (
            <Select
              value={linkAccess}
              onValueChange={(v) => change({ linkAccess: v as LinkAccess, linkRole })}
            >
              <SelectTrigger size="sm" className="h-7 border-none px-0 shadow-none" aria-label="General access">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="restricted">Restricted</SelectItem>
                <SelectItem value="anyone_with_link">Anyone with the link</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm font-medium">{isOpen ? "Anyone with the link" : "Restricted"}</p>
          )}
          <p className="text-muted-foreground text-xs">
            {isOpen
              ? linkRole === "editor"
                ? "Anyone with the link can view; signed-in people can edit."
                : "Anyone on the internet with the link can view."
              : "Only people with access can open with the link."}
          </p>
        </div>
        {isOpen && canManage ? (
          <RoleSelect value={linkRole} onChange={(r) => change({ linkAccess, linkRole: r })} />
        ) : null}
      </div>
      <div>
        <CopyButton value={link} label="Copy link" />
      </div>
    </section>
  );
}

// --- Publish to web ----------------------------------------------------------

function PublishSection({ kind, id }: { kind: ResourceKind; id: string }) {
  const qc = useQueryClient();
  const key = shareKeys.publish(kind, id);
  const state = useQuery({ queryKey: key, queryFn: () => getPublishStateApi(kind, id) });
  const toggle = useMutation({
    mutationFn: (published: boolean) => setPublishedApi(kind, id, published),
    onSuccess: (next) => qc.setQueryData(key, next),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't update publishing."),
  });

  const data = state.data;
  const selfPublished = Boolean(data?.published && !data.publishedVia);

  return (
    <section className="flex flex-col gap-2">
      <Separator />
      <div className="flex items-center gap-3">
        <div className="bg-muted grid size-8 shrink-0 place-items-center rounded-full">
          <Globe className="size-4" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">Publish to web</p>
          <p className="text-muted-foreground text-xs">
            A public, read-only page anyone can find with the link.
          </p>
        </div>
        <Switch
          checked={selfPublished}
          disabled={state.isLoading || toggle.isPending}
          onCheckedChange={(v) => toggle.mutate(v)}
          aria-label="Publish to web"
        />
      </div>
      {data?.publishedVia ? (
        <p className="bg-muted rounded-md px-3 py-2 text-xs">
          Already public because its {KIND_LABEL[data.publishedVia.kind]} “{data.publishedVia.name}” is
          published. Unpublish it there to make this private again.
        </p>
      ) : null}
      {data?.published && data.publicUrl ? (
        <div className="flex items-center gap-2">
          <Input readOnly value={data.publicUrl} className="h-8 text-xs" aria-label="Public URL" />
          <CopyButton value={data.publicUrl} iconOnly />
          <Button asChild variant="ghost" size="sm" className="size-8 p-0" aria-label="Open public page">
            <a href={data.publicUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function CopyButton({ value, label, iconOnly }: { value: string; label?: string; iconOnly?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — select the link and copy it manually.");
    }
  }
  const Icon = copied ? Check : Copy;
  if (iconOnly) {
    return (
      <Button variant="ghost" size="sm" className="size-8 p-0" onClick={copy} aria-label="Copy">
        <Icon className="size-3.5" />
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" className="gap-1.5" onClick={copy}>
      <Icon className="size-3.5" />
      {copied ? "Copied" : label}
    </Button>
  );
}
