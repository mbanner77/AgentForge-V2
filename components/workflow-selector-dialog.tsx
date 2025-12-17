"use client"

import { useState } from "react"
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
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  GitBranch,
  Play,
  Trash2,
  Users,
  Brain,
  Clock,
  FileCode,
  CheckCircle2,
  LayoutTemplate,
} from "lucide-react"
import { useAgentStore } from "@/lib/agent-store"
import { WORKFLOW_TEMPLATES } from "@/lib/workflow-engine"
import type { WorkflowGraph } from "@/lib/types"

interface WorkflowSelectorDialogProps {
  trigger?: React.ReactNode
  onSelectWorkflow: (workflow: WorkflowGraph) => void
}

export function WorkflowSelectorDialog({ trigger, onSelectWorkflow }: WorkflowSelectorDialogProps) {
  const [open, setOpen] = useState(false)
  const { savedWorkflows, deleteWorkflow } = useAgentStore()

  const handleSelect = (workflow: WorkflowGraph) => {
    onSelectWorkflow(workflow)
    setOpen(false)
  }

  const handleSelectTemplate = (templateId: string) => {
    const template = WORKFLOW_TEMPLATES[templateId]
    if (template) {
      // Erstelle eine Kopie des Templates mit neuer ID
      const newWorkflow: WorkflowGraph = {
        ...template,
        id: crypto.randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      onSelectWorkflow(newWorkflow)
      setOpen(false)
    }
  }

  const handleDelete = (e: React.MouseEvent, workflowId: string) => {
    e.stopPropagation()
    if (confirm("Workflow wirklich löschen?")) {
      deleteWorkflow(workflowId)
    }
  }

  // Standard-Workflow (linearer Ablauf basierend auf workflowOrder)
  const { workflowOrder, agentConfigs } = useAgentStore()
  
  const createStandardWorkflow = (): WorkflowGraph => {
    const enabledAgents = workflowOrder.filter(id => {
      const config = agentConfigs[id as keyof typeof agentConfigs]
      return config?.enabled
    })
    
    const nodes = [
      { id: "start", type: "start" as const, position: { x: 50, y: 200 }, data: { label: "Start" } },
      ...enabledAgents.map((agentId, index) => ({
        id: `agent-${agentId}`,
        type: "agent" as const,
        position: { x: 200 + index * 200, y: 200 },
        data: { label: agentConfigs[agentId as keyof typeof agentConfigs]?.name || agentId, agentId }
      })),
      { id: "end", type: "end" as const, position: { x: 200 + enabledAgents.length * 200, y: 200 }, data: { label: "Ende" } },
    ]
    
    const edges = [
      { id: "e-start", source: "start", target: `agent-${enabledAgents[0]}` },
      ...enabledAgents.slice(0, -1).map((agentId, index) => ({
        id: `e-${index}`,
        source: `agent-${agentId}`,
        target: `agent-${enabledAgents[index + 1]}`
      })),
      { id: "e-end", source: `agent-${enabledAgents[enabledAgents.length - 1]}`, target: "end" },
    ]
    
    return {
      id: "standard",
      name: "Standard-Workflow",
      description: "Linearer Ablauf basierend auf der aktuellen Agent-Konfiguration",
      nodes,
      edges,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <GitBranch className="h-4 w-4 mr-2" />
            Workflow wählen
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Workflow auswählen
          </DialogTitle>
          <DialogDescription>
            Wähle einen gespeicherten Workflow, eine Vorlage oder nutze den Standard-Workflow
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="saved" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="saved">
              Gespeichert ({savedWorkflows.length})
            </TabsTrigger>
            <TabsTrigger value="templates">
              Vorlagen
            </TabsTrigger>
            <TabsTrigger value="standard">
              Standard
            </TabsTrigger>
          </TabsList>

          {/* Gespeicherte Workflows */}
          <TabsContent value="saved" className="mt-4">
            <ScrollArea className="h-[400px]">
              {savedWorkflows.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileCode className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Keine gespeicherten Workflows vorhanden.</p>
                  <p className="text-sm">Erstelle einen im Workflow-Designer.</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {savedWorkflows.map((workflow) => (
                    <Card
                      key={workflow.id}
                      className="cursor-pointer hover:border-primary transition-colors"
                      onClick={() => handleSelect(workflow)}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-base">{workflow.name}</CardTitle>
                            {workflow.description && (
                              <CardDescription className="text-sm mt-1">
                                {workflow.description}
                              </CardDescription>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-600"
                            onClick={(e) => handleDelete(e, workflow.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="pb-3">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">
                            {workflow.nodes.length} Nodes
                          </Badge>
                          <Badge variant="secondary">
                            {workflow.nodes.filter(n => n.type === "agent").length} Agenten
                          </Badge>
                          {workflow.nodes.some(n => n.type === "human-decision") && (
                            <Badge className="bg-purple-500/20 text-purple-500">
                              <Users className="h-3 w-3 mr-1" />
                              Human Decision
                            </Badge>
                          )}
                          <Badge variant="outline" className="ml-auto">
                            <Clock className="h-3 w-3 mr-1" />
                            {new Date(workflow.updatedAt).toLocaleDateString()}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Vorlagen */}
          <TabsContent value="templates" className="mt-4">
            <ScrollArea className="h-[400px]">
              <div className="grid gap-3">
                {Object.entries(WORKFLOW_TEMPLATES).map(([id, template]) => (
                  <Card
                    key={id}
                    className="cursor-pointer hover:border-primary transition-colors"
                    onClick={() => handleSelectTemplate(id)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <LayoutTemplate className="h-5 w-5 text-blue-500" />
                        <CardTitle className="text-base">{template.name}</CardTitle>
                      </div>
                      <CardDescription className="text-sm">
                        {template.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pb-3">
                      <div className="flex flex-wrap gap-2">
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
            </ScrollArea>
          </TabsContent>

          {/* Standard-Workflow */}
          <TabsContent value="standard" className="mt-4">
            <Card
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() => handleSelect(createStandardWorkflow())}
            >
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <CardTitle className="text-base">Standard-Workflow</CardTitle>
                </div>
                <CardDescription>
                  Linearer Ablauf basierend auf deiner aktuellen Agent-Konfiguration in der Sidebar.
                  Alle aktivierten Agenten werden der Reihe nach ausgeführt.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 flex-wrap">
                  {workflowOrder.filter(id => {
                    const config = agentConfigs[id as keyof typeof agentConfigs]
                    return config?.enabled
                  }).map((agentId, index, arr) => (
                    <div key={agentId} className="flex items-center gap-2">
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <Brain className="h-3 w-3" />
                        {agentConfigs[agentId as keyof typeof agentConfigs]?.name || agentId}
                      </Badge>
                      {index < arr.length - 1 && (
                        <span className="text-muted-foreground">→</span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            
            <div className="mt-4 p-4 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Hinweis:</strong> Der Standard-Workflow führt alle aktivierten Agenten 
                linear aus, ohne Entscheidungspunkte. Für komplexere Abläufe mit Human-in-the-Loop 
                Entscheidungen, wähle eine Vorlage oder erstelle einen eigenen Workflow im Designer.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
