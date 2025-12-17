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
export class WorkflowEngine {
  private workflow: WorkflowGraph
  private state: WorkflowExecutionState
  private onStateChange: (state: WorkflowExecutionState) => void
  private onAgentExecute: (agentId: string, previousOutput?: string) => Promise<string>
  private onHumanDecision: (nodeId: string, question: string, options: HumanDecisionOption[]) => Promise<string>
  private onLog: (message: string, level: "info" | "warn" | "error" | "debug") => void
  private eventListeners: Map<WorkflowEventType | "*", WorkflowEventListener[]> = new Map()
  private snapshots: WorkflowSnapshot[] = []
  private maxSnapshots: number = 10

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
          
          // Vorherigen Output als Kontext übergeben
          const previousOutput = this.getPreviousOutput(nodeId)
          output = await this.onAgentExecute(node.data.agentId, previousOutput)
          
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
          
          this.log(`Agent ${node.data.agentId} abgeschlossen: ${agentResult.metadata?.filesGenerated?.length || 0} Dateien, ${agentResult.metadata?.errorsFound?.length || 0} Fehler`, "info")
          this.emit("agent:completed", nodeId, node.data.label, { 
            agentId: node.data.agentId, 
            duration, 
            success: agentResult.success,
            filesGenerated: agentResult.metadata?.filesGenerated?.length || 0,
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
}
