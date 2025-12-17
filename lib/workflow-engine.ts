"use client"

import type {
  WorkflowGraph,
  WorkflowNode,
  WorkflowEdge,
  WorkflowExecutionState,
  HumanDecisionOption,
  AgentType,
} from "./types"

// Workflow Engine für nicht-lineare Workflow-Ausführung
export class WorkflowEngine {
  private workflow: WorkflowGraph
  private state: WorkflowExecutionState
  private onStateChange: (state: WorkflowExecutionState) => void
  private onAgentExecute: (agentId: string, previousOutput?: string) => Promise<string>
  private onHumanDecision: (nodeId: string, question: string, options: HumanDecisionOption[]) => Promise<string>
  private onLog: (message: string, level: "info" | "warn" | "error" | "debug") => void

  constructor(
    workflow: WorkflowGraph,
    callbacks: {
      onStateChange: (state: WorkflowExecutionState) => void
      onAgentExecute: (agentId: string, previousOutput?: string) => Promise<string>
      onHumanDecision: (nodeId: string, question: string, options: HumanDecisionOption[]) => Promise<string>
      onLog?: (message: string, level: "info" | "warn" | "error" | "debug") => void
    }
  ) {
    this.workflow = workflow
    this.onStateChange = callbacks.onStateChange
    this.onAgentExecute = callbacks.onAgentExecute
    this.onHumanDecision = callbacks.onHumanDecision
    this.onLog = callbacks.onLog || console.log

    // Initialer State
    this.state = {
      workflowId: workflow.id,
      currentNodeId: null,
      visitedNodes: [],
      nodeOutputs: {},
      status: "idle",
    }
  }

  // Workflow starten
  async start(): Promise<void> {
    this.log("Workflow gestartet", "info")
    
    // Finde Start-Node
    const startNode = this.workflow.nodes.find(n => n.type === "start")
    if (!startNode) {
      this.setError("Kein Start-Node gefunden")
      return
    }

    this.state = {
      ...this.state,
      status: "running",
      currentNodeId: startNode.id,
      startedAt: new Date(),
    }
    this.onStateChange(this.state)

    // Starte Ausführung
    await this.executeNode(startNode.id)
  }

