"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Play,
  Square,
  Plus,
  Trash2,
  Settings,
  Save,
  Upload,
  Download,
  Brain,
  Code2,
  Eye,
  Shield,
  Zap,
  GitBranch,
  Users,
  Timer,
  RotateCcw,
  ArrowRight,
  Circle,
  CheckCircle2,
  XCircle,
  Pause,
  HelpCircle,
  Split,
  Merge,
  Clock,
} from "lucide-react"
import type { 
  WorkflowNode, 
  WorkflowEdge, 
  WorkflowGraph, 
  WorkflowNodeType,
  WorkflowNodeData,
  HumanDecisionOption,
  WorkflowCondition,
  WorkflowExecutionState,
} from "@/lib/types"
import { useAgentStore } from "@/lib/agent-store"
import { marketplaceAgents } from "@/lib/marketplace-agents"

// Node-Typ Konfiguration
const NODE_TYPES: Record<WorkflowNodeType, {
  label: string
  icon: typeof Brain
  color: string
  bgColor: string
  description: string
}> = {
  start: {
    label: "Start",
    icon: Play,
    color: "text-green-500",
    bgColor: "bg-green-500/20",
    description: "Startpunkt des Workflows"
  },
  end: {
    label: "Ende",
    icon: Square,
    color: "text-red-500",
    bgColor: "bg-red-500/20",
    description: "Endpunkt des Workflows"
  },
  agent: {
    label: "Agent",
    icon: Brain,
    color: "text-blue-500",
    bgColor: "bg-blue-500/20",
    description: "Agent-Ausführung"
  },
  "human-decision": {
    label: "Entscheidung",
    icon: Users,
    color: "text-purple-500",
    bgColor: "bg-purple-500/20",
    description: "Human-in-the-Loop Entscheidungspunkt"
  },
  condition: {
    label: "Bedingung",
    icon: GitBranch,
    color: "text-orange-500",
    bgColor: "bg-orange-500/20",
    description: "Automatische Verzweigung basierend auf Bedingungen"
  },
  parallel: {
    label: "Parallel",
    icon: Split,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/20",
    description: "Parallele Ausführung mehrerer Pfade"
  },
  merge: {
    label: "Zusammenführen",
    icon: Merge,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/20",
    description: "Zusammenführung paralleler Pfade"
  },
  loop: {
    label: "Schleife",
    icon: RotateCcw,
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/20",
    description: "Wiederholte Ausführung"
  },
  delay: {
    label: "Warten",
    icon: Timer,
    color: "text-gray-500",
    bgColor: "bg-gray-500/20",
    description: "Wartezeit vor dem nächsten Schritt"
  },
}

// Default Workflow
const createDefaultWorkflow = (): WorkflowGraph => ({
  id: crypto.randomUUID(),
  name: "Neuer Workflow",
  description: "Beschreibung des Workflows",
  nodes: [
    {
      id: "start-1",
      type: "start",
      position: { x: 100, y: 200 },
      data: { label: "Start" }
    },
    {
      id: "agent-planner",
      type: "agent",
      position: { x: 300, y: 200 },
      data: { label: "Planner", agentId: "planner" }
    },
    {
      id: "agent-coder",
      type: "agent",
      position: { x: 500, y: 200 },
      data: { label: "Coder", agentId: "coder" }
    },
    {
      id: "human-review",
      type: "human-decision",
      position: { x: 700, y: 200 },
      data: { 
        label: "Review nötig?",
        question: "Soll der Code reviewed werden?",
        options: [
          { id: "yes", label: "Ja, Review", nextNodeId: "agent-reviewer" },
          { id: "no", label: "Nein, Fertig", nextNodeId: "end-1" }
        ]
      }
    },
    {
      id: "agent-reviewer",
      type: "agent",
      position: { x: 900, y: 100 },
      data: { label: "Reviewer", agentId: "reviewer" }
    },
    {
      id: "end-1",
      type: "end",
      position: { x: 900, y: 300 },
      data: { label: "Ende" }
    }
  ],
  edges: [
    { id: "e1", source: "start-1", target: "agent-planner" },
    { id: "e2", source: "agent-planner", target: "agent-coder" },
    { id: "e3", source: "agent-coder", target: "human-review" },
    { id: "e4", source: "human-review", target: "agent-reviewer", label: "Ja" },
    { id: "e5", source: "human-review", target: "end-1", label: "Nein" },
    { id: "e6", source: "agent-reviewer", target: "end-1" },
  ],
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
})

interface WorkflowDesignerProps {
  initialWorkflow?: WorkflowGraph
  onSave?: (workflow: WorkflowGraph) => void
  onExecute?: (workflow: WorkflowGraph) => void
}

