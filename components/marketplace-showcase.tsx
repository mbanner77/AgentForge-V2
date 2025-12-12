"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  Bot, 
  TestTube, 
  FileText, 
  Shield, 
  Zap, 
  Globe, 
  Database, 
  Network,
  ArrowRight,
  Star,
  Download
} from "lucide-react"
import Link from "next/link"

const showcaseAgents = [
  {
    icon: TestTube,
    name: "Test Agent",
    description: "Generiert automatisch Unit- und Integrationstests für deinen Code.",
    category: "Testing",
    color: "text-green-500",
    downloads: "2.5k",
    rating: 4.8,
  },
  {
    icon: FileText,
    name: "Documentation Agent",
    description: "Erstellt automatisch JSDoc, README und API-Dokumentation.",
    category: "Dokumentation",
    color: "text-blue-500",
    downloads: "3.2k",
    rating: 4.9,
  },
  {
    icon: Shield,
    name: "Security Agent",
    description: "Analysiert Code auf Sicherheitslücken und gibt Empfehlungen.",
    category: "Sicherheit",
    color: "text-orange-500",
    downloads: "4.1k",
    rating: 4.7,
  },
  {
    icon: Zap,
    name: "Performance Agent",
    description: "Optimiert Code für bessere Performance und Effizienz.",
    category: "Optimierung",
    color: "text-yellow-500",
    downloads: "1.8k",
    rating: 4.6,
  },
]

const showcaseMcpServers = [
  {
    icon: Database,
    name: "PostgreSQL MCP",
    description: "Direkter Datenbankzugriff für Agenten",
    category: "Datenbank",
  },
  {
    icon: Globe,
    name: "Brave Search MCP",
    description: "Web-Suche für aktuelle Informationen",
    category: "Suche",
  },
  {
    icon: Network,
    name: "GitHub MCP",
    description: "Repository-Verwaltung und Code-Suche",
    category: "Entwicklung",
  },
]

export function MarketplaceShowcase() {
  return (
    <section className="px-4 py-24 sm:px-6 lg:px-8 bg-secondary/30">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-16 text-center">
          <Badge variant="secondary" className="mb-4">
            <Bot className="h-3 w-3 mr-1" />
            Marketplace
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Erweitere dein Agent-Team
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Installiere spezialisierte Agenten und MCP Server aus dem Marketplace. 
            Passe sie an deine Bedürfnisse an und integriere sie in deinen Workflow.
          </p>
        </div>

        {/* Agents Grid */}
        <div className="mb-12">
          <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Beliebte Agenten
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {showcaseAgents.map((agent) => (
              <Card
                key={agent.name}
                className="group border-border bg-card p-5 transition-all hover:border-primary/50 hover:shadow-lg"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg bg-secondary ${agent.color}`}>
                    <agent.icon className="h-5 w-5" />
                  </div>
                  <Badge variant="outline" className="text-xs">{agent.category}</Badge>
                </div>
                <h4 className="font-semibold mb-1">{agent.name}</h4>
                <p className="text-sm text-muted-foreground mb-3">{agent.description}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Download className="h-3 w-3" />
                    {agent.downloads}
                  </span>
                  <span className="flex items-center gap-1">
                    <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                    {agent.rating}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* MCP Servers */}
        <div className="mb-12">
          <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
            <Network className="h-5 w-5 text-primary" />
            MCP Server
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            {showcaseMcpServers.map((server) => (
              <Card
                key={server.name}
                className="group border-border bg-card p-5 transition-all hover:border-primary/50"
              >
                <div className="flex items-center gap-3">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-primary">
                    <server.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold">{server.name}</h4>
                    <p className="text-xs text-muted-foreground">{server.description}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <Link href="/admin">
            <Button size="lg" className="gap-2">
              Marketplace öffnen
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <p className="mt-3 text-sm text-muted-foreground">
            20+ Agenten und 24+ MCP Server verfügbar
          </p>
        </div>
      </div>
    </section>
  )
}
