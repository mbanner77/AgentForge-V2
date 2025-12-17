"use client"

import type {
  WorkflowGraph,
  WorkflowNode,
  WorkflowEdge,
  WorkflowExecutionState,
  HumanDecisionOption,
  WorkflowStepResult,
  AgentType,
  WorkflowMetrics,
  WorkflowSnapshot,
  WorkflowStatistics,
} from "./types"

// Workflow-Event-Typen
export type WorkflowEventType = 
  | "workflow:started"
  | "workflow:completed"
  | "workflow:error"
  | "workflow:paused"
  | "workflow:resumed"
  | "node:started"
  | "node:completed"
  | "node:failed"
  | "node:skipped"
  | "human:waiting"
  | "human:decided"
  | "agent:started"
  | "agent:completed"
  | "agent:retry"

export interface WorkflowEvent {
  type: WorkflowEventType
  timestamp: Date
  workflowId: string
  nodeId?: string
  nodeName?: string
  data?: Record<string, unknown>
}

export type WorkflowEventListener = (event: WorkflowEvent) => void

// Workflow Engine für nicht-lineare Workflow-Ausführung
// Agent-Performance-Tracking
interface AgentPerformance {
  agentId: string
  executionCount: number
  totalDuration: number
  avgDuration: number
  successCount: number
  failureCount: number
  successRate: number
  lastExecution?: Date
  filesGeneratedTotal: number
}

// Shared Context für Agent-Kollaboration
interface SharedAgentContext {
  projectSummary?: string
  keyDecisions: string[]
  identifiedIssues: string[]
  completedTasks: string[]
  sharedVariables: Record<string, unknown>
}

