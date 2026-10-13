# @octonote/cli

`octonote` — Octonote from your terminal, built for **AI agents** (Claude Code,
Codex) as much as for people. Write notes from markdown, draw canvases from
mermaid flowcharts, organise them in notebooks, publish and share — all
through the same API the app uses, with your permissions.

```bash
npm i -g @octonote/cli
octonote login                 # opens the browser; click Authorize
octonote setup claude          # or: octonote setup codex — teaches your agent
```

Then just ask your agent: *“Write up the auth flow in my Architecture notebook,
with a diagram, and publish it.”*

## For agents

`octonote guide` prints everything an agent needs in one read. In short:

- JSON output when piped; errors are `{"error":{"code","message","hint"}}`
  with a non-zero exit code (2 usage, 3 not signed in, 4 not found, 5 plan
  limit, 6 network).
- Never prompts. Content comes from `--file`, `--stdin` or `-`.
- Every result carries `id`, `url` and (once published) `publicUrl`.

## Commands

```
octonote login | logout | whoami | workspace list|use | token list|revoke
octonote note create|show|pull|push|append|rename
octonote canvas create [--from-mermaid f.mmd | --file c.json] | redraw | pull | push
octonote project create <name> --note doc.md --canvas-mermaid flow.mmd | show
octonote notebook list|create|show
octonote list | search | open | move | delete --yes
octonote publish | unpublish | share --email … --role viewer|editor | share --link view|edit|off
octonote guide | setup claude|codex [--global] [--skill]
```

## Without a browser (CI, cloud agents)

Create a token in **Settings → CLI & agents → Create token** and set it as
`OCTONOTE_TOKEN`. Tokens can do what you can do in the app, except create
more tokens or delete your account; revoke them any time in Settings.

| Variable | Default |
|---|---|
| `OCTONOTE_TOKEN` | sign-in from `octonote login` |
| `OCTONOTE_WORKSPACE` | the workspace you own |
| `OCTONOTE_API_URL` / `OCTONOTE_WEB_URL` | hosted Octonote |
| `OCTONOTE_CONFIG_DIR` | `~/.octonote` |