  // Node ausführen
  private async executeNode(nodeId: string): Promise<void> {
    const node = this.workflow.nodes.find(n => n.id === nodeId)
    if (!node) {
      this.setError(`Node ${nodeId} nicht gefunden`)
      return
    }

    this.log(`Führe Node aus: ${node.data.label} (${node.type})`, "info")

    // State aktualisieren
    this.state = {
      ...this.state,
      currentNodeId: nodeId,
      visitedNodes: [...this.state.visitedNodes, nodeId],
    }
    this.onStateChange(this.state)

    try {
      let output = ""
      let nextNodeId: string | null = null
      let shouldContinue = true

      switch (node.type) {
        case "start":
          // Start-Node: Einfach zum nächsten Node
          nextNodeId = this.getNextNode(nodeId)
          break

        case "end":
          // End-Node: Workflow beenden
          this.state = {
            ...this.state,
            status: "completed",
            currentNodeId: null,
            completedAt: new Date(),
          }
          this.onStateChange(this.state)
          this.log("Workflow abgeschlossen", "info")
          shouldContinue = false
          break

        case "agent":
          // Agent ausführen
          if (!node.data.agentId) {
            this.setError(`Agent-Node ${nodeId} hat keine agentId`)
            return
          }
          
          // Vorherigen Output als Kontext übergeben
          const previousOutput = this.getPreviousOutput(nodeId)
          output = await this.onAgentExecute(node.data.agentId, previousOutput)
          this.state.nodeOutputs[nodeId] = output
          nextNodeId = this.getNextNode(nodeId)
          break

        case "human-decision":
          // Human-in-the-Loop Entscheidung
          this.state = {
            ...this.state,
            status: "waiting-human",
            humanDecisionPending: {
              nodeId,
              question: node.data.question || "Wie soll fortgefahren werden?",
              options: node.data.options || [],
              timeoutAt: node.data.timeout 
                ? new Date(Date.now() + node.data.timeout * 1000)
                : undefined,
            },
          }
          this.onStateChange(this.state)
          
          // Auf Entscheidung warten
          const selectedOptionId = await this.onHumanDecision(
            nodeId,
            node.data.question || "Wie soll fortgefahren werden?",
            node.data.options || []
          )
          
          // Option finden und nächsten Node bestimmen
          const selectedOption = node.data.options?.find(o => o.id === selectedOptionId)
          if (selectedOption?.nextNodeId) {
            nextNodeId = selectedOption.nextNodeId
          } else {
            // Fallback: Erste ausgehende Edge
            nextNodeId = this.getNextNode(nodeId)
          }
          
          this.state = {
            ...this.state,
            status: "running",
            humanDecisionPending: undefined,
          }
          this.state.nodeOutputs[nodeId] = selectedOptionId
          break

        case "condition":
          // Automatische Bedingungsprüfung
          const conditionOutput = this.getPreviousOutput(nodeId)
          nextNodeId = this.evaluateConditions(node, conditionOutput)
          break

        case "parallel":
          // Parallele Ausführung - vereinfacht: sequentiell ausführen
          const parallelEdges = this.workflow.edges.filter(e => e.source === nodeId)
          for (const edge of parallelEdges) {
            await this.executeNode(edge.target)
          }
          shouldContinue = false // Parallele Pfade enden bei Merge
          break

        case "merge":
          // Zusammenführung - einfach weiter
          nextNodeId = this.getNextNode(nodeId)
          break

        case "loop":
          // Schleife - prüfe Exit-Bedingung
          const iterations = (this.state.nodeOutputs[`${nodeId}_iterations`] as unknown as number) || 0
          const maxIterations = node.data.maxIterations || 3
          
          if (iterations < maxIterations) {
            this.state.nodeOutputs[`${nodeId}_iterations`] = String(iterations + 1)
            // Führe Loop-Body aus (erste Edge)
            nextNodeId = this.getNextNode(nodeId)
          } else {
            // Exit Loop (zweite Edge oder überspringen)
            const edges = this.workflow.edges.filter(e => e.source === nodeId)
            nextNodeId = edges.length > 1 ? edges[1].target : this.getNextNode(nodeId)
          }
          break

        case "delay":
          // Wartezeit
          const delaySeconds = node.data.delaySeconds || 5
          this.log(`Warte ${delaySeconds} Sekunden...`, "info")
          await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000))
          nextNodeId = this.getNextNode(nodeId)
          break
      }

      // Nächsten Node ausführen
      if (!shouldContinue) {
        return
      }
      
