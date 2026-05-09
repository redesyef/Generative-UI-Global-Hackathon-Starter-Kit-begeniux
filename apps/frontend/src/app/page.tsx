import Link from "next/link";
import { ArrowRight, BookOpen, LayoutGrid, Sparkles } from "lucide-react";

export const metadata = {
  title: "Hackathon Starter Kit",
  description:
    "Generative UI · Global Agents · Agentic Interfaces — pick a surface to explore.",
};

const tiles = [
  {
    href: "/leads",
    eyebrow: "Demo",
    title: "Leads canvas",
    blurb:
      "Workshop demand chart and a kanban pipeline backed by Notion. Drag cards across statuses; the agent persists writes back through the MCP tools.",
    icon: LayoutGrid,
  },
  {
    href: "/showcase",
    eyebrow: "Reference",
    title: "Frontend tool surface",
    blurb:
      "Every state mutator, controlled-gen-UI renderer, and the open-gen-UI fallback the agent can call — rendered with mock data.",
    icon: Sparkles,
  },
  {
    href: "/about",
    eyebrow: "Docs",
    title: "About this kit",
    blurb:
      "Quickstart, demo prompts, customization, required keys, and links to the underlying frameworks.",
    icon: BookOpen,
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16 md:px-12">
      <header className="mb-12">
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-accent">
          Hackathon Starter
        </p>
        <h1 className="text-4xl font-semibold leading-tight text-foreground md:text-5xl">
          Generative UI{" "}
          <span className="text-muted-foreground/60">·</span> Global Agents{" "}
          <span className="text-muted-foreground/60">·</span> Agentic
          Interfaces
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          A working CopilotKit + LangGraph + Notion-MCP stack. Pick where to
          start.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {tiles.map(({ href, eyebrow, title, blurb, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col rounded-2xl border bg-card p-6 transition-colors hover:border-accent hover:bg-muted/40"
          >
            <Icon
              size={20}
              className="mb-4 text-accent"
              aria-hidden
            />
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {eyebrow}
            </p>
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
              {blurb}
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent">
              Open
              <ArrowRight
                size={14}
                className="transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
