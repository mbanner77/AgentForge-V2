"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Brain, Code2, Eye, Play, Check, Loader2, Circle, AlertCircle, Clock, Shield, TestTube, FileText, Zap, Globe, Database, Network, RefreshCw, Container, Accessibility } from "lucide-react"
import type { WorkflowStep, AgentStatus, AgentType } from "@/lib/types"
import { useAgentStore } from "@/lib/agent-store"
import { marketplaceAgents } from "@/lib/marketplace-agents"

interface BuilderWorkflowProps {
  steps: WorkflowStep[]
}

// Icon Map für alle Agenten
const iconMap: Record<string, typeof Brain> = {
  Brain,
  Code2,
  Eye,
  Shield,
  Play,
  TestTube,
  FileText,
  Zap,
  Globe,
  Database,
  Network,
  RefreshCw,
  Container,
  Accessibility,
}

// Funktion um Agent-Info aus Marketplace zu holen
const getAgentInfo = (agentId: string) => {
  const marketplaceAgent = marketplaceAgents.find(a => a.id === agentId)
  if (marketplaceAgent) {
    return {
      icon: iconMap[marketplaceAgent.icon] || Brain,
      // Konvertiere text-color zu bg-color
      bgColor: marketplaceAgent.color.replace("text-", "bg-"),
    }
  }
  return {
    icon: Brain,
    bgColor: "bg-gray-500",
  }
}

const statusConfig: Record<AgentStatus, { icon: typeof Check; className: string; label: string; bgClass: string }> = {
  idle: {
    icon: Circle,
    className: "text-muted-foreground",
    label: "Wartend",
    bgClass: "bg-muted",
  },
  waiting: {
    icon: Clock,
    className: "text-muted-foreground",
    label: "In Warteschlange",
    bgClass: "bg-muted",
  },
  running: {
    icon: Loader2,
    className: "text-primary animate-spin",
    label: "Läuft",
    bgClass: "bg-primary/10",
  },
  completed: {
    icon: Check,
    className: "text-green-500",
    label: "Fertig",
    bgClass: "bg-green-500/10",
  },
  error: {
    icon: AlertCircle,
    className: "text-destructive",
    label: "Fehler",
    bgClass: "bg-destructive/10",
  },
}

export function BuilderWorkflow({ steps }: BuilderWorkflowProps) {
  const { currentAgent, logs } = useAgentStore()

  if (steps.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <div className="mb-4 rounded-full bg-secondary p-6">
          <Brain className="h-10 w-10 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">Kein aktiver Workflow</h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Beschreibe im Chat, welche App du bauen möchtest, und beobachte hier, wie die Agenten zusammenarbeiten.
        </p>
        <div className="mt-6 grid grid-cols-4 gap-4">
          {(["planner", "coder", "reviewer", "executor"] as AgentType[]).map((agent) => {
            const agentInfo = getAgentInfo(agent)
            const Icon = agentInfo.icon
            return (
              <div key={agent} className="flex flex-col items-center gap-2">
                <div className={`rounded-lg p-2 ${agentInfo.bgColor}`}>
                  <Icon className="h-5 w-5 text-background" />
                </div>
                <span className="text-xs capitalize text-muted-foreground">{agent}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const completedSteps = steps.filter((s) => s.status === "completed").length
  const progress = (completedSteps / steps.length) * 100

  return (
    <div className="space-y-6">
      {/* Progress Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Workflow Status</h3>
          <Badge variant={progress === 100 ? "default" : "secondary"}>
            {completedSteps}/{steps.length} abgeschlossen
          </Badge>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Steps */}
      <div className="relative space-y-4">
        {/* Connection line */}
        <div className="absolute left-5 top-8 h-[calc(100%-4rem)] w-0.5 bg-border" />

        {steps.map((step) => {
          const agentInfo = getAgentInfo(step.agent)
          const AgentIcon = agentInfo.icon
          const StatusIcon = statusConfig[step.status].icon
          const isActive = step.status === "running"

          return (
            <Card
              key={step.id}
              className={`relative border transition-all ${
                isActive
                  ? "border-primary shadow-lg shadow-primary/10"
                  : step.status === "error"
                    ? "border-destructive"
                    : "border-border"
              } ${statusConfig[step.status].bgClass}`}
            >
              <div className="p-4">
                <div className="flex items-start gap-4">
                  <div
                    className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${agentInfo.bgColor}`}
                  >
                    <AgentIcon className="h-5 w-5 text-background" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-medium">{step.title}</h4>
                      <Badge variant={step.status === "completed" ? "default" : "secondary"} className="shrink-0">
                        <StatusIcon className={`mr-1 h-3 w-3 ${statusConfig[step.status].className}`} />
                        {statusConfig[step.status].label}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>

                    {/* Timing info */}
                    {step.startTime && (
                      <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Start: {new Date(step.startTime).toLocaleTimeString("de-DE")}</span>
                        {step.endTime && (
                          <>
                            <span>Ende: {new Date(step.endTime).toLocaleTimeString("de-DE")}</span>
                            <span>
                              Dauer:{" "}
                              {Math.round(
                                (new Date(step.endTime).getTime() - new Date(step.startTime).getTime()) / 1000,
                              )}
                              s
                            </span>
                          </>
                        )}
                      </div>
                    )}

                    {/* Error message */}
                    {step.error && (
                      <div className="mt-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive">{step.error}</div>
                    )}

                    {/* Output preview */}
                    {step.output && step.status === "completed" && (
                      <div className="mt-2 rounded-md bg-secondary/50 p-2 text-xs text-muted-foreground line-clamp-2">
                        {step.output}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Recent Logs */}
      {logs.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Letzte Logs</h4>
          <div className="max-h-32 overflow-auto rounded-lg bg-secondary/50 p-3 font-mono text-xs">
            {logs.slice(-5).map((log) => (
              <div
                key={log.id}
                className={`${
                  log.level === "error"
                    ? "text-destructive"
                    : log.level === "warn"
                      ? "text-yellow-500"
                      : "text-muted-foreground"
                }`}
              >
                [{new Date(log.timestamp).toLocaleTimeString("de-DE")}] [{log.agent}] {log.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
