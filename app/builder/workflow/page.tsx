"use client"

import { useState, useCallback } from "react"
import { WorkflowDesigner } from "@/components/workflow-designer"
import { WorkflowEngine, WORKFLOW_TEMPLATES } from "@/lib/workflow-engine"
import { useAgentStore } from "@/lib/agent-store"
import { useAgentExecutor } from "@/lib/agent-executor-real"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { 
  ArrowLeft, 
  Play, 
  Pause, 
  Square, 
  CheckCircle2, 
  XCircle, 
  Clock,
  Users,
  Loader2,
  LayoutTemplate,
} from "lucide-react"
import Link from "next/link"
import type { 
  WorkflowGraph, 
  WorkflowExecutionState, 
  HumanDecisionOption 
} from "@/lib/types"

export default function WorkflowPage() {
  const { addLog, addMessage } = useAgentStore()
  const { executeWorkflow: executeAgentWorkflow } = useAgentExecutor()
  
  const [currentWorkflow, setCurrentWorkflow] = useState<WorkflowGraph | null>(null)
  const [executionState, setExecutionState] = useState<WorkflowExecutionState | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)
  const [showTemplates, setShowTemplates] = useState(true)
  const [showHumanDecision, setShowHumanDecision] = useState(false)
  const [pendingDecision, setPendingDecision] = useState<{
    nodeId: string
    question: string
    options: HumanDecisionOption[]
    resolve: (optionId: string) => void
  } | null>(null)
  
  // Workflow Engine Instanz
  const [engine, setEngine] = useState<WorkflowEngine | null>(null)

  // Template auswählen
  const selectTemplate = (templateId: string) => {
    const template = WORKFLOW_TEMPLATES[templateId]
    if (template) {
      setCurrentWorkflow({
        ...template,
        id: crypto.randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      setShowTemplates(false)
    }
  }

  // Neuen leeren Workflow erstellen
  const createNewWorkflow = () => {
    setCurrentWorkflow({
      id: crypto.randomUUID(),
      name: "Neuer Workflow",
      description: "",
      nodes: [
        { id: "start", type: "start", position: { x: 100, y: 200 }, data: { label: "Start" } },
        { id: "end", type: "end", position: { x: 500, y: 200 }, data: { label: "Ende" } },
      ],
      edges: [],
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    setShowTemplates(false)
  }

  // Workflow speichern
  const handleSave = (workflow: WorkflowGraph) => {
    setCurrentWorkflow(workflow)
    // TODO: Persistenz in localStorage oder Server
    localStorage.setItem(`workflow-${workflow.id}`, JSON.stringify(workflow))
    addLog({
      level: "info",
      agent: "system",
      message: `Workflow "${workflow.name}" gespeichert`,
    })
  }

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

  // Human Decision auswählen
  const selectDecision = (optionId: string) => {
    if (pendingDecision) {
      pendingDecision.resolve(optionId)
      setPendingDecision(null)
      setShowHumanDecision(false)
    }
  }

  // Workflow ausführen
  const handleExecute = async (workflow: WorkflowGraph) => {
    if (isExecuting) return
    
    setIsExecuting(true)
    setCurrentWorkflow(workflow)
    
    addMessage({
      role: "assistant",
      content: `🚀 Starte Workflow "${workflow.name}"...`,
      agent: "system",
    })

    // Erstelle Engine
    const newEngine = new WorkflowEngine(workflow, {
      onStateChange: (state) => {
        setExecutionState(state)
      },
      onAgentExecute: async (agentId, previousOutput) => {
        addLog({
          level: "info",
          agent: "system",
          message: `Führe Agent aus: ${agentId}`,
        })
        
        // Hier würde der eigentliche Agent ausgeführt werden
        // Für jetzt simulieren wir das
        await new Promise(resolve => setTimeout(resolve, 1000))
        return `Output von ${agentId}: Aufgabe erfolgreich ausgeführt.`
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
        content: `✅ Workflow "${workflow.name}" erfolgreich abgeschlossen!`,
        agent: "system",
      })
    } catch (error) {
      addMessage({
        role: "assistant",
        content: `❌ Workflow-Fehler: ${error}`,
        agent: "system",
      })
    } finally {
      setIsExecuting(false)
    }
  }

  // Workflow stoppen
  const stopWorkflow = () => {
    if (engine) {
      engine.stop()
      setIsExecuting(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-4">
          <Link href="/builder">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Zurück zum Builder
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold">Workflow Designer</h1>
            <p className="text-sm text-muted-foreground">
              Erstelle komplexe Workflows mit Human-in-the-Loop Entscheidungen
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {currentWorkflow && (
            <>
              <Badge variant="outline">
                {currentWorkflow.nodes.length} Nodes
              </Badge>
              <Badge variant="outline">
                {currentWorkflow.edges.length} Verbindungen
              </Badge>
            </>
          )}
          
          {isExecuting && (
            <Badge className="bg-green-600">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Läuft
            </Badge>
          )}
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => {
              setCurrentWorkflow(null)
              setShowTemplates(true)
            }}
          >
            <LayoutTemplate className="h-4 w-4 mr-2" />
            Templates
          </Button>
        </div>
      </div>

      {/* Content */}
      {showTemplates && !currentWorkflow ? (
        <div className="flex-1 p-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">Workflow auswählen</h2>
              <p className="text-muted-foreground">
                Wähle eine Vorlage oder erstelle einen neuen Workflow
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              {Object.entries(WORKFLOW_TEMPLATES).map(([id, template]) => (
                <Card 
                  key={id}
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => selectTemplate(id)}
                >
                  <CardHeader>
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                    <CardDescription>{template.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2 flex-wrap">
                      <Badge variant="secondary">
                        {template.nodes.length} Nodes
                      </Badge>
                      <Badge variant="secondary">
                        {template.nodes.filter(n => n.type === "agent").length} Agenten
                      </Badge>
                      {template.nodes.some(n => n.type === "human-decision") && (
                        <Badge className="bg-purple-500/20 text-purple-500">
                          <Users className="h-3 w-3 mr-1" />
                          Human Decision
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="text-center">
              <Button size="lg" onClick={createNewWorkflow}>
                Leeren Workflow erstellen
              </Button>
            </div>
          </div>
        </div>
      ) : currentWorkflow ? (
        <div className="flex-1 overflow-hidden">
          <WorkflowDesigner
            initialWorkflow={currentWorkflow}
            onSave={handleSave}
            onExecute={handleExecute}
          />
        </div>
      ) : null}

      {/* Execution Status Panel */}
      {executionState && isExecuting && (
        <div className="absolute bottom-4 right-4 w-80">
          <Card className="shadow-lg">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Workflow Ausführung</CardTitle>
                <Button variant="ghost" size="icon" onClick={stopWorkflow}>
                  <Square className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className={
                    executionState.status === "running" ? "bg-blue-500" :
                    executionState.status === "waiting-human" ? "bg-purple-500" :
                    executionState.status === "completed" ? "bg-green-500" :
                    executionState.status === "error" ? "bg-red-500" :
                    "bg-gray-500"
                  }>
                    {executionState.status === "running" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    {executionState.status === "waiting-human" && <Users className="h-3 w-3 mr-1" />}
                    {executionState.status === "completed" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                    {executionState.status === "error" && <XCircle className="h-3 w-3 mr-1" />}
                    {executionState.status}
                  </Badge>
                </div>
                
                <div className="text-sm text-muted-foreground">
                  <p>Besuchte Nodes: {executionState.visitedNodes.length}</p>
                  {executionState.currentNodeId && (
                    <p>Aktuell: {currentWorkflow?.nodes.find(n => n.id === executionState.currentNodeId)?.data.label}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Human Decision Dialog */}
      <Dialog open={showHumanDecision} onOpenChange={setShowHumanDecision}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-purple-500" />
              Entscheidung erforderlich
            </DialogTitle>
            <DialogDescription>
              {pendingDecision?.question}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-3 py-4">
            {pendingDecision?.options.map((option) => (
              <Button
                key={option.id}
                variant="outline"
                className="justify-start h-auto py-3 px-4"
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
    </div>
  )
}
