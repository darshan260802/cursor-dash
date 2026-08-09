# cursor-dash

[![npm version](https://img.shields.io/npm/v/%40darshanpatel2608%2Fcursor-dash.svg)](https://www.npmjs.com/package/@darshanpatel2608/cursor-dash)
[![license](https://img.shields.io/npm/l/%40darshanpatel2608%2Fcursor-dash.svg)](./package.json)

A local, read-only dashboard for your [Cursor](https://cursor.com) session history — every chat, tool call, token, and estimated cost, indexed straight from Cursor's own on-disk data. Nothing leaves your machine.

![cursor-dash overview screenshot](./assets/screenshot.png)

## Install

```sh
npm install --location=global @darshanpatel2608/cursor-dash
```

then run it from anywhere:

```sh
cursor-dash
```

Or skip the install and run it directly:

```sh
npx @darshanpatel2608/cursor-dash
```

Either way: it scans Cursor's local data stores, starts a server on `127.0.0.1`, and opens the dashboard in your browser.

## What it shows

- **Every session** across all your Cursor workspaces — agent and chat, archived and draft, with filters for date range, workspace, model, mode, status, errors, tool calls, token range, lines changed, and more.
- **Full transcripts** — user/assistant messages, collapsible thinking blocks, expandable tool calls with arguments and results, syntax-highlighted code, diffs, todos, and errors.
- **The context-window budget** — Cursor tracks exactly what's competing for a session's context (system prompt, tools, rules, skills, MCP, subagents, summarized history, live conversation) and exposes it nowhere. cursor-dash renders it as a stacked meter, at three scales: a sparkline in each session row, the full breakdown in a session's header, and a small-multiples grid in Analytics.
- **Tokens and cost, honestly labelled.** Cursor stores no dollar amounts locally, only token counts, and even those are measured on a minority of messages. Every number carries a provenance tag — `measured`, `reported` (a context-window snapshot, not cumulative spend), or `estimated` (a character-count heuristic) — surfaced in the UI rather than hidden. Cost is computed from an editable price table (sidebar → Pricing) that can also refresh itself from Cursor's published pricing docs; unpriced models show as "unpriced," never silently as $0.
- **Analytics** — usage over time, model mix, tool call frequency and error rates, context pressure across every session.
- **Code authorship** — AI vs. human lines per commit and per file extension, from Cursor's own AI-code-tracking database.
- **Workspaces** — every project folder Cursor has run a session in, with rollups.
- **Live updates** — the dashboard refreshes automatically as you use Cursor, via a small local change-stream.

## How it works

A Node server (`server/`) reads Cursor's local SQLite stores and transcript files — never writing to them — normalizes everything into stable shapes, and serves both a JSON API and the built dashboard from one process. No native dependencies: it uses Node's built-in `node:sqlite` where available and falls back to a pure-WASM SQLite (`sql.js`) otherwise, so it works without a compiler toolchain on macOS, Windows, or Linux.

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
cursor-dash [options]

  -p, --port <n>     Port to listen on (default: 7788, auto-increments if taken)
      --data-dir <p> Override the Cursor data directory to scan
      --no-open      Don't open the dashboard in a browser
      --cloud        Enable the optional live Cursor usage sync (reads your local
                      Cursor auth token and calls cursor.com — off by default)
  -h, --help          Show help
  -v, --version       Show the version
```

(`npx @darshanpatel2608/cursor-dash [options]` works the same way if you didn't install it globally.)

## Privacy

Everything runs on `127.0.0.1` and only accepts loopback requests. cursor-dash reads Cursor's local databases through snapshot copies — it never opens them for writing, never touches them mid-write — and by default nothing you type or that Cursor recorded ever leaves your machine. Two narrow, explicit exceptions, both plain outbound requests you trigger yourself:

- **Refresh pricing** (sidebar → Pricing → Refresh pricing) fetches Cursor's public pricing docs page to update the cost-estimate table. No account data is sent — it's the same request your browser makes loading that page.
- **`--cloud`** enables an unofficial cursor.com usage endpoint that reads your local Cursor auth token. It's off by default and has to be started explicitly with that flag.

## Development

```sh
git clone https://github.com/darshan260802/cursor-dash.git
cd cursor-dash
npm install
npm run dev         # Vite dev server on :5173, proxying /api to :7788
npm run dev:server  # the API server, in another terminal
npm run build        # builds dist/
npm start             # runs the built app end-to-end (same as `cursor-dash`)
```

## License

MIT
