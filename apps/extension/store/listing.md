# Chrome Web Store listing: Octonote Clipper

Everything the Chrome Web Store developer dashboard asks for, in the order it asks.
The package is made with `pnpm --filter @octonote/extension package` (stop `pnpm dev`
first: both write `dist/`). Images are in `images/`.

## Store listing

**Name:** Octonote Clipper

**Summary** (132 characters at most):

> Clip the parts of ChatGPT, Claude and Gemini answers you want into Octonote, then write a cited note from just those clips.

**Category:** Productivity → Tools

**Language:** English

**Description:**

> AI chats are full of good answers that are gone a week later. Octonote Clipper keeps the parts you want.
>
> CLIP WHAT MATTERS
> • Select any text in ChatGPT, Claude or Gemini and clip it, or clip a whole answer with one click.
> • Right-click → "Clip to Octonote", or press Alt+Shift+C.
> • Each clip remembers where it came from: which assistant, which chat, and a link back.
>
> ORGANISE AS YOU GO
> • Clip into a collection for each topic: a course, a project, a trip.
> • Find or create collections right from the side panel, and drag clips into order.
> • Clips appear in the panel the moment you take them.
>
> TURN CLIPS INTO A NOTE
> • In Octonote, turn a collection into a summary, report, comparison or flashcards.
> • Every sentence is cited back to the clip it came from.
>
> BRING YOUR NOTES INTO A CHAT (optional)
> • Turn on note access to add a note, canvas or project from Octonote to a chat, as text (canvases as a picture plus a Mermaid diagram).
> • Type #octonote in the message box to search without leaving the chat.
>
> PRIVATE BY DESIGN
> • Runs only on chatgpt.com, chat.openai.com, claude.ai and gemini.google.com, and reads a page only when you clip.
> • Talks only to Octonote (api.octonote.ai). No analytics, no tracking.
> • Its sign-in can add clips (and, if you allow it, read your notes). It can't change or delete your notes or your account. Disconnect at any time.
>
> Needs a free Octonote account: https://octonote.ai

**Icon:** the 128×128 icon in the package (`public/icons/icon-128.png`).

**Screenshots** (1280×800):
1. `images/01-clips.png`: Keep the parts of AI answers you want
2. `images/02-collections.png`: A collection for every topic
3. `images/03-notes.png`: Bring your notes into any chat
4. `images/04-dark.png`: Then write a note from just those clips

**Small promo tile** (440×280): `images/promo-small-440x280.png`

**Official URL / homepage:** https://octonote.ai

**Support URL:** mailto:hello@octonote.ai (or https://octonote.ai)

## Privacy practices

**Single purpose:**

> Save selected parts of AI chat answers (ChatGPT, Claude, Gemini) to the user's Octonote collections, and, if the user turns it on, add their Octonote notes to those chats.

**Permission justifications:**

| Permission | Why |
|---|---|
| `storage` | Keeps the user's Octonote sign-in token, workspace name and chosen collection on the device, so they don't have to connect again. |
| `contextMenus` | Adds "Clip to Octonote" to the right-click menu for selected text. |
| `sidePanel` | The extension's interface is a side panel: choosing a collection, seeing and ordering clips, and the optional Notes tab. |
| `activeTab` | When the user right-clicks or uses the keyboard shortcut, reads the selected text in that tab only, at that moment. |
| Host permission `https://api.octonote.ai/*` | The only server it talks to: Octonote's API, to save clips and list collections (and, if turned on, read the user's notes). |
| Content scripts on chatgpt.com, chat.openai.com, claude.ai, gemini.google.com | Show the "Clip" button on answers and the #octonote picker in the message box. Nothing runs on other sites. |
| Content script on octonote.ai/workspace/extension | Receives the one-time connect code when the user connects the extension to their account. |

**Remote code:** No. All code is in the package; the extension's own pages allow only their own scripts (`script-src 'self'`).

**Data usage.** Tick these:
- **Website content**: the text the user chooses to clip, with the chat's address and title.
- **Authentication information**: the Octonote sign-in token, kept on the device and sent only to api.octonote.ai.

Leave the others unticked. In particular, it doesn't collect web history, user activity, personal communications beyond what the user clips, or location.

Certify all three: not sold to third parties; not used for purposes unrelated to the single purpose; not used for creditworthiness or lending.

**Privacy policy URL:** https://octonote.ai/privacy (the "Octonote Clipper browser extension" section).

## Distribution

- **Visibility:** start as **Unlisted** (only people with the link can install it) while you try the store version, then switch to Public.
- **Regions:** all.
- **Price:** free.

## Before each new version

1. Bump `version` in `apps/extension/package.json`.
2. `pnpm --filter @octonote/extension test` and `typecheck`.
3. `pnpm --filter @octonote/extension package`, then upload `octonote-clipper.zip`.
