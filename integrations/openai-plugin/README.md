# Octonote plugin for ChatGPT (OpenAI plugin directory)

The package uploaded on platform.openai.com → Plugins. `plugin.json` holds the listing, review test cases and release notes; `mcp.json` points at the MCP server (api.octonote.ai/mcp); `skills/octonote` teaches ChatGPT how to use the tools well.

Build the ZIP (plugin.json at the archive root):

    pnpm openai:plugin

After publication, changing the manifest, skills or MCP config needs a new ZIP and another review. Bump `version` each time.