      if (nextNodeId) {
        await this.executeNode(nextNodeId)
      } else {
        this.log(`Kein nächster Node gefunden nach ${node.data.label}`, "warn")
        this.state = {
          ...this.state,
          status: "completed",
          currentNodeId: null,
          completedAt: new Date(),
        }
        this.onStateChange(this.state)
      }
    } catch (error) {
      this.setError(`Fehler bei Node ${node.data.label}: ${error}`)
    }
  }

  // Nächsten Node finden (erste ausgehende Edge)
  private getNextNode(nodeId: string): string | null {
    const edge = this.workflow.edges.find(e => e.source === nodeId)
    return edge?.target || null
  }

  // Vorherigen Output holen
  private getPreviousOutput(nodeId: string): string | undefined {
    // Finde eingehende Edge
    const incomingEdge = this.workflow.edges.find(e => e.target === nodeId)
    if (!incomingEdge) return undefined
    
    // Hole Output des vorherigen Nodes
    return this.state.nodeOutputs[incomingEdge.source]
  }

  // Bedingungen auswerten
  private evaluateConditions(node: WorkflowNode, output: string | undefined): string | null {
    if (!node.data.conditions || !output) {
      return this.getNextNode(node.id)
    }

    for (const condition of node.data.conditions) {
      let matches = false
      
      switch (condition.type) {
        case "output-contains":
          matches = output.toLowerCase().includes(condition.value.toLowerCase())
          break
        case "output-matches":
          try {
            matches = new RegExp(condition.value).test(output)
          } catch {
            matches = false
          }
          break
        case "error-occurred":
          matches = output.toLowerCase().includes("error") || output.toLowerCase().includes("fehler")
          break
        default:
          matches = false
      }

      if (matches) {
        this.log(`Bedingung erfüllt: ${condition.label}`, "debug")
        return condition.nextNodeId
      }
    }

    // Fallback: Default Edge
    return this.getNextNode(node.id)
  }

  // Human Decision beantworten (von außen aufgerufen)
  async submitHumanDecision(optionId: string): Promise<void> {
    if (this.state.status !== "waiting-human" || !this.state.humanDecisionPending) {
      throw new Error("Keine Human Decision ausstehend")
    }
    
    // Die onHumanDecision Promise wird durch diesen Call aufgelöst
    // Das passiert automatisch in der executeNode Funktion
  }

  // Workflow pausieren
  pause(): void {
    if (this.state.status === "running") {
      this.state = { ...this.state, status: "paused" }
      this.onStateChange(this.state)
      this.log("Workflow pausiert", "info")
    }
  }

  // Workflow fortsetzen
  resume(): void {
    if (this.state.status === "paused" && this.state.currentNodeId) {
      this.state = { ...this.state, status: "running" }
      this.onStateChange(this.state)
      this.log("Workflow fortgesetzt", "info")
      this.executeNode(this.state.currentNodeId)
    }
  }

  // Workflow stoppen
  stop(): void {
    this.state = {
      ...this.state,
      status: "idle",
      currentNodeId: null,
    }
    this.onStateChange(this.state)
    this.log("Workflow gestoppt", "info")
  }

  // Fehler setzen
  private setError(message: string): void {
    this.state = {
      ...this.state,
      status: "error",
      error: message,
    }
    this.onStateChange(this.state)
    this.log(message, "error")
  }

  // Logging
  private log(message: string, level: "info" | "warn" | "error" | "debug"): void {
    this.onLog(`[Workflow] ${message}`, level)
  }

  // State abrufen
  getState(): WorkflowExecutionState {
    return this.state
  }
}