export class WorkflowEngine {
  private workflow: WorkflowGraph
  private state: WorkflowExecutionState
  private onStateChange: (state: WorkflowExecutionState) => void
  private onAgentExecute: (agentId: string, previousOutput?: string, sharedContext?: SharedAgentContext) => Promise<string>
  private onHumanDecision: (nodeId: string, question: string, options: HumanDecisionOption[]) => Promise<string>
  private onLog: (message: string, level: "info" | "warn" | "error" | "debug") => void
  private eventListeners: Map<WorkflowEventType | "*", WorkflowEventListener[]> = new Map()
  private snapshots: WorkflowSnapshot[] = []
  private maxSnapshots: number = 10
  private agentPerformance: Map<string, AgentPerformance> = new Map()
  private sharedContext: SharedAgentContext = {
    keyDecisions: [],
    identifiedIssues: [],
    completedTasks: [],
    sharedVariables: {},
  }
  private nodeTimeouts: Map<string, NodeJS.Timeout> = new Map()
  private defaultTimeout: number = 300000 // 5 Minuten
  private outputCache: Map<string, { output: string; timestamp: Date; hash: string }> = new Map()
  private cacheEnabled: boolean = true
  private cacheTTL: number = 600000 // 10 Minuten Cache-Gültigkeit
  private priorityQueue: { nodeId: string; priority: number }[] = []

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
      nodeResults: {},
      status: "idle",
    }
  }

  // Event-System: Listener registrieren
  on(eventType: WorkflowEventType | "*", listener: WorkflowEventListener): () => void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, [])
    }
    this.eventListeners.get(eventType)!.push(listener)
    
    // Return unsubscribe function
    return () => {
      const listeners = this.eventListeners.get(eventType)
      if (listeners) {
        const index = listeners.indexOf(listener)
        if (index > -1) listeners.splice(index, 1)
      }
    }
  }

  // Event emittieren
  private emit(type: WorkflowEventType, nodeId?: string, nodeName?: string, data?: Record<string, unknown>): void {
    const event: WorkflowEvent = {
      type,
      timestamp: new Date(),
      workflowId: this.workflow.id,
      nodeId,
      nodeName,
      data,
    }
    
    // Spezifische Listener
    const listeners = this.eventListeners.get(type) || []
    listeners.forEach(listener => listener(event))
    
    // Wildcard Listener
    const wildcardListeners = this.eventListeners.get("*") || []
    wildcardListeners.forEach(listener => listener(event))
  }

  // Automatisches Snapshot bei wichtigen Events
  private autoSnapshot(): void {
    const snapshot = this.createSnapshot()
    this.snapshots.push(snapshot)
    
    // Limit Anzahl der Snapshots
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift()
    }
  }

  // Alle Snapshots abrufen
  getSnapshots(): WorkflowSnapshot[] {
    return [...this.snapshots]
  }

  // Letzten Snapshot abrufen
  getLastSnapshot(): WorkflowSnapshot | undefined {
    return this.snapshots[this.snapshots.length - 1]
  }

  // Hilfsfunktion: Output analysieren und strukturierte Ergebnisse extrahieren
  private parseOutputMetadata(output: string): WorkflowStepResult["metadata"] {
    const metadata: WorkflowStepResult["metadata"] = {}
    
    // Dateien aus Code-Blöcken extrahieren
    const filePathMatches = output.match(/\/\/ filepath: ([^\n]+)/g)
    if (filePathMatches) {
      metadata.filesGenerated = filePathMatches.map(m => m.replace("// filepath: ", "").trim())
    }
    
    // Fehler erkennen
    const errorPatterns = [/error/gi, /fehler/gi, /failed/gi]
    const errors: string[] = []
    for (const pattern of errorPatterns) {
      const matches = output.match(pattern)
      if (matches) {
        errors.push(...matches)
      }
    }
    if (errors.length > 0) {
      metadata.errorsFound = [...new Set(errors)]
    }
    
    // Code-Blöcke zählen
    const codeBlockMatches = output.match(/```(\w+)?/g)
    if (codeBlockMatches) {
      metadata.codeBlocks = codeBlockMatches.map(m => ({
        language: m.replace("```", "") || "unknown"
      }))
    }
    
    // Erste Zeile als Summary
    const firstLine = output.split("\n")[0]?.trim()
    if (firstLine && firstLine.length < 200) {
      metadata.summary = firstLine
    }
    
    return Object.keys(metadata).length > 0 ? metadata : undefined
  }

  // Metriken berechnen
  private calculateMetrics(): WorkflowMetrics {
    const results = Object.values(this.state.nodeResults)
    const completedNodes = results.filter(r => r.success).length
    const failedNodes = results.filter(r => !r.success).length
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0)
    const avgNodeDuration = results.length > 0 ? totalDuration / results.length : 0
    
    // Dateien und Fehler zählen
    let filesGenerated = 0
    let errorsDetected = 0
    let suggestionsGenerated = 0
    
    for (const result of results) {
      filesGenerated += result.metadata?.filesGenerated?.length || 0
      errorsDetected += result.metadata?.errorsFound?.length || 0
      suggestionsGenerated += result.metadata?.suggestionsCount || 0
    }
    
    // Qualitäts-Scores berechnen
    const codeQualityScore = failedNodes === 0 
      ? Math.min(100, 70 + (filesGenerated * 5) - (errorsDetected * 10))
      : Math.max(0, 50 - (failedNodes * 20))
    
    return {
      totalNodes: this.workflow.nodes.length,
      completedNodes,
      failedNodes,
      totalDuration,
      avgNodeDuration: Math.round(avgNodeDuration),
      filesGenerated,
      errorsDetected,
      suggestionsGenerated,
      retryCount: 0,
      codeQualityScore: Math.max(0, Math.min(100, codeQualityScore)),
    }
  }

  // Vorheriges Ergebnis für Human-Decision abrufen
  private getPreviousResult(nodeId: string): WorkflowStepResult | undefined {
    const incomingEdge = this.workflow.edges.find(e => e.target === nodeId)
    if (!incomingEdge) return undefined
    return this.state.nodeResults[incomingEdge.source]
  }

  // Optionen basierend auf vorherigem Output filtern
  private filterOptionsByCondition(
    options: HumanDecisionOption[],
    previousResult?: WorkflowStepResult
  ): HumanDecisionOption[] {
    if (!previousResult) return options
    
    return options.filter(option => {
      if (!option.showCondition || option.showCondition.type === "always") {
        return true
      }
      
      const output = previousResult.output.toLowerCase()
      const value = option.showCondition.value?.toLowerCase() || ""
      
      switch (option.showCondition.type) {
        case "output-contains":
          return output.includes(value)
        case "output-matches":
          try {
            return new RegExp(value, "i").test(previousResult.output)
          } catch {
            return false
          }
        case "has-errors":
          return (previousResult.metadata?.errorsFound?.length || 0) > 0
        case "has-files":
          return (previousResult.metadata?.filesGenerated?.length || 0) > 0
        default:
          return true
      }
    })
  }

  // Workflow starten
  async start(): Promise<void> {
    this.log("Workflow gestartet", "info")
    this.emit("workflow:started")
    this.autoSnapshot()
    
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
    this.emit("node:started", nodeId, node.data.label, { nodeType: node.type })

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
          // Setze erfolgreiches Ergebnis für Start-Node
          this.state.nodeResults[nodeId] = {
            nodeId,
            nodeName: node.data.label,
            nodeType: "start",
            output: "Workflow gestartet",
            success: true,
            duration: 0,
            timestamp: new Date(),
          }
          nextNodeId = this.getNextNode(nodeId)
          break

        case "end":
          // End-Node: Workflow beenden
          // Setze erfolgreiches Ergebnis für End-Node
          this.state.nodeResults[nodeId] = {
            nodeId,
            nodeName: node.data.label,
            nodeType: "end",
            output: "Workflow erfolgreich abgeschlossen",
            success: true,
            duration: 0,
            timestamp: new Date(),
          }
          
          // Berechne finale Metriken
          const finalMetrics = this.calculateMetrics()
          
          this.state = {
            ...this.state,
            status: "completed",
            currentNodeId: null,
            completedAt: new Date(),
            metrics: finalMetrics,
          }
          this.onStateChange(this.state)
          this.log(`Workflow abgeschlossen - ${finalMetrics.filesGenerated} Dateien, ${finalMetrics.errorsDetected} Fehler, Qualität: ${finalMetrics.codeQualityScore}%`, "info")
          this.emit("workflow:completed", nodeId, node.data.label, { metrics: finalMetrics })
          this.autoSnapshot()
          shouldContinue = false
          break

        case "agent": {
          // Agent ausführen
          if (!node.data.agentId) {
            this.setError(`Agent-Node ${nodeId} hat keine agentId`)
            return
          }
          
          const startTime = Date.now()
          this.emit("agent:started", nodeId, node.data.label, { agentId: node.data.agentId })
          
          // Timeout setzen
          const nodeTimeout = node.data.timeout ? node.data.timeout * 1000 : this.defaultTimeout
          this.setNodeTimeout(nodeId, nodeTimeout)
          
          // Vorherigen Output als Kontext übergeben
          const previousOutput = this.getPreviousOutput(nodeId)
          output = await this.onAgentExecute(node.data.agentId, previousOutput, this.sharedContext)
          
          // Timeout löschen nach erfolgreicher Ausführung
          this.clearNodeTimeout(nodeId)
          
          const duration = Date.now() - startTime
          
          // Strukturiertes Ergebnis speichern
          const agentResult: WorkflowStepResult = {
            nodeId,
            nodeName: node.data.label,
            nodeType: node.type,
            output,
            success: !output.toLowerCase().includes("error") && !output.toLowerCase().includes("fehler"),
            duration,
            timestamp: new Date(),
            metadata: this.parseOutputMetadata(output),
          }
          this.state.nodeResults[nodeId] = agentResult
          this.state.nodeOutputs[nodeId] = output
          
          // Performance tracken
          const filesGenerated = agentResult.metadata?.filesGenerated?.length || 0
          this.trackAgentPerformance(node.data.agentId, duration, agentResult.success, filesGenerated)
          
          // Context für andere Agents extrahieren und teilen
          this.extractAndShareContext(node.data.agentId, output)
          
          this.log(`Agent ${node.data.agentId} abgeschlossen: ${filesGenerated} Dateien, ${agentResult.metadata?.errorsFound?.length || 0} Fehler`, "info")
          this.emit("agent:completed", nodeId, node.data.label, { 
            agentId: node.data.agentId, 
            duration, 
            success: agentResult.success,
            filesGenerated,
          })
          this.emit("node:completed", nodeId, node.data.label, { success: agentResult.success })
          this.autoSnapshot()
          
          nextNodeId = this.getNextNode(nodeId)
          break
        }

        case "human-decision": {
          // Vorheriges Ergebnis für kontextbasierte Entscheidung abrufen
          const previousResult = this.getPreviousResult(nodeId)
          
          // Optionen basierend auf vorherigem Output filtern
          const allOptions = node.data.options || []
          const filteredOptions = this.filterOptionsByCondition(allOptions, previousResult)
          
          // Frage mit Kontext anreichern
          let contextualQuestion = node.data.question || "Wie soll fortgefahren werden?"
          if (previousResult?.metadata) {
            const meta = previousResult.metadata
            const contextParts: string[] = []
            if (meta.filesGenerated?.length) {
              contextParts.push(`${meta.filesGenerated.length} Datei(en) generiert`)
            }
            if (meta.errorsFound?.length) {
              contextParts.push(`${meta.errorsFound.length} Fehler gefunden`)
            }
            if (meta.summary) {
              contextParts.push(`Zusammenfassung: ${meta.summary}`)
            }
            if (contextParts.length > 0) {
              contextualQuestion = `**Vorheriger Schritt:** ${contextParts.join(", ")}\n\n${contextualQuestion}`
            }
          }
          
          this.state = {
            ...this.state,
            status: "waiting-human",
            humanDecisionPending: {
              nodeId,
              question: contextualQuestion,
              options: filteredOptions.length > 0 ? filteredOptions : allOptions,
              timeoutAt: node.data.timeout 
                ? new Date(Date.now() + node.data.timeout * 1000)
                : undefined,
              previousResult,
            },
          }
          this.onStateChange(this.state)
          
          // Auf Entscheidung warten
          const selectedOptionId = await this.onHumanDecision(
            nodeId,
            contextualQuestion,
            filteredOptions.length > 0 ? filteredOptions : allOptions
          )
          
          // Option finden und nächsten Node bestimmen
          const selectedOption = allOptions.find(o => o.id === selectedOptionId)
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
        }

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

  // Bedingungen auswerten (unterstützt verschiedene Formate)
  private evaluateConditions(node: WorkflowNode, output: string | undefined): string | null {
    if (!node.data.conditions || !output) {
      return this.getNextNode(node.id)
    }

    const outputLower = output.toLowerCase()

    for (const condition of node.data.conditions) {
      let matches = false
      
      // Expression-basierte Auswertung (für Auto-Fix Pipeline)
      if (condition.expression) {
        try {
          // Sichere Auswertung der Expression
          const evalContext = {
            output: outputLower,
            hasErrors: outputLower.includes("error") || outputLower.includes("fehler"),
            hasWarnings: outputLower.includes("warning") || outputLower.includes("warnung"),
            hasIssues: outputLower.includes("problem") || outputLower.includes("issue") || 
                       outputLower.includes("sollte") || outputLower.includes("verbessern") ||
                       outputLower.includes("empfehlung") || outputLower.includes("könnte"),
            isSuccess: outputLower.includes("erfolgreich") || outputLower.includes("success") ||
                      outputLower.includes("korrekt") || outputLower.includes("gut"),
            fileCount: (output.match(/```/g) || []).length / 2,
          }
          
          // Ersetze Variablen in Expression
          let expr = condition.expression
          expr = expr.replace(/output\.includes\(['"]([^'"]+)['"]\)/g, (_match: string, text: string) => 
            String(outputLower.includes(text.toLowerCase()))
          )
          expr = expr.replace(/hasErrors/g, String(evalContext.hasErrors))
          expr = expr.replace(/hasWarnings/g, String(evalContext.hasWarnings))
          expr = expr.replace(/hasIssues/g, String(evalContext.hasIssues))
          expr = expr.replace(/isSuccess/g, String(evalContext.isSuccess))
          expr = expr.replace(/fileCount/g, String(evalContext.fileCount))
          
          // Auswertung
          matches = expr === "true" || eval(expr) === true
        } catch (e) {
          this.log(`Expression-Fehler: ${e}`, "warn")
          matches = false
        }
      } else if (condition.type && condition.value) {
        // Legacy-Formate mit type und value
        switch (condition.type) {
          case "output-contains":
            matches = outputLower.includes(condition.value.toLowerCase())
            break
          case "output-matches":
            try {
              matches = new RegExp(condition.value, "i").test(output)
            } catch {
              matches = false
            }
            break
          case "error-occurred":
            matches = outputLower.includes("error") || outputLower.includes("fehler")
            break
          case "success":
            matches = outputLower.includes("erfolgreich") || outputLower.includes("success")
            break
          case "has-issues":
            matches = outputLower.includes("problem") || outputLower.includes("issue") ||
                     outputLower.includes("sollte") || outputLower.includes("verbessern")
            break
          default:
            matches = false
        }
      } else if (condition.type) {
        // Type ohne value (für error-occurred, success, has-issues)
        switch (condition.type) {
          case "error-occurred":
            matches = outputLower.includes("error") || outputLower.includes("fehler")
            break
          case "success":
            matches = outputLower.includes("erfolgreich") || outputLower.includes("success")
            break
          case "has-issues":
            matches = outputLower.includes("problem") || outputLower.includes("issue") ||
                     outputLower.includes("sollte") || outputLower.includes("verbessern")
            break
          default:
            matches = false
        }
      }

      if (matches) {
        this.log(`Bedingung erfüllt: ${condition.label || condition.id}`, "debug")
        const targetNode = condition.targetNodeId || condition.nextNodeId
        return targetNode ?? null
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
    const currentNode = this.state.currentNodeId
    if (this.state.status === "paused" && currentNode) {
      this.state = { ...this.state, status: "running" }
      this.onStateChange(this.state)
      this.log("Workflow fortgesetzt", "info")
      this.executeNode(currentNode)
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

  // Snapshot erstellen für Rollback
  createSnapshot(): WorkflowSnapshot {
    return {
      id: `snapshot-${Date.now()}`,
      timestamp: new Date(),
      state: JSON.parse(JSON.stringify(this.state)),
      workflowId: this.workflow.id,
    }
  }

  // Rollback zu einem Snapshot
  restoreSnapshot(snapshot: WorkflowSnapshot): void {
    if (snapshot.workflowId !== this.workflow.id) {
      this.log("Snapshot gehört zu anderem Workflow", "error")
      return
    }
    
    this.state = JSON.parse(JSON.stringify(snapshot.state))
    this.onStateChange(this.state)
    this.log(`Rollback zu Snapshot ${snapshot.id}`, "info")
  }

  // Zu einem bestimmten Node springen (für Debugging/Retry)
  async jumpToNode(nodeId: string): Promise<void> {
    const node = this.workflow.nodes.find(n => n.id === nodeId)
    if (!node) {
      this.log(`Node ${nodeId} nicht gefunden`, "error")
      return
    }
    
    this.log(`Springe zu Node: ${node.data.label}`, "info")
    this.state = {
      ...this.state,
      status: "running",
      currentNodeId: nodeId,
    }
    this.onStateChange(this.state)
    await this.executeNode(nodeId)
  }

  // Einen Node erneut ausführen
  async retryNode(nodeId: string): Promise<void> {
    const node = this.workflow.nodes.find(n => n.id === nodeId)
    if (!node) {
      this.log(`Node ${nodeId} nicht gefunden`, "error")
      return
    }
    
    // Entferne vorheriges Ergebnis
    delete this.state.nodeResults[nodeId]
    delete this.state.nodeOutputs[nodeId]
    
    // Entferne Node aus visited (damit er nochmal ausgeführt wird)
    this.state.visitedNodes = this.state.visitedNodes.filter(id => id !== nodeId)
    
    this.log(`Node ${node.data.label} wird erneut ausgeführt`, "info")
    await this.jumpToNode(nodeId)
  }

  // Workflow-Statistiken abrufen
  getStatistics(): WorkflowStatistics {
    const results = Object.values(this.state.nodeResults)
    const durations = results.map(r => r.duration).filter(d => d > 0)
    
    return {
      totalNodes: this.workflow.nodes.length,
      executedNodes: this.state.visitedNodes.length,
      successfulNodes: results.filter(r => r.success).length,
      failedNodes: results.filter(r => !r.success).length,
      pendingNodes: this.workflow.nodes.length - this.state.visitedNodes.length,
      totalDuration: durations.reduce((sum, d) => sum + d, 0),
      avgNodeDuration: durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / durations.length : 0,
      minNodeDuration: durations.length > 0 ? Math.min(...durations) : 0,
      maxNodeDuration: durations.length > 0 ? Math.max(...durations) : 0,
      filesGenerated: results.reduce((sum, r) => sum + (r.metadata?.filesGenerated?.length || 0), 0),
      errorsDetected: results.reduce((sum, r) => sum + (r.metadata?.errorsFound?.length || 0), 0),
      currentProgress: this.state.visitedNodes.length / this.workflow.nodes.length * 100,
    }
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
    this.emit("workflow:error", undefined, undefined, { error: message })
  }

  // Agent-Performance tracken
  private trackAgentPerformance(
    agentId: string, 
    duration: number, 
    success: boolean, 
    filesGenerated: number
  ): void {
    const existing = this.agentPerformance.get(agentId) || {
      agentId,
      executionCount: 0,
      totalDuration: 0,
      avgDuration: 0,
      successCount: 0,
      failureCount: 0,
      successRate: 0,
      filesGeneratedTotal: 0,
    }
    
    existing.executionCount++
    existing.totalDuration += duration
    existing.avgDuration = existing.totalDuration / existing.executionCount
    existing.filesGeneratedTotal += filesGenerated
    existing.lastExecution = new Date()
    
    if (success) {
      existing.successCount++
    } else {
      existing.failureCount++
    }
    existing.successRate = existing.successCount / existing.executionCount * 100
    
    this.agentPerformance.set(agentId, existing)
  }

  // Agent-Performance abrufen
  getAgentPerformance(agentId?: string): AgentPerformance | AgentPerformance[] | undefined {
    if (agentId) {
      return this.agentPerformance.get(agentId)
    }
    return Array.from(this.agentPerformance.values())
  }

  // Shared Context aktualisieren
  updateSharedContext(updates: Partial<SharedAgentContext>): void {
    if (updates.projectSummary) {
      this.sharedContext.projectSummary = updates.projectSummary
    }
    if (updates.keyDecisions) {
      this.sharedContext.keyDecisions.push(...updates.keyDecisions)
    }
    if (updates.identifiedIssues) {
      this.sharedContext.identifiedIssues.push(...updates.identifiedIssues)
    }
    if (updates.completedTasks) {
      this.sharedContext.completedTasks.push(...updates.completedTasks)
    }
    if (updates.sharedVariables) {
      this.sharedContext.sharedVariables = {
        ...this.sharedContext.sharedVariables,
        ...updates.sharedVariables,
      }
    }
  }

  // Shared Context abrufen
  getSharedContext(): SharedAgentContext {
    return { ...this.sharedContext }
  }

  // Context aus Agent-Output extrahieren und teilen
  private extractAndShareContext(agentId: string, output: string): void {
    const outputLower = output.toLowerCase()
    
    // Entscheidungen extrahieren
    if (outputLower.includes("entscheid") || outputLower.includes("gewählt") || outputLower.includes("verwende")) {
      const decisions = output.match(/(?:entscheid|gewählt|verwende)[^.!?\n]{10,100}/gi)
      if (decisions) {
        this.sharedContext.keyDecisions.push(...decisions.slice(0, 3))
      }
    }
    
    // Issues extrahieren
    if (outputLower.includes("problem") || outputLower.includes("fehler") || outputLower.includes("issue")) {
      const issues = output.match(/(?:problem|fehler|issue)[^.!?\n]{10,100}/gi)
      if (issues) {
        this.sharedContext.identifiedIssues.push(...issues.slice(0, 3))
      }
    }
    
    // Abgeschlossene Tasks markieren
    this.sharedContext.completedTasks.push(`${agentId}: Ausführung abgeschlossen`)
  }

  // Timeout für Node setzen
  private setNodeTimeout(nodeId: string, timeout?: number): void {
    const timeoutMs = timeout || this.defaultTimeout
    
    const timeoutHandle = setTimeout(() => {
      this.log(`Node ${nodeId} Timeout nach ${timeoutMs / 1000}s`, "error")
      this.emit("node:failed", nodeId, undefined, { reason: "timeout" })
      // Setze Fehler-Status aber stoppe Workflow nicht komplett
      this.state.nodeResults[nodeId] = {
        nodeId,
        nodeName: "Timeout",
        nodeType: "agent",
        output: `Timeout nach ${timeoutMs / 1000} Sekunden`,
        success: false,
        duration: timeoutMs,
        timestamp: new Date(),
      }
    }, timeoutMs)
    
    this.nodeTimeouts.set(nodeId, timeoutHandle)
  }

  // Timeout für Node löschen
  private clearNodeTimeout(nodeId: string): void {
    const timeout = this.nodeTimeouts.get(nodeId)
    if (timeout) {
      clearTimeout(timeout)
      this.nodeTimeouts.delete(nodeId)
    }
  }

  // Alle Timeouts löschen
  clearAllTimeouts(): void {
    this.nodeTimeouts.forEach((timeout) => clearTimeout(timeout))
    this.nodeTimeouts.clear()
  }

  // === OUTPUT CACHING ===
  
  // Cache-Key generieren basierend auf Agent und Input
  private generateCacheKey(agentId: string, input: string): string {
    // Einfacher Hash für Cache-Key
    let hash = 0
    const str = `${agentId}:${input.slice(0, 500)}`
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return `${agentId}-${Math.abs(hash).toString(16)}`
  }

  // Prüfe ob Cache-Eintrag gültig ist
  private isCacheValid(cacheKey: string): boolean {
    const cached = this.outputCache.get(cacheKey)
    if (!cached) return false
    
    const age = Date.now() - cached.timestamp.getTime()
    return age < this.cacheTTL
  }

  // Output aus Cache holen
  getCachedOutput(agentId: string, input: string): string | undefined {
    if (!this.cacheEnabled) return undefined
    
    const cacheKey = this.generateCacheKey(agentId, input)
    if (this.isCacheValid(cacheKey)) {
      const cached = this.outputCache.get(cacheKey)
      this.log(`Cache-Hit für ${agentId}`, "debug")
      return cached?.output
    }
    return undefined
  }

  // Output im Cache speichern
  cacheOutput(agentId: string, input: string, output: string): void {
    if (!this.cacheEnabled) return
    
    const cacheKey = this.generateCacheKey(agentId, input)
    this.outputCache.set(cacheKey, {
      output,
      timestamp: new Date(),
      hash: cacheKey,
    })
    
    // Cache-Größe limitieren (max 50 Einträge)
    if (this.outputCache.size > 50) {
      const oldestKey = this.outputCache.keys().next().value
      if (oldestKey) this.outputCache.delete(oldestKey)
    }
  }

  // Cache leeren
  clearCache(): void {
    this.outputCache.clear()
    this.log("Cache geleert", "info")
  }

  // Cache aktivieren/deaktivieren
  setCacheEnabled(enabled: boolean): void {
    this.cacheEnabled = enabled
  }

  // === PRIORITY QUEUE ===
  
  // Node zur Priority-Queue hinzufügen
  addToPriorityQueue(nodeId: string, priority: number = 0): void {
    this.priorityQueue.push({ nodeId, priority })
    // Sortiere nach Priorität (höher = wichtiger)
    this.priorityQueue.sort((a, b) => b.priority - a.priority)
  }

  // Nächsten Node aus Queue holen
  getNextFromQueue(): string | undefined {
    const next = this.priorityQueue.shift()
    return next?.nodeId
  }

  // Queue-Länge
  getQueueLength(): number {
    return this.priorityQueue.length
  }

  // Queue leeren
  clearQueue(): void {
    this.priorityQueue = []
  }

  // Parallele Nodes zur Queue hinzufügen
  queueParallelNodes(nodeIds: string[], basePriority: number = 0): void {
    nodeIds.forEach((nodeId, index) => {
      // Gleichmäßige Priorität für parallele Ausführung
      this.addToPriorityQueue(nodeId, basePriority)
    })
    this.log(`${nodeIds.length} Nodes zur Queue hinzugefügt`, "debug")
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

  "auto-fix": {
    id: "template-autofix",
    name: "Auto-Fix Pipeline",
    description: "Automatische Entwicklung mit Review und Fehlerkorrektur-Schleife",
    nodes: [
      { id: "start", type: "start", position: { x: 50, y: 200 }, data: { label: "Start" } },
      { id: "planner", type: "agent", position: { x: 200, y: 200 }, data: { label: "Planner", agentId: "planner" } },
      { id: "coder", type: "agent", position: { x: 400, y: 200 }, data: { label: "Coder", agentId: "coder" } },
      { id: "reviewer", type: "agent", position: { x: 600, y: 200 }, data: { label: "Reviewer", agentId: "reviewer" } },
      { 
        id: "quality-check", 
        type: "condition", 
        position: { x: 800, y: 200 }, 
        data: { 
          label: "Qualität OK?",
          conditions: [
            { 
              id: "has-issues", 
              expression: "output.includes('Problem') || output.includes('Fehler') || output.includes('sollte') || output.includes('verbessern')",
              targetNodeId: "fix-coder"
            },
            { 
              id: "quality-ok", 
              expression: "true",
              targetNodeId: "security"
            }
          ]
        } 
      },
      { id: "fix-coder", type: "agent", position: { x: 800, y: 50 }, data: { label: "Fix-Coder", agentId: "coder" } },
      { id: "security", type: "agent", position: { x: 1000, y: 200 }, data: { label: "Security", agentId: "security" } },
      { id: "end", type: "end", position: { x: 1200, y: 200 }, data: { label: "Ende" } },
    ],
    edges: [
      { id: "e1", source: "start", target: "planner" },
      { id: "e2", source: "planner", target: "coder" },
      { id: "e3", source: "coder", target: "reviewer" },
      { id: "e4", source: "reviewer", target: "quality-check" },
      { id: "e5", source: "quality-check", target: "fix-coder", label: "Issues" },
      { id: "e6", source: "quality-check", target: "security", label: "OK" },
      { id: "e7", source: "fix-coder", target: "reviewer" },
      { id: "e8", source: "security", target: "end" },
    ],
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },

  "iterative-dev": {
    id: "template-iterative",
    name: "Iterative Entwicklung",
    description: "Schnelle Entwicklung mit Verbesserungsschleife",
    nodes: [
      { id: "start", type: "start", position: { x: 50, y: 200 }, data: { label: "Start" } },
      { id: "coder", type: "agent", position: { x: 250, y: 200 }, data: { label: "Coder", agentId: "coder" } },
      { 
        id: "continue-decision", 
        type: "human-decision", 
        position: { x: 500, y: 200 }, 
        data: { 
          label: "Weiter?",
          question: "Wie soll mit dem Code fortgefahren werden?",
          options: [
            { id: "improve", label: "Verbessern", description: "Code weiter optimieren", nextNodeId: "coder" },
            { id: "review", label: "Review", description: "Code prüfen lassen", nextNodeId: "reviewer" },
            { id: "done", label: "Fertig", description: "Code ist vollständig", nextNodeId: "end" },
          ]
        } 
      },
      { id: "reviewer", type: "agent", position: { x: 700, y: 100 }, data: { label: "Reviewer", agentId: "reviewer" } },
      { id: "end", type: "end", position: { x: 750, y: 200 }, data: { label: "Ende" } },
    ],
    edges: [
      { id: "e1", source: "start", target: "coder" },
      { id: "e2", source: "coder", target: "continue-decision" },
      { id: "e3", source: "continue-decision", target: "coder", label: "Verbessern" },
      { id: "e4", source: "continue-decision", target: "reviewer", label: "Review" },
      { id: "e5", source: "continue-decision", target: "end", label: "Fertig" },
      { id: "e6", source: "reviewer", target: "continue-decision" },
    ],
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },

  "rapid-prototype": {
    id: "template-rapid",
    name: "Rapid Prototyping",
    description: "Schneller Prototyp ohne Review - ideal für Experimente",
    nodes: [
      { id: "start", type: "start", position: { x: 50, y: 200 }, data: { label: "Start" } },
      { id: "coder", type: "agent", position: { x: 250, y: 200 }, data: { label: "Coder", agentId: "coder", timeout: 120 } },
      { id: "end", type: "end", position: { x: 450, y: 200 }, data: { label: "Ende" } },
    ],
    edges: [
      { id: "e1", source: "start", target: "coder" },
      { id: "e2", source: "coder", target: "end" },
    ],
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },

  "security-first": {
    id: "template-security",
    name: "Security-First Pipeline",
    description: "Sicherheitsorientierte Entwicklung mit doppeltem Security-Check",
    nodes: [
      { id: "start", type: "start", position: { x: 50, y: 200 }, data: { label: "Start" } },
      { id: "planner", type: "agent", position: { x: 200, y: 200 }, data: { label: "Planner", agentId: "planner" } },
      { id: "security-pre", type: "agent", position: { x: 400, y: 200 }, data: { label: "Security (Architektur)", agentId: "security" } },
      { id: "coder", type: "agent", position: { x: 600, y: 200 }, data: { label: "Coder", agentId: "coder" } },
      { id: "security-post", type: "agent", position: { x: 800, y: 200 }, data: { label: "Security (Code)", agentId: "security" } },
      { 
        id: "security-decision", 
        type: "condition", 
        position: { x: 1000, y: 200 }, 
        data: { 
          label: "Sicher?",
          conditions: [
            { id: "has-vulnerabilities", expression: "hasErrors || output.includes('vulnerab') || output.includes('risiko')", targetNodeId: "coder" },
            { id: "secure", expression: "true", targetNodeId: "end" }
          ]
        } 
      },
      { id: "end", type: "end", position: { x: 1200, y: 200 }, data: { label: "Ende" } },
    ],
    edges: [
      { id: "e1", source: "start", target: "planner" },
      { id: "e2", source: "planner", target: "security-pre" },
      { id: "e3", source: "security-pre", target: "coder" },
      { id: "e4", source: "coder", target: "security-post" },
      { id: "e5", source: "security-post", target: "security-decision" },
      { id: "e6", source: "security-decision", target: "coder", label: "Unsicher" },
      { id: "e7", source: "security-decision", target: "end", label: "Sicher" },
    ],
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },

  "tdd-workflow": {
    id: "template-tdd",
    name: "Test-Driven Development",
    description: "TDD-Ansatz: Erst Tests, dann Implementation",
    nodes: [
      { id: "start", type: "start", position: { x: 50, y: 200 }, data: { label: "Start" } },
      { id: "planner", type: "agent", position: { x: 200, y: 200 }, data: { label: "Test-Planner", agentId: "planner" } },
      { id: "test-coder", type: "agent", position: { x: 400, y: 200 }, data: { label: "Test-Coder", agentId: "coder" } },
      { id: "impl-coder", type: "agent", position: { x: 600, y: 200 }, data: { label: "Implementation", agentId: "coder" } },
      { id: "reviewer", type: "agent", position: { x: 800, y: 200 }, data: { label: "Test-Reviewer", agentId: "reviewer" } },
      { 
        id: "tests-pass", 
        type: "condition", 
        position: { x: 1000, y: 200 }, 
        data: { 
          label: "Tests OK?",
          conditions: [
            { id: "failing", expression: "hasErrors || output.includes('failed') || output.includes('fehler')", targetNodeId: "impl-coder" },
            { id: "passing", expression: "true", targetNodeId: "end" }
          ]
        } 
      },
      { id: "end", type: "end", position: { x: 1200, y: 200 }, data: { label: "Ende" } },
    ],
    edges: [
      { id: "e1", source: "start", target: "planner" },
      { id: "e2", source: "planner", target: "test-coder" },
      { id: "e3", source: "test-coder", target: "impl-coder" },
      { id: "e4", source: "impl-coder", target: "reviewer" },
      { id: "e5", source: "reviewer", target: "tests-pass" },
      { id: "e6", source: "tests-pass", target: "impl-coder", label: "Fehlgeschlagen" },
      { id: "e7", source: "tests-pass", target: "end", label: "Bestanden" },
    ],
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
}

// Workflow-Validierung
export interface WorkflowValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export function validateWorkflow(workflow: WorkflowGraph): WorkflowValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  
  // Prüfe auf Start-Node
  const startNodes = workflow.nodes.filter(n => n.type === "start")
  if (startNodes.length === 0) {
    errors.push("Workflow hat keinen Start-Node")
  } else if (startNodes.length > 1) {
    errors.push("Workflow hat mehrere Start-Nodes (nur einer erlaubt)")
  }
  
  // Prüfe auf End-Node
  const endNodes = workflow.nodes.filter(n => n.type === "end")
  if (endNodes.length === 0) {
    errors.push("Workflow hat keinen End-Node")
  }
  
  // Prüfe ob alle Nodes erreichbar sind
  const reachableNodes = new Set<string>()
  if (startNodes.length > 0) {
    const queue = [startNodes[0].id]
    while (queue.length > 0) {
      const nodeId = queue.shift()!
      if (reachableNodes.has(nodeId)) continue
      reachableNodes.add(nodeId)
      
      // Finde alle ausgehenden Edges
      const outgoing = workflow.edges.filter(e => e.source === nodeId)
      outgoing.forEach(e => queue.push(e.target))
    }
  }
  
  const unreachableNodes = workflow.nodes.filter(n => !reachableNodes.has(n.id))
  if (unreachableNodes.length > 0) {
    warnings.push(`Nicht erreichbare Nodes: ${unreachableNodes.map(n => n.data.label).join(", ")}`)
  }
  
  // Prüfe ob Agent-Nodes eine agentId haben
  const agentNodes = workflow.nodes.filter(n => n.type === "agent")
  agentNodes.forEach(node => {
    if (!node.data.agentId) {
      errors.push(`Agent-Node "${node.data.label}" hat keine agentId`)
    }
  })
  
  // Prüfe auf verwaiste Edges
  const nodeIds = new Set(workflow.nodes.map(n => n.id))
  workflow.edges.forEach(edge => {
    if (!nodeIds.has(edge.source)) {
      errors.push(`Edge "${edge.id}" hat ungültige Source: ${edge.source}`)
    }
    if (!nodeIds.has(edge.target)) {
      errors.push(`Edge "${edge.id}" hat ungültiges Target: ${edge.target}`)
    }
  })
  
  // Prüfe Human-Decision Nodes
  const humanDecisionNodes = workflow.nodes.filter(n => n.type === "human-decision")
  humanDecisionNodes.forEach(node => {
    if (!node.data.options || node.data.options.length === 0) {
      errors.push(`Human-Decision "${node.data.label}" hat keine Optionen`)
    }
    if (!node.data.question) {
      warnings.push(`Human-Decision "${node.data.label}" hat keine Frage definiert`)
    }
  })
  
  // Prüfe Condition Nodes
  const conditionNodes = workflow.nodes.filter(n => n.type === "condition")
  conditionNodes.forEach(node => {
    if (!node.data.conditions || node.data.conditions.length === 0) {
      errors.push(`Condition-Node "${node.data.label}" hat keine Bedingungen`)
    }
  })
  
  // Warnungen für Best Practices
  if (workflow.nodes.length > 15) {
    warnings.push("Workflow hat viele Nodes (>15) - erwäge Aufteilung in Sub-Workflows")
  }
  
  if (!workflow.description || workflow.description.length < 10) {
    warnings.push("Workflow sollte eine aussagekräftige Beschreibung haben")
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

// Workflow klonen
export function cloneWorkflow(workflow: WorkflowGraph, newName?: string): WorkflowGraph {
  return {
    ...JSON.parse(JSON.stringify(workflow)),
    id: `workflow-${Date.now()}`,
    name: newName || `${workflow.name} (Kopie)`,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

// Workflow aus Template erstellen
export function createFromTemplate(templateId: string, customName?: string): WorkflowGraph | undefined {
  const template = WORKFLOW_TEMPLATES[templateId]
  if (!template) return undefined
  
  return cloneWorkflow(template, customName)
}
