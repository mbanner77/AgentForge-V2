import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Settings, Workflow, Shield, Zap, GitBranch, Terminal, Database, Lock, Store, Server, Users, Puzzle, Bot, Eye, Rocket, Bug } from "lucide-react"

const features = [
  {
    icon: Store,
    title: "Agent Marketplace",
    description: "Installiere spezialisierte Agenten aus dem Marketplace. Von Testing bis Dokumentation - erweitere dein Team.",
    isNew: true,
  },
  {
    icon: Server,
    title: "MCP Server Integration",
    description: "Verbinde externe Dienste über das Model Context Protocol. Filesystem, Datenbanken, APIs und mehr.",
    isNew: true,
  },
  {
    icon: Users,
    title: "Benutzerverwaltung",
    description: "Verwalte Benutzer mit Admin- und User-Rollen. Kontrolliere wer Agenten installieren darf.",
    isNew: true,
  },
  {
    icon: Puzzle,
    title: "Custom Agents",
    description: "Konfiguriere jeden Agenten individuell. Wähle Modell, Temperatur und System-Prompt.",
    isNew: true,
  },
  {
    icon: Settings,
    title: "Vollständig konfigurierbar",
    description: "Passe jeden Agenten individuell an deine Bedürfnisse an. Definiere Prompts, Tools und Workflows.",
  },
  {
    icon: Workflow,
    title: "Dynamischer Workflow",
    description: "Ordne Agenten per Drag & Drop. Füge neue Agenten hinzu oder entferne sie aus dem Workflow.",
  },
  {
    icon: Shield,
    title: "Security Agent",
    description: "Automatische Sicherheitsanalyse deines Codes. Erkennt Schwachstellen und gibt Empfehlungen.",
  },
  {
    icon: Bug,
    title: "Auto-Fehlerkorrektur",
    description: "Melde Fehler aus StackBlitz und lass sie automatisch korrigieren. Bis zu 3 Versuche.",
    isNew: true,
  },
  {
    icon: Eye,
    title: "Live Preview",
    description: "Sieh deinen Code sofort in StackBlitz. Teste und debugge in Echtzeit.",
  },
  {
    icon: Rocket,
    title: "One-Click Deploy",
    description: "Deploye direkt zu GitHub und Render.com. Automatische CI/CD-Pipeline.",
  },
  {
    icon: GitBranch,
    title: "Git Integration",
    description: "Nahtlose Integration mit Git. Automatische Commits, Branches und Pull Requests.",
  },
  {
    icon: Database,
    title: "Persistenz",
    description: "Lokal: Browser-Storage. Auf Render: PostgreSQL-Datenbank. Deine Daten sind sicher.",
  },
]

export function FeaturesGrid() {
  return (
    <section id="features" className="px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-16 text-center">
          <Badge variant="secondary" className="mb-4">
            Features
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Alles was du brauchst</h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Von der Planung bis zum Deployment - AgentForge bietet alle Tools für professionelle KI-gestützte
            Entwicklung.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <Card
              key={feature.title}
              className={`group border-border bg-card p-6 transition-all hover:border-primary/50 ${feature.isNew ? "ring-1 ring-primary/30" : ""}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-secondary transition-colors group-hover:bg-primary">
                  <feature.icon className="h-5 w-5 text-foreground transition-colors group-hover:text-primary-foreground" />
                </div>
                {feature.isNew && (
                  <Badge className="bg-primary/20 text-primary text-xs">Neu</Badge>
                )}
              </div>
              <h3 className="mb-2 font-semibold">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">{feature.description}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
