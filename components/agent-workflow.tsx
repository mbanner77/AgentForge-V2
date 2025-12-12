"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Brain, Code2, Eye, Play, ArrowRight } from "lucide-react"

const agents = [
  {
    id: "planner",
    name: "Planner Agent",
    description: "Nimmt den User-Request entgegen und zerlegt ihn in strukturierte Tasks und Steps.",
    icon: Brain,
    color: "bg-chart-1",
    tasks: ["Analyse Codebase", "Design ändern", "Tasks priorisieren"],
  },
  {
    id: "coder",
    name: "Coder Agent",
    description: "Arbeitet den Plan ab, liest und schreibt Code, nutzt Tools für Code-Suche und Refactoring.",
    icon: Code2,
    color: "bg-chart-2",
    tasks: ["Code schreiben", "Dateien anpassen", "Refactoring"],
  },
  {
    id: "reviewer",
    name: "Reviewer Agent",
    description: "Prüft Diffs und Pull Requests auf Stil, Architektur und Bugs. Gibt Feedback.",
    icon: Eye,
    color: "bg-chart-3",
    tasks: ["Code Review", "Qualitätsprüfung", "Feedback geben"],
  },
  {
    id: "executor",
    name: "Executor Agent",
    description: "Führt Tests aus, baut Artefakte, erstellt Commits und Pull Requests.",
    icon: Play,
    color: "bg-chart-4",
    tasks: ["Tests ausführen", "Build erstellen", "Deployment"],
  },
]

export function AgentWorkflow() {
  return (
    <section id="workflow" className="border-t border-border bg-secondary/30 px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-16 text-center">
          <Badge variant="secondary" className="mb-4">
            Agentic Workflow
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Intelligente Agenten arbeiten zusammen</h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Unser Multi-Agent-System koordiniert verschiedene spezialisierte KI-Agenten, um komplexe
            Entwicklungsaufgaben automatisch zu lösen.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {agents.map((agent, index) => (
            <div key={agent.id} className="relative">
              <Card className="h-full border-border bg-card p-6 transition-all hover:border-primary/50 hover:shadow-lg">
                <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg ${agent.color}`}>
                  <agent.icon className="h-6 w-6 text-background" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">{agent.name}</h3>
                <p className="mb-4 text-sm text-muted-foreground">{agent.description}</p>
                <div className="flex flex-wrap gap-2">
                  {agent.tasks.map((task) => (
                    <Badge key={task} variant="outline" className="text-xs">
                      {task}
                    </Badge>
                  ))}
                </div>
              </Card>
              {index < agents.length - 1 && (
                <div className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 lg:block">
                  <ArrowRight className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
