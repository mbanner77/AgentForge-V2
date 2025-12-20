import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Settings, Workflow, Shield, Zap, GitBranch, Database, Store, Server, Users, Puzzle, Bot, Eye, Rocket, Bug, Building2, BookOpen, Keyboard, Moon, Globe, Brain } from "lucide-react"
import Link from "next/link"

const features = [
  {
    icon: Store,
    title: "Agent Marketplace",
    description: "20+ spezialisierte Agenten. Testing, Dokumentation, SAP, DevOps und mehr.",
    isNew: true,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    link: "/admin",
  },
  {
    icon: Server,
    title: "MCP Server",
    description: "24 Server für Filesystem, Datenbanken, APIs, GitHub, Slack und mehr.",
    isNew: true,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    link: "/mcp",
  },
  {
    icon: Building2,
    title: "SAP Integration",
    description: "Offizielle SAP MCP Server für CAP, UI5, Fiori und MDK Entwicklung.",
    isNew: true,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
    link: "/sap",
  },
  {
    icon: Zap,
    title: "Streaming API",
    description: "Echtzeit-Token-Ausgabe für OpenAI, Anthropic und OpenRouter.",
    isNew: true,
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
  },
  {
    icon: Workflow,
    title: "Workflow Designer",
    description: "Visuelle Workflow-Erstellung mit Drag & Drop und Human-in-the-Loop.",
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    link: "/builder/workflow",
  },
  {
    icon: Shield,
    title: "Security Agent",
    description: "Automatische Sicherheitsanalyse. XSS, SQL Injection, Secrets Detection.",
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
  },
  {
    icon: Brain,
    title: "RAG Knowledge Base",
    description: "Dokumente hochladen und per Embedding durchsuchen. Agent-Kontext.",
    isNew: true,
    color: "text-pink-500",
    bgColor: "bg-pink-500/10",
  },
  {
    icon: Eye,
    title: "Live Preview",
    description: "Sandpack oder WebContainer. Echtzeit-Vorschau mit Hot-Reload.",
    color: "text-indigo-500",
    bgColor: "bg-indigo-500/10",
  },
  {
    icon: Bug,
    title: "Auto-Fehlerkorrektur",
    description: "Fehler automatisch erkennen und beheben. Bis zu 3 Iterationen.",
    isNew: true,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
  },
  {
    icon: Rocket,
    title: "One-Click Deploy",
    description: "GitHub Push und Render.com Deployment in einem Klick.",
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
  },
  {
    icon: Keyboard,
    title: "Keyboard Shortcuts",
    description: "Ctrl+S, Ctrl+N, Ctrl+B und mehr für schnelles Arbeiten.",
    isNew: true,
    color: "text-slate-400",
    bgColor: "bg-slate-500/10",
  },
  {
    icon: Moon,
    title: "Dark/Light Theme",
    description: "Wechsel zwischen Dark, Light und System-Theme.",
    isNew: true,
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
  },
  {
    icon: Globe,
    title: "i18n Support",
    description: "Deutsch und Englisch. Weitere Sprachen einfach hinzufügbar.",
    isNew: true,
    color: "text-teal-500",
    bgColor: "bg-teal-500/10",
  },
  {
    icon: Users,
    title: "Benutzerverwaltung",
    description: "Admin und User Rollen. NextAuth.js mit JWT.",
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
  },
  {
    icon: BookOpen,
    title: "Dokumentation",
    description: "Umfassende Docs mit Tutorials und API-Referenz.",
    isNew: true,
    color: "text-sky-500",
    bgColor: "bg-sky-500/10",
    link: "/docs",
  },
  {
    icon: Database,
    title: "Persistenz",
    description: "LocalStorage oder PostgreSQL. Prisma ORM.",
    color: "text-rose-500",
    bgColor: "bg-rose-500/10",
  },
]

export function FeaturesGrid() {
  return (
    <section id="features" className="px-4 py-24 sm:px-6 lg:px-8 relative">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/4 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-blue-500/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-7xl">
        <div className="mb-16 text-center">
          <Badge variant="secondary" className="mb-4 bg-primary/10 text-primary">
            16 Features
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            Alles was du brauchst
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Von der Planung bis zum Deployment - AgentForge bietet alle Tools für professionelle KI-gestützte Entwicklung.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => {
            const cardContent = (
              <Card
                className={`group border-border bg-card/50 backdrop-blur-sm p-6 transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 h-full ${
                  feature.isNew ? "ring-1 ring-primary/20" : ""
                } ${feature.link ? "cursor-pointer" : ""}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${feature.bgColor || "bg-secondary"} transition-all group-hover:scale-110`}>
                    <feature.icon className={`h-6 w-6 ${feature.color || "text-foreground"}`} />
                  </div>
                  {feature.isNew && (
                    <Badge className="bg-green-500/20 text-green-400 text-xs border-0">Neu</Badge>
                  )}
                </div>
                <h3 className="mb-2 font-semibold text-lg group-hover:text-primary transition-colors">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </Card>
            )
            
            return feature.link ? (
              <Link key={feature.title} href={feature.link}>
                {cardContent}
              </Link>
            ) : (
              <div key={feature.title}>
                {cardContent}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
