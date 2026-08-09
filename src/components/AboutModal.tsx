import { useState } from "react"
import { Info, Mail, ShieldCheck, Sparkles } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

// lucide-react dropped brand/logo glyphs a while back, so these two are
// small hand-authored marks rather than an import.
function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.09 3.29 9.4 7.86 10.93.57.11.78-.25.78-.55v-2.15c-3.2.7-3.88-1.36-3.88-1.36-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.43-2.69 5.41-5.25 5.69.41.36.78 1.08.78 2.17v3.22c0 .31.21.67.79.55A11.5 11.5 0 0 0 23.5 12c0-6.27-5.23-11.5-11.5-11.5z" />
    </svg>
  )
}

function LinkedinMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.15 1.45-2.15 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.38-1.85 3.61 0 4.28 2.38 4.28 5.47v6.27zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45z" />
    </svg>
  )
}

const DEV = {
  name: "Darshan Patel",
  email: "darshanpatel2608ce@gmail.com",
  github: "https://github.com/darshan260802",
  linkedin: "https://www.linkedin.com/in/darshan-patel-2608",
  avatar: "https://avatars.githubusercontent.com/u/91478282?s=400",
}

export function AboutModal() {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            <Info className="size-3.5" />
            About
          </button>
        }
      />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>About cursor-dash</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 p-3">
          <img
            src={DEV.avatar}
            alt=""
            className="size-10 shrink-0 rounded-md object-cover"
            onError={(e) => {
              e.currentTarget.onerror = null
              e.currentTarget.src = "/logo.png"
            }}
          />
          <div className="min-w-0 flex-1">
            <div className="font-heading text-sm font-semibold">{DEV.name}</div>
            <a
              href={`mailto:${DEV.email}`}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Mail className="size-3" />
              {DEV.email}
            </a>
            <div className="mt-1.5 flex items-center gap-3">
              <a
                href={DEV.github}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <GithubMark className="size-3.5" />
                GitHub
              </a>
              <a
                href={DEV.linkedin}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <LinkedinMark className="size-3.5" />
                LinkedIn
              </a>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium">
              <Sparkles className="size-3.5 text-amber" />
              About the app
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              cursor-dash indexes Cursor's local session history — every chat, tool call, token, and estimated cost —
              into a dashboard you run on your own machine, straight from Cursor's own on-disk data.
            </p>
          </div>

          <div className="rounded-md border border-mint/25 bg-mint/5 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-mint">
              <ShieldCheck className="size-3.5" />
              Privacy
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Everything happens locally — no data ever leaves your system. The server only binds to 127.0.0.1 and
              reads Cursor's files straight off your disk. The one narrow exception is the optional{" "}
              <span className="num">--cloud</span> flag, which you have to enable explicitly and confirm each use.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
