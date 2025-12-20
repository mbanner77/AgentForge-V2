import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, Sparkles, Bot, Store, Server, Users, Building2, Zap, Shield, Play } from "lucide-react"
import Link from "next/link"

export function HeroSection() {
  return (
    <section className="relative overflow-hidden px-4 py-24 sm:px-6 lg:px-8">
      {/* Animated gradient background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/4">
          <div className="h-[600px] w-[900px] rounded-full bg-gradient-to-r from-primary/20 via-accent/30 to-primary/20 opacity-50 blur-[120px] animate-pulse" />
        </div>
        <div className="absolute right-0 top-1/2 -translate-y-1/2">
          <div className="h-[400px] w-[400px] rounded-full bg-blue-500/10 blur-[100px]" />
        </div>
        <div className="absolute left-0 bottom-0">
          <div className="h-[300px] w-[300px] rounded-full bg-purple-500/10 blur-[80px]" />
        </div>
      </div>

      <div className="relative mx-auto max-w-6xl text-center">
        {/* Version Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-4 py-1.5 text-sm backdrop-blur-sm">
          <Sparkles className="h-4 w-4 text-yellow-500 animate-pulse" />
          <span>Powered by Multi-Agent AI</span>
          <Badge variant="secondary" className="ml-2 bg-green-500/20 text-green-400 text-xs">v2.0</Badge>
        </div>

        {/* Main Headline */}
        <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-7xl">
          Baue Apps mit
          <br />
          <span className="bg-gradient-to-r from-primary via-blue-400 to-purple-400 bg-clip-text text-transparent">
            intelligenten Agenten.
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground sm:text-xl">
          Die vollständig konfigurierbare KI-Plattform für App-Entwicklung. 
          Multi-Agenten-Workflows, SAP Integration, MCP Server und Live-Preview in einer Oberfläche.
        </p>

        {/* Feature Pills */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-sm">
          <div className="flex items-center gap-2 rounded-full bg-blue-500/10 border border-blue-500/20 px-4 py-2 text-blue-400">
            <Bot className="h-4 w-4" />
            <span>20+ Agenten</span>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-purple-500/10 border border-purple-500/20 px-4 py-2 text-purple-400">
            <Server className="h-4 w-4" />
            <span>24 MCP Server</span>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 px-4 py-2 text-cyan-400">
            <Building2 className="h-4 w-4" />
            <span>SAP Integration</span>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-green-500/10 border border-green-500/20 px-4 py-2 text-green-400">
            <Zap className="h-4 w-4" />
            <span>Streaming</span>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-orange-500/10 border border-orange-500/20 px-4 py-2 text-orange-400">
            <Shield className="h-4 w-4" />
            <span>Security Scan</span>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button size="lg" className="group bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90 text-white shadow-lg shadow-primary/25" asChild>
            <Link href="/builder">
              <Play className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform" />
              Builder starten
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </Button>
          <Button variant="outline" size="lg" className="border-border/50 hover:bg-secondary/80" asChild>
            <Link href="/docs">
              Dokumentation
            </Link>
          </Button>
          <Button variant="ghost" size="lg" asChild>
            <Link href="/admin">
              <Store className="mr-2 h-4 w-4" />
              Marketplace
            </Link>
          </Button>
        </div>

        {/* Stats */}
        <div className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-4 max-w-3xl mx-auto">
          <div className="rounded-xl border border-border/50 bg-card/50 p-4 backdrop-blur-sm">
            <div className="text-3xl font-bold text-primary">20+</div>
            <div className="text-sm text-muted-foreground">KI-Agenten</div>
          </div>
          <div className="rounded-xl border border-border/50 bg-card/50 p-4 backdrop-blur-sm">
            <div className="text-3xl font-bold text-blue-400">24</div>
            <div className="text-sm text-muted-foreground">MCP Server</div>
          </div>
          <div className="rounded-xl border border-border/50 bg-card/50 p-4 backdrop-blur-sm">
            <div className="text-3xl font-bold text-purple-400">4</div>
            <div className="text-sm text-muted-foreground">SAP Agenten</div>
          </div>
          <div className="rounded-xl border border-border/50 bg-card/50 p-4 backdrop-blur-sm">
            <div className="text-3xl font-bold text-green-400">∞</div>
            <div className="text-sm text-muted-foreground">Workflows</div>
          </div>
        </div>
      </div>
    </section>
  )
}