export function WorkflowDesigner({ initialWorkflow, onSave, onExecute }: WorkflowDesignerProps) {
  const { installedAgents, agentConfigs } = useAgentStore()
  const [workflow, setWorkflow] = useState<WorkflowGraph>(initialWorkflow || createDefaultWorkflow())
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<WorkflowEdge | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null)
  const [showNodeDialog, setShowNodeDialog] = useState(false)
  const [showAddNodeDialog, setShowAddNodeDialog] = useState(false)
  const [draggedNode, setDraggedNode] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLDivElement>(null)
  
  // Execution State
  const [executionState, setExecutionState] = useState<WorkflowExecutionState | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)

  // Alle verfügbaren Agenten
  const allAgents = [
    ...Object.entries(agentConfigs).map(([id, config]) => ({
      id,
      name: config.name,
      icon: "Brain",
      color: "text-blue-500"
    })),
    ...marketplaceAgents.map(a => ({
      id: a.id,
      name: a.name,
      icon: a.icon,
      color: a.color
    }))
  ]

  // Node hinzufügen
  const addNode = (type: WorkflowNodeType, agentId?: string) => {
    const newNode: WorkflowNode = {
      id: `${type}-${Date.now()}`,
      type,
      position: { x: 400, y: 250 },
      data: {
        label: type === "agent" && agentId 
          ? allAgents.find(a => a.id === agentId)?.name || agentId
          : NODE_TYPES[type].label,
        agentId: type === "agent" ? agentId : undefined,
        question: type === "human-decision" ? "Wie soll fortgefahren werden?" : undefined,
        options: type === "human-decision" ? [
          { id: "option-1", label: "Option A" },
          { id: "option-2", label: "Option B" }
        ] : undefined,
      }
    }
    setWorkflow(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
      updatedAt: new Date()
    }))
    setShowAddNodeDialog(false)
    setSelectedNode(newNode)
    setShowNodeDialog(true)
  }

  // Node entfernen
  const removeNode = (nodeId: string) => {
    setWorkflow(prev => ({
      ...prev,
      nodes: prev.nodes.filter(n => n.id !== nodeId),
      edges: prev.edges.filter(e => e.source !== nodeId && e.target !== nodeId),
      updatedAt: new Date()
    }))
    setSelectedNode(null)
  }

  // Edge hinzufügen
  const addEdge = (sourceId: string, targetId: string) => {
    // Prüfe ob Edge bereits existiert
    const exists = workflow.edges.some(e => e.source === sourceId && e.target === targetId)
    if (exists) return

    const newEdge: WorkflowEdge = {
      id: `edge-${Date.now()}`,
      source: sourceId,
      target: targetId,
    }
    setWorkflow(prev => ({
      ...prev,
      edges: [...prev.edges, newEdge],
      updatedAt: new Date()
    }))
  }

  // Edge entfernen
  const removeEdge = (edgeId: string) => {
    setWorkflow(prev => ({
      ...prev,
      edges: prev.edges.filter(e => e.id !== edgeId),
      updatedAt: new Date()
    }))
    setSelectedEdge(null)
  }

  // Node aktualisieren
  const updateNode = (nodeId: string, data: Partial<WorkflowNodeData>) => {
    setWorkflow(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => 
        n.id === nodeId 
          ? { ...n, data: { ...n.data, ...data } }
          : n
      ),
      updatedAt: new Date()
    }))
  }

  // Node Position aktualisieren
  const updateNodePosition = (nodeId: string, position: { x: number, y: number }) => {
    setWorkflow(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => 
        n.id === nodeId ? { ...n, position } : n
      )
    }))
  }

  // Drag & Drop Handler
  const handleMouseDown = (e: React.MouseEvent, nodeId: string) => {
    if (e.button !== 0) return
    const node = workflow.nodes.find(n => n.id === nodeId)
    if (!node) return
    
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    
    setDraggedNode(nodeId)
    setDragOffset({
      x: e.clientX - rect.left - node.position.x,
      y: e.clientY - rect.top - node.position.y
    })
  }

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!draggedNode || !canvasRef.current) return
    
    const rect = canvasRef.current.getBoundingClientRect()
    const x = Math.max(0, e.clientX - rect.left - dragOffset.x)
    const y = Math.max(0, e.clientY - rect.top - dragOffset.y)
    
    updateNodePosition(draggedNode, { x, y })
  }, [draggedNode, dragOffset])

  const handleMouseUp = useCallback(() => {
    setDraggedNode(null)
  }, [])

  useEffect(() => {
    if (draggedNode) {
      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("mouseup", handleMouseUp)
      return () => {
        window.removeEventListener("mousemove", handleMouseMove)
        window.removeEventListener("mouseup", handleMouseUp)
      }
    }
  }, [draggedNode, handleMouseMove, handleMouseUp])

  // Connection Handler
  const startConnection = (nodeId: string) => {
    setIsConnecting(true)
    setConnectingFrom(nodeId)
  }

  const endConnection = (nodeId: string) => {
    if (connectingFrom && connectingFrom !== nodeId) {
      addEdge(connectingFrom, nodeId)
    }
    setIsConnecting(false)
    setConnectingFrom(null)
  }

  // SVG Pfad für Edge
  const getEdgePath = (edge: WorkflowEdge) => {
    const sourceNode = workflow.nodes.find(n => n.id === edge.source)
    const targetNode = workflow.nodes.find(n => n.id === edge.target)
    if (!sourceNode || !targetNode) return ""

    const sx = sourceNode.position.x + 80 // Mitte rechts
    const sy = sourceNode.position.y + 30
    const tx = targetNode.position.x // Mitte links
    const ty = targetNode.position.y + 30

    // Bezier-Kurve
    const cx1 = sx + (tx - sx) / 2
    const cy1 = sy
    const cx2 = sx + (tx - sx) / 2
    const cy2 = ty

    return `M ${sx} ${sy} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${tx} ${ty}`
  }

  // Workflow speichern
  const handleSave = () => {
    onSave?.(workflow)
  }

  // Workflow ausführen
  const handleExecute = () => {
    onExecute?.(workflow)
  }

  // Export/Import
  const exportWorkflow = () => {
    const data = JSON.stringify(workflow, null, 2)
    const blob = new Blob([data], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `workflow-${workflow.name.toLowerCase().replace(/\s+/g, "-")}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importWorkflow = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string)
        setWorkflow({
          ...data,
          id: crypto.randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date()
        })
      } catch (err) {
        alert("Ungültiges Workflow-Format")
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Input
            value={workflow.name}
            onChange={(e) => setWorkflow(prev => ({ ...prev, name: e.target.value }))}
            className="w-48 h-8 font-medium"
          />
          <Badge variant="outline">v{workflow.version}</Badge>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAddNodeDialog(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Node
          </Button>
          <div className="w-px h-6 bg-border" />
          <Button variant="outline" size="sm" onClick={exportWorkflow}>
            <Download className="h-4 w-4 mr-1" />
            Export
          </Button>
          <label>
            <Button variant="outline" size="sm" asChild>
              <span>
                <Upload className="h-4 w-4 mr-1" />
                Import
              </span>
            </Button>
            <input type="file" accept=".json" className="hidden" onChange={importWorkflow} />
          </label>
          <div className="w-px h-6 bg-border" />
          <Button variant="outline" size="sm" onClick={handleSave}>
            <Save className="h-4 w-4 mr-1" />
            Speichern
          </Button>
          <Button size="sm" onClick={handleExecute} className="bg-green-600 hover:bg-green-700">
            <Play className="h-4 w-4 mr-1" />
            Ausführen
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 flex">
        {/* Workflow Canvas */}
        <div 
          ref={canvasRef}
          className="flex-1 relative bg-[#1a1a2e] overflow-auto"
          style={{ 
            backgroundImage: "radial-gradient(circle, #333 1px, transparent 1px)",
            backgroundSize: "20px 20px"
          }}
          onClick={() => {
            setSelectedNode(null)
            setSelectedEdge(null)
            if (isConnecting) {
              setIsConnecting(false)
              setConnectingFrom(null)
            }
          }}
        >
          {/* Edges */}
          <svg className="absolute inset-0 pointer-events-none" style={{ width: "100%", height: "100%" }}>
            <defs>
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill="#666" />
              </marker>
            </defs>
            {workflow.edges.map(edge => (
              <g key={edge.id}>
                <path
                  d={getEdgePath(edge)}
                  fill="none"
                  stroke={selectedEdge?.id === edge.id ? "#60a5fa" : "#666"}
                  strokeWidth={selectedEdge?.id === edge.id ? 3 : 2}
                  markerEnd="url(#arrowhead)"
                  className="pointer-events-auto cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedEdge(edge)
                    setSelectedNode(null)
                  }}
                />
                {edge.label && (
                  <text
                    x={(() => {
                      const source = workflow.nodes.find(n => n.id === edge.source)
                      const target = workflow.nodes.find(n => n.id === edge.target)
                      if (!source || !target) return 0
                      return (source.position.x + 80 + target.position.x) / 2
                    })()}
                    y={(() => {
                      const source = workflow.nodes.find(n => n.id === edge.source)
                      const target = workflow.nodes.find(n => n.id === edge.target)
                      if (!source || !target) return 0
                      return (source.position.y + target.position.y) / 2 + 30
                    })()}
                    fill="#888"
                    fontSize="12"
                    textAnchor="middle"
                    className="pointer-events-none"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            ))}
          </svg>

          {/* Nodes */}
          {workflow.nodes.map(node => {
            const nodeType = NODE_TYPES[node.type]
            const Icon = nodeType.icon
            const isSelected = selectedNode?.id === node.id
            const isCurrentNode = executionState?.currentNodeId === node.id
            const isVisited = executionState?.visitedNodes.includes(node.id)
            
            return (
              <div
                key={node.id}
                className={`absolute cursor-move select-none transition-shadow ${
                  isSelected ? "ring-2 ring-blue-500" : ""
                } ${isCurrentNode ? "ring-2 ring-green-500 animate-pulse" : ""}`}
                style={{
                  left: node.position.x,
                  top: node.position.y,
                  width: 160,
                }}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  handleMouseDown(e, node.id)
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  if (isConnecting) {
                    endConnection(node.id)
                  } else {
                    setSelectedNode(node)
                    setSelectedEdge(null)
                  }
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  setSelectedNode(node)
                  setShowNodeDialog(true)
                }}
              >
                <Card className={`${nodeType.bgColor} border-2 ${
                  isSelected ? "border-blue-500" : isVisited ? "border-green-500/50" : "border-transparent"
                }`}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded ${nodeType.bgColor}`}>
                        <Icon className={`h-4 w-4 ${nodeType.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{node.data.label}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {node.type === "agent" && node.data.agentId}
                          {node.type === "human-decision" && "Entscheidung"}
                          {node.type === "condition" && "Bedingung"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                {/* Connection Point */}
                <div
                  className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-gray-600 border-2 border-gray-400 cursor-crosshair hover:bg-blue-500 hover:border-blue-400 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    startConnection(node.id)
                  }}
                />
                <div
                  className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-gray-600 border-2 border-gray-400 cursor-crosshair hover:bg-green-500 hover:border-green-400 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (isConnecting) {
                      endConnection(node.id)
                    }
                  }}
                />
              </div>
            )
          })}

          {/* Verbindungs-Indikator */}
          {isConnecting && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg">
              Klicke auf einen Node um die Verbindung herzustellen
            </div>
          )}
        </div>

        {/* Properties Panel */}
        <div className="w-72 border-l bg-background">
          <ScrollArea className="h-full">
            <div className="p-4">
              {selectedNode ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Node Eigenschaften</h3>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500"
                      onClick={() => removeNode(selectedNode.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Typ</Label>
                    <Badge className={NODE_TYPES[selectedNode.type].bgColor}>
                      {NODE_TYPES[selectedNode.type].label}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <Label>Label</Label>
                    <Input
                      value={selectedNode.data.label}
                      onChange={(e) => updateNode(selectedNode.id, { label: e.target.value })}
                    />
                  </div>

                  {selectedNode.type === "agent" && (
                    <div className="space-y-2">
                      <Label>Agent</Label>
                      <Select
                        value={selectedNode.data.agentId}
                        onValueChange={(value) => updateNode(selectedNode.id, { agentId: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Agent wählen" />
                        </SelectTrigger>
                        <SelectContent>
                          {allAgents.map(agent => (
                            <SelectItem key={agent.id} value={agent.id}>
                              {agent.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {selectedNode.type === "human-decision" && (
                    <>
                      <div className="space-y-2">
                        <Label>Frage</Label>
                        <Textarea
                          value={selectedNode.data.question || ""}
                          onChange={(e) => updateNode(selectedNode.id, { question: e.target.value })}
                          placeholder="Frage an den User..."
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Optionen</Label>
                        {selectedNode.data.options?.map((option, idx) => (
                          <div key={option.id} className="flex gap-2">
                            <Input
                              value={option.label}
                              onChange={(e) => {
                                const newOptions = [...(selectedNode.data.options || [])]
                                newOptions[idx] = { ...newOptions[idx], label: e.target.value }
                                updateNode(selectedNode.id, { options: newOptions })
                              }}
                              placeholder={`Option ${idx + 1}`}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                const newOptions = selectedNode.data.options?.filter((_, i) => i !== idx)
                                updateNode(selectedNode.id, { options: newOptions })
                              }}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const newOptions = [
                              ...(selectedNode.data.options || []),
                              { id: `option-${Date.now()}`, label: "Neue Option" }
                            ]
                            updateNode(selectedNode.id, { options: newOptions })
                          }}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Option hinzufügen
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <Label>Timeout (Sekunden)</Label>
                        <Input
                          type="number"
                          value={selectedNode.data.timeout || ""}
                          onChange={(e) => updateNode(selectedNode.id, { timeout: parseInt(e.target.value) || undefined })}
                          placeholder="Kein Timeout"
                        />
                        <p className="text-xs text-muted-foreground">
                          Automatisch fortfahren nach X Sekunden
                        </p>
                      </div>
                    </>
                  )}

                  {selectedNode.type === "delay" && (
                    <div className="space-y-2">
                      <Label>Wartezeit (Sekunden)</Label>
                      <Input
                        type="number"
                        value={selectedNode.data.delaySeconds || 5}
                        onChange={(e) => updateNode(selectedNode.id, { delaySeconds: parseInt(e.target.value) || 5 })}
                      />
                    </div>
                  )}

                  {selectedNode.type === "loop" && (
                    <div className="space-y-2">
                      <Label>Max. Iterationen</Label>
                      <Input
                        type="number"
                        value={selectedNode.data.maxIterations || 3}
                        onChange={(e) => updateNode(selectedNode.id, { maxIterations: parseInt(e.target.value) || 3 })}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Beschreibung</Label>
                    <Textarea
                      value={selectedNode.data.description || ""}
                      onChange={(e) => updateNode(selectedNode.id, { description: e.target.value })}
                      placeholder="Optionale Beschreibung..."
                    />
                  </div>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowNodeDialog(true)}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Erweiterte Einstellungen
                  </Button>
                </div>
              ) : selectedEdge ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Verbindung</h3>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500"
                      onClick={() => removeEdge(selectedEdge.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Label</Label>
                    <Input
                      value={selectedEdge.label || ""}
                      onChange={(e) => {
                        setWorkflow(prev => ({
                          ...prev,
                          edges: prev.edges.map(ed => 
                            ed.id === selectedEdge.id 
                              ? { ...ed, label: e.target.value }
                              : ed
                          )
                        }))
                        setSelectedEdge({ ...selectedEdge, label: e.target.value })
                      }}
                      placeholder="Optionales Label..."
                    />
                  </div>

                  <div className="text-sm text-muted-foreground">
                    <p><strong>Von:</strong> {workflow.nodes.find(n => n.id === selectedEdge.source)?.data.label}</p>
                    <p><strong>Nach:</strong> {workflow.nodes.find(n => n.id === selectedEdge.target)?.data.label}</p>
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <HelpCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Wähle einen Node oder eine Verbindung aus um die Eigenschaften zu bearbeiten</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Add Node Dialog */}
      <Dialog open={showAddNodeDialog} onOpenChange={setShowAddNodeDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Node hinzufügen</DialogTitle>
            <DialogDescription>
              Wähle einen Node-Typ oder einen Agenten
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="nodes">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="nodes">Kontrollfluss</TabsTrigger>
              <TabsTrigger value="agents">Agenten</TabsTrigger>
            </TabsList>
            
            <TabsContent value="nodes" className="mt-4">
              <div className="grid grid-cols-3 gap-3">
                {(Object.entries(NODE_TYPES) as [WorkflowNodeType, typeof NODE_TYPES[WorkflowNodeType]][])
                  .filter(([type]) => type !== "agent")
                  .map(([type, config]) => {
                    const Icon = config.icon
                    return (
                      <Card
                        key={type}
                        className={`cursor-pointer hover:border-primary transition-colors ${config.bgColor}`}
                        onClick={() => addNode(type)}
                      >
                        <CardContent className="p-4 text-center">
                          <Icon className={`h-8 w-8 mx-auto mb-2 ${config.color}`} />
                          <p className="font-medium">{config.label}</p>
                          <p className="text-xs text-muted-foreground">{config.description}</p>
                        </CardContent>
                      </Card>
                    )
                  })}
              </div>
            </TabsContent>
            
            <TabsContent value="agents" className="mt-4">
              <ScrollArea className="h-64">
                <div className="grid grid-cols-2 gap-3">
                  {allAgents.map(agent => (
                    <Card
                      key={agent.id}
                      className="cursor-pointer hover:border-primary transition-colors"
                      onClick={() => addNode("agent", agent.id)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center gap-3">
                          <Brain className={`h-6 w-6 ${agent.color}`} />
                          <div>
                            <p className="font-medium">{agent.name}</p>
                            <p className="text-xs text-muted-foreground">{agent.id}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  )
}
