import type { ReactNode } from "react"
import { Bot, GitBranch, Inbox, Paperclip } from "lucide-react"
import type { SessionDetail } from "@/lib/types"
import { EmptyState } from "@/components/EmptyState"
import { Badge } from "@/components/ui/badge"
import { pathBasename } from "@/lib/format"

/** Everything Cursor attached to or configured for this session — file/
 * image/rule/commit attachments, tracked git repos, subagents spawned,
 * and any prompts still queued behind the current turn. Session-wide
 * state (reflects the composer's current context, not a per-message log). */
export function ContextTab({ session }: { session: SessionDetail }) {
  const hasAnything =
    session.attachments.length > 0 ||
    session.trackedGitRepos.length > 0 ||
    session.subagentIds.length > 0 ||
    session.queuedPrompts.length > 0 ||
    !!session.activeCustomMode

  if (!hasAnything) {
    return <EmptyState title="No extra context" description="No attachments, rules, or linked repos on this session." />
  }

  return (
    <div className="flex flex-col gap-6">
      {(session.activeCustomMode || session.forceMode) && (
        <Section title="Mode">
          <div className="flex gap-2">
            {session.activeCustomMode && <Badge variant="iris">{session.activeCustomMode}</Badge>}
            {session.forceMode && <Badge variant="outline">{session.forceMode}</Badge>}
          </div>
        </Section>
      )}

      {session.attachments.length > 0 && (
        <Section title={`Attachments (${session.attachments.length})`} icon={<Paperclip className="size-3.5" />}>
          <ul className="flex flex-col gap-1">
            {session.attachments.map((a, i) => (
              <li key={i} className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm">
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {a.kind}
                </Badge>
                <span className="min-w-0 flex-1 truncate" title={a.path ?? a.label}>
                  {a.path ? pathBasename(a.path) : a.label}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {session.trackedGitRepos.length > 0 && (
        <Section title="Tracked git repos" icon={<GitBranch className="size-3.5" />}>
          <ul className="flex flex-col gap-1">
            {session.trackedGitRepos.map((r) => (
              <li key={r} className="num truncate rounded-md border border-border px-3 py-1.5 text-sm">
                {r}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {session.subagentIds.length > 0 && (
        <Section title={`Subagents (${session.subagentIds.length})`} icon={<Bot className="size-3.5" />}>
          <ul className="flex flex-col gap-1">
            {session.subagentIds.map((id) => (
              <li key={id} className="num truncate rounded-md border border-border px-3 py-1.5 text-sm">
                {id}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {session.queuedPrompts.length > 0 && (
        <Section title={`Queued prompts (${session.queuedPrompts.length})`} icon={<Inbox className="size-3.5" />}>
          <ul className="flex flex-col gap-1">
            {session.queuedPrompts.map((p) => (
              <li key={p.id} className="truncate rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground">
                {p.text || "…"}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {icon}
        {title}
      </div>
      {children}
    </div>
  )
}
