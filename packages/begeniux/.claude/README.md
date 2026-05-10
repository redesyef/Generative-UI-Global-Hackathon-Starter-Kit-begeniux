# `.claude/` — Claude Code domain knowledge

These files give Claude Code (and humans) prebaked context about the libraries begeniux integrates with. They're committed so future contributors and AI assistants working in this repo all start from the same understanding.

## Skills

- **`copilotkit-develop/`** — registering frontend tools, sharing app context, hooking the CopilotKit runtime. Read this first when modifying `src/adapters/copilotkit.ts`.
- **`copilotkit-agui/`** — AG-UI protocol, event flow, runAgent semantics, headless invocation patterns.
- **`copilotkit-integrations/`** — wiring external agent frameworks (LangGraph, CrewAI, Mastra, etc.) into the CopilotKit runtime.
- **`copilotkit-setup/`** — scaffolding a new CopilotKit project from scratch.
- **`copilotkit-upgrade/`** — migrating from v1 → v2.
- **`copilotkit-debug/`** — diagnosing runtime / streaming / transcription issues.
- **`copilotkit-contribute/`** — workflow for contributing back to the upstream CopilotKit repo.
- **`copilotkit-self-update/`** — refreshing these very skills from upstream.
- **`mcp-apps-builder/`** + **`mcp-builder/`** — MCP server patterns. Useful if begeniux ever ships an MCP server tier.
- **`chatgpt-app-builder/`** — deprecated, kept for reference.

## How to use them

When working on begeniux features that touch one of these areas, **read the relevant `SKILL.md` first**. They encode design decisions, common pitfalls, and canonical patterns that aren't obvious from the API surface alone.

The skills do not ship to npm — they live in the source repo only.
