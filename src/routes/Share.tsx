import { useEffect, useState, type ReactNode } from "react"
import { Navigate } from "react-router"
import {
  Share2,
  Globe,
  KeyRound,
  Clock,
  ShieldCheck,
  TriangleAlert,
  Copy,
  Check,
  Loader2,
  type LucideIcon,
} from "lucide-react"
import { useMeta, useShareStatus, useStartShare, useStopShare } from "@/lib/api"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import { formatAccessCode, formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { ShareStatus } from "@/lib/types"

export default function Share() {
  const { data: meta } = useMeta()
  const { data: status } = useShareStatus()

  // Cosmetic only — a request that came in through a `--share` tunnel gets
  // 403'd by the server on every /api/share/* call regardless, this just
  // keeps a remote visitor from seeing the page (and the code) at all.
  if (meta?.isOwner === false) return <Navigate to="/" replace />

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <PageHeader
        title="Share"
        description="Give a teammate a temporary, code-gated look at this dashboard — without moving any of your data off this machine."
      />

      <div className="flex max-w-3xl flex-col gap-4 px-6 pb-10 2xl:px-8">
        <ShareActionCard status={status} />

        <InfoCard icon={Globe} title="What sharing does">
          Starting a share opens a public HTTPS URL for this dashboard through a free Cloudflare
          Quick Tunnel, protected by a one-time 8-character access code. Nothing to install or
          configure — the tunnel sets itself up automatically the first time it's used.
        </InfoCard>

        <InfoCard icon={KeyRound} title="How someone gets in">
          Send them both the link and the code below. They open the link, enter the code once, and
          that browser then stays signed in for 24 hours — or until you stop sharing, whichever
          comes first.
        </InfoCard>

        <InfoCard icon={Clock} title="How long it lasts">
          There's no automatic expiry. Sharing stays on until you press{" "}
          <span className="font-medium text-foreground">Stop sharing</span> below, or quit
          cursor-dash entirely — nothing about it winds down on a schedule.
        </InfoCard>

        <InfoCard icon={ShieldCheck} title="Your data stays local" accent="mint">
          The tunnel only ever forwards traffic to <span className="num">127.0.0.1</span> on this
          machine — no session, transcript, or file diff is uploaded to or stored on any server.
          The link and access code live in memory for as long as sharing is on and are never
          written to disk. Cloudflare only carries encrypted traffic in transit, the same as any
          site behind it.
        </InfoCard>

        <InfoCard icon={TriangleAlert} title="Before you send the link" accent="coral">
          Anyone with the link and code gets full access — every session, transcript, and file
          diff on this machine, the same as sitting at the keyboard. There's no read-only mode.
          Only share with someone you'd hand your Cursor history to directly.
        </InfoCard>
      </div>
    </div>
  )
}

function ShareActionCard({ status }: { status: ShareStatus | undefined }) {
  const start = useStartShare()
  const stop = useStopShare()
  const urlCopy = useCopyToClipboard()
  const codeCopy = useCopyToClipboard()

  const state = status?.state ?? "idle"

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full",
            state === "active"
              ? "bg-mint/15 text-mint"
              : state === "error"
                ? "bg-coral/15 text-coral"
                : "bg-muted text-muted-foreground"
          )}
        >
          <Share2 className="size-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="font-heading text-base font-semibold">
            {state === "active" && "Sharing is on"}
            {state === "starting" && "Starting…"}
            {state === "error" && "Couldn't start sharing"}
            {state === "idle" && "Not sharing"}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {state === "active" && status?.startedAt != null && (
              <>
                Active for <SharingTimer startedAt={status.startedAt} />
              </>
            )}
            {state === "starting" &&
              "Setting up a Cloudflare Quick Tunnel — a first run downloads a small binary, so this can take a minute."}
            {state === "error" && (status?.error || "Something went wrong starting the tunnel.")}
            {state === "idle" && "Your dashboard is only reachable from this machine right now."}
          </div>
        </div>

        {state === "idle" && (
          <Button onClick={() => start.mutate()} disabled={start.isPending}>
            Start sharing
          </Button>
        )}
        {state === "starting" && (
          <Button disabled>
            <Loader2 className="size-4 animate-spin" />
            Starting…
          </Button>
        )}
        {state === "error" && (
          <Button variant="outline" onClick={() => start.mutate()} disabled={start.isPending}>
            Retry
          </Button>
        )}
        {state === "active" && (
          <Button variant="destructive" onClick={() => stop.mutate()} disabled={stop.isPending}>
            Stop sharing
          </Button>
        )}
      </div>

      {state === "active" && status?.url && status.code && (
        <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
          <CopyRow label="Public URL" value={status.url} copied={urlCopy.copied} onCopy={() => urlCopy.copy(status.url ?? "")} />
          <CopyRow
            label="Access code"
            value={formatAccessCode(status.code)}
            copied={codeCopy.copied}
            onCopy={() => codeCopy.copy(status.code ?? "")}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Stopping only closes the public link — this dashboard keeps running locally.
          </p>
        </div>
      )}
    </div>
  )
}

function CopyRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string
  value: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
        <div className="num truncate text-sm">{value}</div>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label={`Copy ${label.toLowerCase()}`}
      >
        {copied ? <Check className="size-3.5 text-mint" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  )
}

/** Ticks once a second purely to keep "active for Xm" fresh — the query
 * itself only refetches every 15s while active, which would otherwise make
 * this drift visibly behind. */
function SharingTimer({ startedAt }: { startedAt: number }) {
  const [, forceTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return <span className="num">{formatDuration(Date.now() - startedAt)}</span>
}

function InfoCard({
  icon: Icon,
  title,
  accent,
  children,
}: {
  icon: LucideIcon
  title: string
  accent?: "mint" | "coral"
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        accent === "mint" && "border-mint/25 bg-mint/5",
        accent === "coral" && "border-coral/25 bg-coral/5",
        !accent && "border-border bg-card"
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 text-xs font-medium tracking-wide uppercase",
          accent === "mint" ? "text-mint" : accent === "coral" ? "text-coral" : "text-muted-foreground"
        )}
      >
        <Icon className="size-3.5" />
        {title}
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">{children}</p>
    </div>
  )
}
