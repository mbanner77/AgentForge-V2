import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, Sparkles, Bot, Store, Server, Users } from "lucide-react"
import Link from "next/link"

export function HeroSection() {
  return (
    <section className="relative overflow-hidden px-4 py-24 sm:px-6 lg:px-8">
      {/* Gradient background effect */}
      <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2">
        <div className="h-[500px] w-[800px] rounded-full bg-accent opacity-30 blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-5xl text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-4 py-1.5 text-sm">
          <Sparkles className="h-4 w-4 text-accent-foreground" />
          <span>Powered by AI Agents</span>
          <Badge variant="secondary" className="ml-2 bg-primary/20 text-primary text-xs">v2.0</Badge>
        </div>

        <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-7xl">
          Baue Apps mit
          <br />
          <span className="bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
            intelligenten Agenten.
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground sm:text-xl">
          AgentForge ist die vollständig konfigurierbare Plattform zum Erstellen von Apps. 
          Erweitere dein Team mit Agenten aus dem Marketplace und verbinde externe Dienste über MCP Server.
        </p>

        {/* Feature Highlights */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 rounded-full bg-secondary/50 px-3 py-1.5">
            <Bot className="h-4 w-4 text-primary" />
            <span>20+ Agenten</span>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-secondary/50 px-3 py-1.5">
            <Server className="h-4 w-4 text-primary" />
            <span>24 MCP Server</span>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-secondary/50 px-3 py-1.5">
            <Users className="h-4 w-4 text-primary" />
            <span>Benutzerverwaltung</span>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-secondary/50 px-3 py-1.5">
            <Store className="h-4 w-4 text-primary" />
            <span>Marketplace</span>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button size="lg" asChild>
            <Link href="/builder">
              Jetzt starten
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/admin">
              Marketplace öffnen
            </Link>
          </Button>
        </div>

      </div>
    </section>
  )
}
