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
  Circle,
  AlertCircle,
  ArrowRight,
  FileSearch,
  Code2,
  Eye,
  Shield,
  GitBranch,
  ChevronRight,
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
  initialPrompt?: string // Der initiale Auftrag aus dem Chat
  autoStart?: boolean // Ob der Workflow automatisch starten soll
  onComplete?: () => void
  onClose?: () => void
  onStart?: () => void // Callback wenn Workflow gestartet wird
}

// Node-Typ Icons
const NODE_ICONS: Record<string, typeof Brain> = {
  start: Play,
  end: Square,
  agent: Brain,
  "human-decision": Users,
  condition: GitBranch,
  parallel: ArrowRight,
  merge: ArrowRight,
  loop: ArrowRight,
  delay: Clock,
}

// Agent Icons
const AGENT_ICONS: Record<string, typeof Brain> = {
  planner: Brain,
  coder: Code2,
  reviewer: Eye,
  security: Shield,
  executor: Play,
}

// Agent Farben
const AGENT_COLORS: Record<string, string> = {
  planner: "bg-blue-500",
  coder: "bg-green-500",
  reviewer: "bg-purple-500",
  security: "bg-orange-500",
  executor: "bg-cyan-500",
}

export function WorkflowExecutionView({ workflow, initialPrompt, autoStart = false, onComplete, onClose, onStart }: WorkflowExecutionViewProps) {
  const { addLog, addMessage, setWorkflowExecutionState, logs } = useAgentStore()
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
  
  // Dialog für Ergebnisdetails
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null)
  const [showResultDialog, setShowResultDialog] = useState(false)

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

  // Workflow starten mit optionalem Auftrag
  const startWorkflow = async (prompt?: string) => {
    const taskPrompt = prompt || initialPrompt
    
    onStart?.()
    
    addMessage({
      role: "assistant",
      content: `🚀 Starte Workflow **"${workflow.name}"** mit ${workflow.nodes.length} Schritten...${taskPrompt ? `\n\n**Auftrag:** ${taskPrompt}` : ""}`,
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
        
        // Der initiale Auftrag wird als Kontext an den ersten Agent übergeben
        const contextForAgent = previousOutput || taskPrompt || ""
        
        // Hier wird der echte Agent ausgeführt
        // Für jetzt simulieren wir das mit einer Verzögerung
        await new Promise(resolve => setTimeout(resolve, 1500))
        
        const output = `Agent ${agentId} hat die Aufgabe erfolgreich bearbeitet.\n\nAuftrag: ${contextForAgent}`
        
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
  
  // Externe Methode zum Starten mit Prompt
  const startWithPrompt = (prompt: string) => {
    if (executionState.status === "idle") {
      startWorkflow(prompt)
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

  // Auto-Start nur wenn autoStart=true und initialPrompt vorhanden
  useEffect(() => {
    if (autoStart && initialPrompt && executionState.status === "idle") {
      startWorkflow(initialPrompt)
    }
  }, [autoStart, initialPrompt]) // eslint-disable-line react-hooks/exhaustive-deps
  
  // Expose startWithPrompt für externe Aufrufe
  useEffect(() => {
    // Registriere die Start-Funktion im Window für Builder-Integration
    (window as any).__workflowStartWithPrompt = startWithPrompt
    return () => {
      delete (window as any).__workflowStartWithPrompt
    }
  }, [executionState.status]) // eslint-disable-line react-hooks/exhaustive-deps

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
      
      <CardContent className="pt-0">
        {/* Workflow-Schritte als vertikale Liste */}
        <div className="relative space-y-3">
          {/* Verbindungslinie */}
          <div className="absolute left-5 top-6 h-[calc(100%-3rem)] w-0.5 bg-border" />

          {workflow.nodes.map((node) => {
            const isVisited = executionState.visitedNodes.includes(node.id)
            const isCurrent = executionState.currentNodeId === node.id
            const result = executionState.nodeResults[node.id]
            const output = executionState.nodeOutputs[node.id]
            
            // Icon und Farbe basierend auf Node-Typ und Agent
            const agentId = node.data.agentId || node.type
            const AgentIcon = AGENT_ICONS[agentId] || NODE_ICONS[node.type] || Brain
            const bgColor = AGENT_COLORS[agentId] || "bg-gray-500"
            
            // Status Icon und Styling
            let StatusIcon = Circle
            let statusClass = "text-muted-foreground"
            let statusLabel = "Wartend"
            let cardBg = "bg-muted/30"
            
            if (isCurrent) {
              StatusIcon = Loader2
              statusClass = "text-primary animate-spin"
              statusLabel = "Läuft"
              cardBg = "bg-primary/5"
            } else if (isVisited) {
              if (result?.success) {
                StatusIcon = CheckCircle2
                statusClass = "text-green-500"
                statusLabel = "Fertig"
                cardBg = "bg-green-500/5"
              } else {
                StatusIcon = AlertCircle
                statusClass = "text-orange-500"
                statusLabel = "Mit Problemen"
                cardBg = "bg-orange-500/5"
              }
            }

            return (
              <Card
                key={node.id}
                className={`relative border transition-all ${
                  isCurrent
                    ? "border-primary shadow-md"
                    : isVisited
                      ? result?.success
                        ? "border-green-500/30"
                        : "border-orange-500/30"
                      : "border-border"
                } ${cardBg}`}
              >
                <div className="p-3">
                  <div className="flex items-start gap-3">
                    {/* Agent Icon */}
                    <div className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${bgColor}`}>
                      <AgentIcon className="h-5 w-5 text-white" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      {/* Header mit Titel und Status */}
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-medium text-sm">{node.data.label}</h4>
                        <Badge variant={isVisited ? "default" : "secondary"} className="shrink-0 text-xs">
                          <StatusIcon className={`mr-1 h-3 w-3 ${statusClass}`} />
                          {statusLabel}
                        </Badge>
                      </div>
                      
                      {/* Beschreibung */}
                      {node.data.description && (
                        <p className="mt-1 text-xs text-muted-foreground">{node.data.description}</p>
                      )}

                      {/* Timing Info */}
                      {result && (
                        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                          <span>Dauer: {Math.round(result.duration / 1000)}s</span>
                          {result.metadata?.filesGenerated?.length ? (
                            <Badge variant="outline" className="text-xs h-5">
                              {result.metadata.filesGenerated.length} Datei(en)
                            </Badge>
                          ) : null}
                          {result.metadata?.errorsFound?.length ? (
                            <Badge variant="outline" className="text-xs h-5 border-orange-500/50 text-orange-500">
                              {result.metadata.errorsFound.length} Fehler
                            </Badge>
                          ) : null}
                        </div>
                      )}

                      {/* Output Preview mit Button */}
                      {output && isVisited && (
                        <div className="mt-2 space-y-2">
                          <div className="rounded-md bg-secondary/50 p-2 text-xs text-muted-foreground line-clamp-2 font-mono">
                            {output}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedNode(node)
                              setShowResultDialog(true)
                            }}
                            className="h-7 text-xs"
                          >
                            <FileSearch className="h-3 w-3 mr-1" />
                            Vollständiges Ergebnis anzeigen
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>

        {/* Letzte Logs */}
        {logs.length > 0 && (
          <div className="mt-4 space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground">Letzte Logs</h4>
            <div className="max-h-24 overflow-auto rounded-lg bg-secondary/50 p-2 font-mono text-xs">
              {logs.slice(-5).map((log) => (
                <div
                  key={log.id}
                  className={`${
                    log.level === "error"
                      ? "text-red-500"
                      : log.level === "warn"
                        ? "text-yellow-500"
                        : "text-muted-foreground"
                  }`}
                >
                  [{new Date(log.timestamp).toLocaleTimeString("de-DE")}] {log.message}
                </div>
              ))}
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

      {/* Ergebnis-Detail Dialog */}
      <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedNode && (
                <>
                  {(() => {
                    const agentId = selectedNode.data.agentId || selectedNode.type
                    const AgentIcon = AGENT_ICONS[agentId] || NODE_ICONS[selectedNode.type] || Brain
                    const bgColor = AGENT_COLORS[agentId] || "bg-gray-500"
                    return (
                      <div className={`rounded-lg p-1.5 ${bgColor}`}>
                        <AgentIcon className="h-4 w-4 text-white" />
                      </div>
                    )
                  })()}
                  <span>{selectedNode.data.label} - Arbeitsergebnis</span>
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedNode && executionState.nodeResults[selectedNode.id] && (
                <span>
                  Dauer: {Math.round(executionState.nodeResults[selectedNode.id].duration / 1000)}s
                  {executionState.nodeResults[selectedNode.id].metadata?.filesGenerated?.length ? (
                    <> • {executionState.nodeResults[selectedNode.id].metadata?.filesGenerated?.length} Datei(en) generiert</>
                  ) : null}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 mt-4">
            <div className="space-y-4">
              {/* Metadaten */}
              {selectedNode && executionState.nodeResults[selectedNode.id]?.metadata && (
                <div className="flex flex-wrap gap-2 pb-3 border-b">
                  {executionState.nodeResults[selectedNode.id].metadata?.filesGenerated?.map((file, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      📄 {file}
                    </Badge>
                  ))}
                  {executionState.nodeResults[selectedNode.id].metadata?.errorsFound?.map((error, i) => (
                    <Badge key={i} variant="destructive" className="text-xs">
                      ⚠️ {error}
                    </Badge>
                  ))}
                </div>
              )}
              
              {/* Vollständige Ausgabe */}
              <div className="rounded-lg border border-border">
                <div className="px-4 py-2 bg-secondary/50 border-b border-border flex items-center justify-between">
                  <span className="font-medium text-sm">Vollständige Ausgabe</span>
                  <Badge variant="outline" className="text-xs">
                    {selectedNode ? (executionState.nodeOutputs[selectedNode.id]?.length || 0) : 0} Zeichen
                  </Badge>
                </div>
                <div className="p-4">
                  <pre className="whitespace-pre-wrap text-sm font-mono bg-background rounded-md p-4 overflow-x-auto max-h-[50vh]">
                    {selectedNode ? (executionState.nodeOutputs[selectedNode.id] || "Keine Ausgabe verfügbar") : ""}
                  </pre>
                </div>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
