# cursor-dash

A local, read-only dashboard for your [Cursor](https://cursor.com) session history — every chat, tool call, token, and estimated cost, indexed straight from Cursor's own on-disk data. Nothing leaves your machine.

```
npx cursor-dash
```

That's it. It scans Cursor's local data stores, starts a server on `127.0.0.1`, and opens the dashboard in your browser.

## What it shows

- **Every session** across all your Cursor workspaces — agent and chat, archived and draft, with filters for date range, workspace, model, mode, status, errors, tool calls, token range, lines changed, and more.
- **Full transcripts** — user/assistant messages, collapsible thinking blocks, expandable tool calls with arguments and results, syntax-highlighted code, diffs, todos, and errors.
- **The context-window budget** — Cursor tracks exactly what's competing for a session's context (system prompt, tools, rules, skills, MCP, subagents, summarized history, live conversation) and exposes it nowhere. cursor-dash renders it as a stacked meter, at three scales: a sparkline in each session row, the full breakdown in a session's header, and a small-multiples grid in Analytics.
- **Tokens and cost, honestly labelled.** Cursor stores no dollar amounts locally, only token counts, and even those are measured on a minority of messages. Every number carries a provenance tag — `measured`, `reported` (a context-window snapshot, not cumulative spend), or `estimated` (a character-count heuristic) — surfaced in the UI rather than hidden. Cost is computed from an editable price table (Settings → Pricing) and unpriced models show as "unpriced," never silently as $0.
- **Analytics** — usage over time, model mix, tool call frequency and error rates, context pressure across every session.
- **Code authorship** — AI vs. human lines per commit and per file extension, from Cursor's own AI-code-tracking database.
- **Workspaces** — every project folder Cursor has run a session in, with rollups.
- **Live updates** — the dashboard refreshes automatically as you use Cursor, via a small local change-stream.

## How it works

A Node server (`server/`) reads Cursor's local SQLite stores and transcript files — never writing to them — normalizes everything into stable shapes, and serves both a JSON API and the built dashboard (`npm run build`'s `dist/`) from one process. No native dependencies: it uses Node's built-in `node:sqlite` where available and falls back to a pure-WASM SQLite (`sql.js`) otherwise, so `npx cursor-dash` works without a compiler toolchain on macOS, Windows, or Linux.

Data sources read (all optional — a missing one just degrades that panel):

| Source | Path (macOS / Windows) |
|---|---|
| Session index & messages | `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` · `%APPDATA%\Cursor\User\globalStorage\state.vscdb` |
| Full-text search | `.../globalStorage/conversation-search.db` |
| AI code-authorship tracking | `~/.cursor/ai-tracking/ai-code-tracking.db` |
| Raw agent transcripts | `~/.cursor/projects/*/agent-transcripts/*/*.jsonl` |
| Per-workspace legacy activity | `.../User/workspaceStorage/*/state.vscdb` |

> **Windows note:** every path is built with `path.join` from platform-detected roots and the code has been reviewed for POSIX-only assumptions, but it has only been *run* on macOS during development. If something doesn't resolve correctly on Windows, please file an issue.

## CLI options

```
npx cursor-dash [options]

  -p, --port <n>     Port to listen on (default: 7788, auto-increments if taken)
      --data-dir <p> Override the Cursor data directory to scan
      --no-open      Don't open the dashboard in a browser
      --cloud        Enable the optional live Cursor usage sync (reads your local
                      Cursor auth token and calls cursor.com — off by default)
  -h, --help          Show help
  -v, --version       Show the version
```

## Privacy

Everything runs on `127.0.0.1` and only accepts loopback requests. cursor-dash reads Cursor's local databases through snapshot copies (never opens them for writing, never touches them mid-write) and never sends your data anywhere — with one narrow, explicit exception: passing `--cloud` and clicking "Try sync" in Settings sends your local Cursor auth token to `cursor.com` to fetch real usage, using an unofficial endpoint. It's off by default.

## Development

```
npm install
npm run dev         # Vite dev server on :5173, proxying /api to :7788
npm run dev:server  # the API server, in another terminal
npm run build        # builds dist/
npm start             # runs the built app end-to-end (same as npx cursor-dash)
```
