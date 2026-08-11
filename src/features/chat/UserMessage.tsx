import {
  File,
  Folder,
  Image as ImageIcon,
  Video,
  FileText,
  GitCommit,
  GitPullRequest,
  BookOpen,
  Terminal,
  Link as LinkIcon,
  Bot,
  Globe,
  Paperclip,
} from "lucide-react"
import type { Attachment, Message } from "@/lib/types"
import { pathBasename } from "@/lib/format"
import { TextBlock } from "./blocks/TextBlock"

const ATTACHMENT_ICON: Record<string, typeof File> = {
  file: File,
  folder: Folder,
  image: ImageIcon,
  video: Video,
  doc: FileText,
  commit: GitCommit,
  "pull-request": GitPullRequest,
  rule: BookOpen,
  command: Terminal,
  terminal: Terminal,
  link: LinkIcon,
  subagent: Bot,
  browser: Globe,
}

function AttachmentChip({ attachment }: { attachment: Attachment }) {
  const Icon = ATTACHMENT_ICON[attachment.kind] ?? Paperclip
  return (
    <span
      className="flex max-w-48 items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground"
      title={attachment.path ?? attachment.label}
    >
      <Icon className="size-3 shrink-0" />
      <span className="truncate">{attachment.path ? pathBasename(attachment.path) : attachment.label}</span>
    </span>
  )
}

/** The user's turn — right-offset so it reads as distinct from the
 * assistant's response, with any attached files/images/rules/etc. shown
 * as chips above the message text. */
export function UserMessage({ message }: { message: Message }) {
  return (
    <div className="flex justify-end px-4 py-3">
      <div className="flex max-w-[85%] flex-col items-end gap-1.5">
        {message.attachments.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {message.attachments.map((a, i) => (
              <AttachmentChip key={i} attachment={a} />
            ))}
          </div>
        )}
        {message.text && (
          <div className="rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-primary-foreground [&_a]:text-primary-foreground [&_a]:underline">
            <TextBlock text={message.text} />
          </div>
        )}
      </div>
    </div>
  )
}