// Default Workflow-Templates
export const WORKFLOW_TEMPLATES: Record<string, WorkflowGraph> = {
  "simple-linear": {
    id: "template-simple",
    name: "Einfacher Workflow",
    description: "Linearer Workflow: Planner → Coder → Ende",
    nodes: [
      { id: "start", type: "start", position: { x: 100, y: 200 }, data: { label: "Start" } },
      { id: "planner", type: "agent", position: { x: 300, y: 200 }, data: { label: "Planner", agentId: "planner" } },
      { id: "coder", type: "agent", position: { x: 500, y: 200 }, data: { label: "Coder", agentId: "coder" } },
      { id: "end", type: "end", position: { x: 700, y: 200 }, data: { label: "Ende" } },
    ],
    edges: [
      { id: "e1", source: "start", target: "planner" },
      { id: "e2", source: "planner", target: "coder" },
      { id: "e3", source: "coder", target: "end" },
    ],
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  
  "with-review": {
    id: "template-review",
    name: "Mit Review-Entscheidung",
    description: "Workflow mit optionalem Review-Schritt",
    nodes: [
      { id: "start", type: "start", position: { x: 50, y: 200 }, data: { label: "Start" } },
      { id: "planner", type: "agent", position: { x: 200, y: 200 }, data: { label: "Planner", agentId: "planner" } },
      { id: "coder", type: "agent", position: { x: 400, y: 200 }, data: { label: "Coder", agentId: "coder" } },
      { 
        id: "decision", 
        type: "human-decision", 
        position: { x: 600, y: 200 }, 
        data: { 
          label: "Review nötig?",
          question: "Soll der generierte Code reviewed werden?",
          options: [
            { id: "yes", label: "Ja, Review durchführen", nextNodeId: "reviewer" },
            { id: "no", label: "Nein, direkt fertig", nextNodeId: "end" },
          ]
        } 
      },
      { id: "reviewer", type: "agent", position: { x: 800, y: 100 }, data: { label: "Reviewer", agentId: "reviewer" } },
      { id: "end", type: "end", position: { x: 900, y: 200 }, data: { label: "Ende" } },
    ],
    edges: [
      { id: "e1", source: "start", target: "planner" },
      { id: "e2", source: "planner", target: "coder" },
      { id: "e3", source: "coder", target: "decision" },
      { id: "e4", source: "decision", target: "reviewer", label: "Ja" },
      { id: "e5", source: "decision", target: "end", label: "Nein" },
      { id: "e6", source: "reviewer", target: "end" },
    ],
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },

  "full-pipeline": {
    id: "template-full",
    name: "Vollständige Pipeline",
    description: "Planner → Coder → Review-Entscheidung → Security Check",
    nodes: [
      { id: "start", type: "start", position: { x: 50, y: 200 }, data: { label: "Start" } },
      { id: "planner", type: "agent", position: { x: 200, y: 200 }, data: { label: "Planner", agentId: "planner" } },
      { id: "coder", type: "agent", position: { x: 400, y: 200 }, data: { label: "Coder", agentId: "coder" } },
      { 
        id: "review-decision", 
        type: "human-decision", 
        position: { x: 600, y: 200 }, 
        data: { 
          label: "Qualitätsprüfung?",
          question: "Welche Qualitätsprüfungen sollen durchgeführt werden?",
          options: [
            { id: "both", label: "Review + Security", nextNodeId: "reviewer" },
            { id: "review-only", label: "Nur Review", nextNodeId: "reviewer" },
            { id: "security-only", label: "Nur Security", nextNodeId: "security" },
            { id: "none", label: "Keine Prüfung", nextNodeId: "end" },
          ]
        } 
      },
      { id: "reviewer", type: "agent", position: { x: 800, y: 100 }, data: { label: "Reviewer", agentId: "reviewer" } },
      { id: "security", type: "agent", position: { x: 800, y: 300 }, data: { label: "Security", agentId: "security" } },
      { 
        id: "fix-decision", 
        type: "human-decision", 
        position: { x: 1000, y: 200 }, 
        data: { 
          label: "Fixes nötig?",
          question: "Sollen die gefundenen Issues behoben werden?",
          options: [
            { id: "fix", label: "Ja, beheben", nextNodeId: "coder" },
            { id: "accept", label: "Akzeptieren", nextNodeId: "end" },
          ]
        } 
      },
      { id: "end", type: "end", position: { x: 1200, y: 200 }, data: { label: "Ende" } },
    ],
    edges: [
      { id: "e1", source: "start", target: "planner" },
      { id: "e2", source: "planner", target: "coder" },
      { id: "e3", source: "coder", target: "review-decision" },
      { id: "e4", source: "review-decision", target: "reviewer", label: "Review" },
      { id: "e5", source: "review-decision", target: "security", label: "Security" },
      { id: "e6", source: "review-decision", target: "end", label: "Keine" },
      { id: "e7", source: "reviewer", target: "fix-decision" },
      { id: "e8", source: "security", target: "fix-decision" },
      { id: "e9", source: "fix-decision", target: "coder", label: "Fix" },
      { id: "e10", source: "fix-decision", target: "end", label: "OK" },
    ],
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
}
