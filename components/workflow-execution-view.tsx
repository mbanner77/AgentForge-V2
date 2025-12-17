"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Play,
  Pause,
  Square,
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  Brain,
  Loader2,
  ChevronRight,
  AlertCircle,
  ArrowRight,
} from "lucide-react"
import type { 
  WorkflowGraph, 
  WorkflowExecutionState, 
  WorkflowNode,
  HumanDecisionOption,
  WorkflowStepResult,
} from "@/lib/types"
import { WorkflowEngine } from "@/lib/workflow-engine"
import { useAgentStore } from "@/lib/agent-store"
import { useAgentExecutor } from "@/lib/agent-executor-real"

interface WorkflowExecutionViewProps {
  workflow: WorkflowGraph
  onComplete?: () => void
  onClose?: () => void
}

// Node-Typ Icons
const NODE_ICONS: Record<string, typeof Brain> = {
  start: Play,
  end: Square,
  agent: Brain,
  "human-decision": Users,
  condition: ArrowRight,
  parallel: ArrowRight,
  merge: ArrowRight,
  loop: ArrowRight,
  delay: Clock,
}

export function WorkflowExecutionView({ workflow, onComplete, onClose }: WorkflowExecutionViewProps) {
  const { addLog, addMessage, setWorkflowExecutionState } = useAgentStore()
  const { executeWorkflow: executeAgentWorkflow } = useAgentExecutor()
  
  const [executionState, setExecutionState] = useState<WorkflowExecutionState>({
    workflowId: workflow.id,
    currentNodeId: null,
    visitedNodes: [],
    nodeOutputs: {},
    nodeResults: {},
    status: "idle",
  })
  const [engine, setEngine] = useState<WorkflowEngine | null>(null)
  const [showHumanDecision, setShowHumanDecision] = useState(false)
  const [pendingDecision, setPendingDecision] = useState<{
    nodeId: string
    question: string
    options: HumanDecisionOption[]
    resolve: (optionId: string) => void
  } | null>(null)

  // Progress berechnen
  const progress = workflow.nodes.length > 0 
    ? Math.round((executionState.visitedNodes.length / workflow.nodes.length) * 100)
    : 0

  // Human Decision Handler
  const handleHumanDecision = useCallback((
    nodeId: string, 
    question: string, 
    options: HumanDecisionOption[]
  ): Promise<string> => {
    return new Promise((resolve) => {
      setPendingDecision({ nodeId, question, options, resolve })
      setShowHumanDecision(true)
    })
  }, [])

  // Decision auswählen
  const selectDecision = (optionId: string) => {
    if (pendingDecision) {
      pendingDecision.resolve(optionId)
      setPendingDecision(null)
      setShowHumanDecision(false)
    }
  }

  // Workflow starten
  const startWorkflow = async () => {
    addMessage({
      role: "assistant",
      content: `🚀 Starte Workflow **"${workflow.name}"** mit ${workflow.nodes.length} Schritten...`,
      agent: "system",
    })

    const newEngine = new WorkflowEngine(workflow, {
      onStateChange: (state) => {
        setExecutionState(state)
        setWorkflowExecutionState(state)
      },
      onAgentExecute: async (agentId, previousOutput) => {
        addLog({
          level: "info",
          agent: "system",
          message: `Führe Agent aus: ${agentId}`,
        })
        
        // Hier wird der echte Agent ausgeführt
        // Für jetzt simulieren wir das mit einer Verzögerung
        await new Promise(resolve => setTimeout(resolve, 1500))
        
        const output = `Agent ${agentId} hat die Aufgabe erfolgreich bearbeitet.`
        
        addMessage({
          role: "assistant",
          content: `✅ **${agentId}** abgeschlossen`,
          agent: agentId as any,
        })
        
        return output
      },
      onHumanDecision: handleHumanDecision,
      onLog: (message, level) => {
        addLog({ level, agent: "system", message })
      },
    })

    setEngine(newEngine)
    
    try {
      await newEngine.start()
      
      addMessage({
        role: "assistant",
        content: `✅ Workflow **"${workflow.name}"** erfolgreich abgeschlossen!`,
        agent: "system",
      })
      
      onComplete?.()
    } catch (error) {
      addMessage({
        role: "assistant",
        content: `❌ Workflow-Fehler: ${error}`,
        agent: "system",
      })
    }
  }

  // Workflow stoppen
  const stopWorkflow = () => {
    if (engine) {
      engine.stop()
      addMessage({
        role: "assistant",
        content: `⏹️ Workflow **"${workflow.name}"** wurde gestoppt.`,
        agent: "system",
      })
    }
  }

  // Auto-Start wenn idle
  useEffect(() => {
    if (executionState.status === "idle") {
      startWorkflow()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Status Badge
  const getStatusBadge = () => {
    switch (executionState.status) {
      case "running":
        return <Badge className="bg-blue-500"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Läuft</Badge>
      case "waiting-human":
        return <Badge className="bg-purple-500"><Users className="h-3 w-3 mr-1" />Wartet auf Eingabe</Badge>
      case "completed":
        return <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Abgeschlossen</Badge>
      case "error":
        return <Badge className="bg-red-500"><XCircle className="h-3 w-3 mr-1" />Fehler</Badge>
      case "paused":
        return <Badge className="bg-yellow-500"><Pause className="h-3 w-3 mr-1" />Pausiert</Badge>
      default:
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Bereit</Badge>
    }
  }

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              {workflow.name}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {workflow.description || `${workflow.nodes.length} Schritte`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge()}
            {executionState.status === "running" && (
              <Button variant="ghost" size="icon" onClick={stopWorkflow}>
                <Square className="h-4 w-4" />
              </Button>
            )}
            {onClose && executionState.status !== "running" && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                Schließen
              </Button>
            )}
          </div>
        </div>
        
        {/* Progress */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-muted-foreground">Fortschritt</span>
            <span className="font-medium">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      </CardHeader>
      
      <CardContent>
        {/* Workflow-Visualisierung */}
        <ScrollArea className="h-[200px]">
          <div className="flex flex-wrap gap-2">
            {workflow.nodes.map((node, index) => {
              const Icon = NODE_ICONS[node.type] || Brain
              const isVisited = executionState.visitedNodes.includes(node.id)
              const isCurrent = executionState.currentNodeId === node.id
              const result = executionState.nodeResults[node.id]
              
              return (
                <div key={node.id} className="flex items-center gap-1">
                  <div
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                      isCurrent 
                        ? "border-primary bg-primary/10 animate-pulse" 
                        : isVisited 
                          ? result?.success 
                            ? "border-green-500/50 bg-green-500/10"
                            : "border-orange-500/50 bg-orange-500/10"
                          : "border-border bg-muted/30"
                    }`}
                  >
                    {isCurrent ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : isVisited ? (
                      result?.success ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-orange-500" />
                      )
                    ) : (
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className={`text-sm ${isCurrent ? "font-medium" : ""}`}>
                      {node.data.label}
                    </span>
                  </div>
                  {index < workflow.nodes.length - 1 && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              )
            })}
          </div>
        </ScrollArea>

        {/* Aktueller Status */}
        {executionState.currentNodeId && (
          <div className="mt-4 p-3 bg-muted/30 rounded-lg">
            <p className="text-sm">
              <span className="text-muted-foreground">Aktueller Schritt:</span>{" "}
              <span className="font-medium">
                {workflow.nodes.find(n => n.id === executionState.currentNodeId)?.data.label}
              </span>
            </p>
          </div>
        )}

        {/* Ergebnis-Summary */}
        {executionState.status === "completed" && Object.keys(executionState.nodeResults).length > 0 && (
          <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
            <p className="text-sm font-medium text-green-600 mb-2">Workflow abgeschlossen</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                {Object.values(executionState.nodeResults).filter(r => r.success).length} erfolgreich
              </Badge>
              <Badge variant="secondary">
                {Object.values(executionState.nodeResults).filter(r => !r.success).length} mit Problemen
              </Badge>
            </div>
          </div>
        )}
      </CardContent>

      {/* Human Decision Dialog */}
      <Dialog open={showHumanDecision} onOpenChange={setShowHumanDecision}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-purple-500" />
              Entscheidung erforderlich
            </DialogTitle>
          </DialogHeader>
          
          {/* Vorheriges Ergebnis */}
          {executionState.humanDecisionPending?.previousResult && (
            <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-2">
              <div className="font-medium text-muted-foreground">Ergebnis des vorherigen Schritts:</div>
              <div className="flex flex-wrap gap-2">
                {executionState.humanDecisionPending.previousResult.metadata?.filesGenerated?.length ? (
                  <Badge variant="secondary" className="bg-green-500/20 text-green-600">
                    {executionState.humanDecisionPending.previousResult.metadata.filesGenerated.length} Datei(en)
                  </Badge>
                ) : null}
                {executionState.humanDecisionPending.previousResult.metadata?.errorsFound?.length ? (
                  <Badge variant="secondary" className="bg-red-500/20 text-red-600">
                    {executionState.humanDecisionPending.previousResult.metadata.errorsFound.length} Fehler
                  </Badge>
                ) : null}
                {executionState.humanDecisionPending.previousResult.success ? (
                  <Badge variant="secondary" className="bg-green-500/20 text-green-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Erfolgreich
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-orange-500/20 text-orange-600">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Mit Problemen
                  </Badge>
                )}
              </div>
            </div>
          )}
          
          <DialogDescription className="whitespace-pre-wrap">
            {pendingDecision?.question}
          </DialogDescription>
          
          <div className="grid gap-3 py-2">
            {pendingDecision?.options.map((option) => (
              <Button
                key={option.id}
                variant="outline"
                className="justify-start h-auto py-3 px-4 hover:border-primary"
                onClick={() => selectDecision(option.id)}
              >
                <div className="text-left">
                  <div className="font-medium">{option.label}</div>
                  {option.description && (
                    <div className="text-sm text-muted-foreground">{option.description}</div>
                  )}
                </div>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
