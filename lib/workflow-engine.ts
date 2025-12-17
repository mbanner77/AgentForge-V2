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

// Workflow-Hooks für Erweiterbarkeit
export type WorkflowHookType = 
  | "beforeNodeExecute"
  | "afterNodeExecute"
  | "beforeAgentCall"
  | "afterAgentCall"
  | "onError"
  | "onRetry"
  | "beforeWorkflowStart"
  | "afterWorkflowComplete"

export interface WorkflowHookContext {
  nodeId?: string
  nodeName?: string
  agentId?: string
  input?: string
  output?: string
  error?: Error
  duration?: number
  retryCount?: number
  state: WorkflowExecutionState
}

export type WorkflowHook = (context: WorkflowHookContext) => Promise<void> | void

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
  private hooks: Map<WorkflowHookType, WorkflowHook[]> = new Map()

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
    
    // Verbesserte Problemerkennung - nur echte Fehler zählen
    const errorIndicators = this.detectIssues(output)

    for (const condition of node.data.conditions) {
      let matches = false
      
      // Expression-basierte Auswertung (für Auto-Fix Pipeline)
      if (condition.expression) {
        try {
          // Sichere Auswertung der Expression mit verbesserter Logik
          const evalContext = {
            output: outputLower,
            hasErrors: errorIndicators.hasErrors,
            hasWarnings: errorIndicators.hasWarnings,
            hasIssues: errorIndicators.hasIssues,
            isSuccess: errorIndicators.isSuccess,
            fileCount: (output.match(/```/g) || []).length / 2,
            issueCount: errorIndicators.issues.length,
            issues: errorIndicators.issues,
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
            matches = errorIndicators.hasIssues
            break
          default:
            matches = false
        }
      } else if (condition.type) {
        // Type ohne value (für error-occurred, success, has-issues)
        switch (condition.type) {
          case "error-occurred":
            matches = errorIndicators.hasErrors
            break
          case "success":
            matches = errorIndicators.isSuccess
            break
          case "has-issues":
            matches = errorIndicators.hasIssues
            break
          default:
            matches = false
        }
      }

      if (matches) {
        this.log(`Bedingung erfüllt: ${condition.label || condition.id}`, "debug")
        if (errorIndicators.issues.length > 0) {
          this.log(`Gefundene Issues: ${errorIndicators.issues.join(", ")}`, "info")
        }
        const targetNode = condition.targetNodeId || condition.nextNodeId
        return targetNode ?? null
      }
    }

    // Fallback: Default Edge
    return this.getNextNode(node.id)
  }

  // Verbesserte Issue-Erkennung - unterscheidet echte Probleme von normalen Textinhalten
  private detectIssues(output: string): {
    hasErrors: boolean
    hasWarnings: boolean
    hasIssues: boolean
    isSuccess: boolean
    issues: string[]
  } {
    const outputLower = output.toLowerCase()
    const issues: string[] = []
    
    // Echte Fehler-Patterns (nicht nur das Wort "Fehler")
    const errorPatterns = [
      /error:\s*(.{10,80})/gi,
      /fehler:\s*(.{10,80})/gi,
      /exception:\s*(.{10,80})/gi,
      /failed:\s*(.{10,80})/gi,
      /cannot\s+(?:find|read|import|resolve)\s+(.{10,60})/gi,
      /undefined\s+is\s+not/gi,
      /null\s+is\s+not/gi,
      /typeerror:\s*(.{10,80})/gi,
      /syntaxerror:\s*(.{10,80})/gi,
      /referenceerror:\s*(.{10,80})/gi,
    ]
    
    // Warnungs-Patterns
    const warningPatterns = [
      /warning:\s*(.{10,80})/gi,
      /warnung:\s*(.{10,80})/gi,
      /deprecated:\s*(.{10,80})/gi,
    ]
    
    // Kritische Issue-Patterns (echte Probleme, nicht nur Empfehlungen)
    const issuePatterns = [
      /kritisch:\s*(.{10,80})/gi,
      /critical:\s*(.{10,80})/gi,
      /schwerwiegend:\s*(.{10,80})/gi,
      /sicherheitslücke:\s*(.{10,80})/gi,
      /vulnerability:\s*(.{10,80})/gi,
      /bug:\s*(.{10,60})/gi,
      /fehler\s+gefunden:\s*(.{10,80})/gi,
      /problem\s+gefunden:\s*(.{10,80})/gi,
    ]
    
    // Erfolgs-Patterns
    const successPatterns = [
      /erfolgreich\s+(?:erstellt|generiert|abgeschlossen)/i,
      /successfully\s+(?:created|generated|completed)/i,
      /✓|✅|done|fertig|completed/i,
      /code\s+(?:ist\s+)?(?:korrekt|funktioniert|läuft)/i,
      /keine\s+(?:fehler|probleme|issues)\s+gefunden/i,
      /no\s+(?:errors|issues|problems)\s+found/i,
    ]
    
    let hasErrors = false
    let hasWarnings = false
    let hasIssues = false
    
    // Prüfe auf echte Fehler
    for (const pattern of errorPatterns) {
      const matches = output.match(pattern)
      if (matches) {
        hasErrors = true
        matches.forEach(m => issues.push(m.trim().substring(0, 100)))
      }
    }
    
    // Prüfe auf Warnungen
    for (const pattern of warningPatterns) {
      if (pattern.test(output)) {
        hasWarnings = true
      }
    }
    
    // Prüfe auf kritische Issues
    for (const pattern of issuePatterns) {
      const matches = output.match(pattern)
      if (matches) {
        hasIssues = true
        matches.forEach(m => issues.push(m.trim().substring(0, 100)))
      }
    }
    
    // Prüfe auf Erfolg
    let isSuccess = false
    for (const pattern of successPatterns) {
      if (pattern.test(output)) {
        isSuccess = true
        break
      }
    }
    
    // Wenn keine expliziten Fehler gefunden und Code generiert wurde, ist es wahrscheinlich OK
    const hasGeneratedCode = (output.match(/```/g) || []).length >= 2
    if (!hasErrors && !hasIssues && hasGeneratedCode) {
      isSuccess = true
    }
    
    // hasIssues nur true wenn echte Probleme gefunden (nicht nur Empfehlungen)
    // "sollte", "könnte", "verbessern" sind KEINE echten Issues
    hasIssues = hasIssues || hasErrors
    
    // Dedupliziere Issues
    const uniqueIssues = [...new Set(issues)].slice(0, 5)
    
    return {
      hasErrors,
      hasWarnings,
      hasIssues,
      isSuccess: isSuccess && !hasErrors,
      issues: uniqueIssues,
    }
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

  // === HOOKS SYSTEM ===
  
  // Hook registrieren
  registerHook(hookType: WorkflowHookType, hook: WorkflowHook): () => void {
    if (!this.hooks.has(hookType)) {
      this.hooks.set(hookType, [])
    }
    this.hooks.get(hookType)!.push(hook)
    
    // Return unregister function
    return () => {
      const hooks = this.hooks.get(hookType)
      if (hooks) {
        const index = hooks.indexOf(hook)
        if (index > -1) hooks.splice(index, 1)
      }
    }
  }

  // Hooks ausführen
  private async executeHooks(hookType: WorkflowHookType, context: Partial<WorkflowHookContext>): Promise<void> {
    const hooks = this.hooks.get(hookType) || []
    const fullContext: WorkflowHookContext = {
      ...context,
      state: this.state,
    }
    
    for (const hook of hooks) {
      try {
        await hook(fullContext)
      } catch (error) {
        this.log(`Hook ${hookType} Fehler: ${error}`, "warn")
      }
    }
  }

  // Vordefinierte Hook-Plugins
  useLoggingPlugin(): void {
    this.registerHook("beforeNodeExecute", (ctx) => {
      console.log(`[Plugin] Starting node: ${ctx.nodeName}`)
    })
    this.registerHook("afterNodeExecute", (ctx) => {
      console.log(`[Plugin] Completed node: ${ctx.nodeName} in ${ctx.duration}ms`)
    })
    this.registerHook("onError", (ctx) => {
      console.error(`[Plugin] Error in ${ctx.nodeName}: ${ctx.error?.message}`)
    })
  }

  useMetricsPlugin(onMetrics: (metrics: { nodeId: string; duration: number; success: boolean }) => void): void {
    this.registerHook("afterNodeExecute", (ctx) => {
      if (ctx.nodeId && ctx.duration !== undefined) {
        onMetrics({
          nodeId: ctx.nodeId,
          duration: ctx.duration,
          success: !ctx.error,
        })
      }
    })
  }

  useRetryPlugin(maxRetries: number = 3): void {
    this.registerHook("onError", async (ctx) => {
      if (ctx.retryCount && ctx.retryCount < maxRetries && ctx.nodeId) {
        this.log(`Retry ${ctx.retryCount}/${maxRetries} für ${ctx.nodeName}`, "info")
        await this.retryNode(ctx.nodeId)
      }
    })
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

// === EXPORT/IMPORT FUNKTIONEN ===

// Workflow als JSON exportieren
export function exportWorkflow(workflow: WorkflowGraph): string {
  return JSON.stringify({
    ...workflow,
    exportedAt: new Date().toISOString(),
    exportVersion: "1.0",
  }, null, 2)
}

// Workflow aus JSON importieren
export function importWorkflow(jsonString: string): { workflow?: WorkflowGraph; error?: string } {
  try {
    const parsed = JSON.parse(jsonString)
    
    // Validierung
    if (!parsed.nodes || !Array.isArray(parsed.nodes)) {
      return { error: "Ungültiges Format: 'nodes' fehlt oder ist kein Array" }
    }
    if (!parsed.edges || !Array.isArray(parsed.edges)) {
      return { error: "Ungültiges Format: 'edges' fehlt oder ist kein Array" }
    }
    
    const workflow: WorkflowGraph = {
      id: parsed.id || `imported-${Date.now()}`,
      name: parsed.name || "Importierter Workflow",
      description: parsed.description || "",
      nodes: parsed.nodes,
      edges: parsed.edges,
      version: parsed.version || 1,
      createdAt: parsed.createdAt ? new Date(parsed.createdAt) : new Date(),
      updatedAt: new Date(),
    }
    
    // Validiere den importierten Workflow
    const validation = validateWorkflow(workflow)
    if (!validation.valid) {
      return { error: `Validierung fehlgeschlagen: ${validation.errors.join(", ")}` }
    }
    
    return { workflow }
  } catch (e) {
    return { error: `JSON Parse Fehler: ${e}` }
  }
}

// Workflow als URL-Parameter exportieren (für Sharing)
export function exportWorkflowToUrl(workflow: WorkflowGraph): string {
  const minified = {
    n: workflow.nodes.map(n => ({
      i: n.id,
      t: n.type,
      p: n.position,
      d: n.data,
    })),
    e: workflow.edges.map(e => ({
      i: e.id,
      s: e.source,
      t: e.target,
      l: e.label,
    })),
    m: { name: workflow.name, desc: workflow.description },
  }
  return btoa(JSON.stringify(minified))
}

// Workflow aus URL-Parameter importieren
export function importWorkflowFromUrl(encoded: string): { workflow?: WorkflowGraph; error?: string } {
  try {
    const decoded = JSON.parse(atob(encoded))
    
    const workflow: WorkflowGraph = {
      id: `url-import-${Date.now()}`,
      name: decoded.m?.name || "URL Import",
      description: decoded.m?.desc || "",
      nodes: decoded.n.map((n: { i: string; t: string; p: { x: number; y: number }; d: Record<string, unknown> }) => ({
        id: n.i,
        type: n.t,
        position: n.p,
        data: n.d,
      })),
      edges: decoded.e.map((e: { i: string; s: string; t: string; l?: string }) => ({
        id: e.i,
        source: e.s,
        target: e.t,
        label: e.l,
      })),
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    
    return { workflow }
  } catch (e) {
    return { error: `URL Decode Fehler: ${e}` }
  }
}

// Workflow-Diff: Zeigt Unterschiede zwischen zwei Workflows
export function diffWorkflows(workflowA: WorkflowGraph, workflowB: WorkflowGraph): {
  addedNodes: string[]
  removedNodes: string[]
  modifiedNodes: string[]
  addedEdges: string[]
  removedEdges: string[]
} {
  const nodeIdsA = new Set(workflowA.nodes.map(n => n.id))
  const nodeIdsB = new Set(workflowB.nodes.map(n => n.id))
  const edgeIdsA = new Set(workflowA.edges.map(e => e.id))
  const edgeIdsB = new Set(workflowB.edges.map(e => e.id))
  
  const addedNodes = workflowB.nodes.filter(n => !nodeIdsA.has(n.id)).map(n => n.data.label)
  const removedNodes = workflowA.nodes.filter(n => !nodeIdsB.has(n.id)).map(n => n.data.label)
  
  // Prüfe auf modifizierte Nodes (gleiche ID, aber andere Daten)
  const modifiedNodes: string[] = []
  for (const nodeB of workflowB.nodes) {
    const nodeA = workflowA.nodes.find(n => n.id === nodeB.id)
    if (nodeA && JSON.stringify(nodeA.data) !== JSON.stringify(nodeB.data)) {
      modifiedNodes.push(nodeB.data.label)
    }
  }
  
  const addedEdges = workflowB.edges.filter(e => !edgeIdsA.has(e.id)).map(e => `${e.source} → ${e.target}`)
  const removedEdges = workflowA.edges.filter(e => !edgeIdsB.has(e.id)).map(e => `${e.source} → ${e.target}`)
  
  return { addedNodes, removedNodes, modifiedNodes, addedEdges, removedEdges }
}

// Workflow-Merge: Kombiniert zwei Workflows
export function mergeWorkflows(workflowA: WorkflowGraph, workflowB: WorkflowGraph, newName: string): WorkflowGraph {
  // Präfix für B-Nodes um Konflikte zu vermeiden
  const prefix = "merged-"
  
  const remappedNodes = workflowB.nodes.map(n => ({
    ...n,
    id: n.type === "start" || n.type === "end" ? n.id : `${prefix}${n.id}`,
    position: { x: n.position.x + 500, y: n.position.y },
  }))
  
  const remappedEdges = workflowB.edges.map(e => ({
    ...e,
    id: `${prefix}${e.id}`,
    source: e.source === "start" || e.source === "end" ? e.source : `${prefix}${e.source}`,
    target: e.target === "start" || e.target === "end" ? e.target : `${prefix}${e.target}`,
  }))
  
  // Filtere doppelte Start/End Nodes
  const filteredNodes = remappedNodes.filter(n => n.type !== "start" && n.type !== "end")
  const filteredEdges = remappedEdges.filter(e => e.source !== "start")
  
  return {
    id: `merged-${Date.now()}`,
    name: newName,
    description: `Merged: ${workflowA.name} + ${workflowB.name}`,
    nodes: [...workflowA.nodes, ...filteredNodes],
    edges: [...workflowA.edges, ...filteredEdges],
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

// === ERWEITERTE ANALYTICS ===

export interface WorkflowAnalytics {
  executionHistory: {
    timestamp: Date
    workflowId: string
    duration: number
    success: boolean
    nodesExecuted: number
  }[]
  agentUsage: Record<string, { calls: number; avgDuration: number; successRate: number }>
  bottlenecks: { nodeId: string; nodeName: string; avgDuration: number }[]
  errorPatterns: { pattern: string; count: number; lastOccurred: Date }[]
  recommendations: string[]
}

// Analytics-Tracker für Workflow-Optimierung
export class WorkflowAnalyticsTracker {
  private history: WorkflowAnalytics["executionHistory"] = []
  private agentStats: Map<string, { calls: number; totalDuration: number; successes: number }> = new Map()
  private nodeDurations: Map<string, number[]> = new Map()
  private errors: Map<string, { count: number; lastOccurred: Date }> = new Map()
  
  // Workflow-Ausführung tracken
  trackExecution(workflowId: string, duration: number, success: boolean, nodesExecuted: number): void {
    this.history.push({
      timestamp: new Date(),
      workflowId,
      duration,
      success,
      nodesExecuted,
    })
    
    // Behalte nur die letzten 100 Einträge
    if (this.history.length > 100) {
      this.history = this.history.slice(-100)
    }
  }
  
  // Agent-Aufruf tracken
  trackAgentCall(agentId: string, duration: number, success: boolean): void {
    const stats = this.agentStats.get(agentId) || { calls: 0, totalDuration: 0, successes: 0 }
    stats.calls++
    stats.totalDuration += duration
    if (success) stats.successes++
    this.agentStats.set(agentId, stats)
  }
  
  // Node-Duration tracken
  trackNodeDuration(nodeId: string, duration: number): void {
    const durations = this.nodeDurations.get(nodeId) || []
    durations.push(duration)
    if (durations.length > 50) durations.shift()
    this.nodeDurations.set(nodeId, durations)
  }
  
  // Fehler tracken
  trackError(pattern: string): void {
    const existing = this.errors.get(pattern) || { count: 0, lastOccurred: new Date() }
    existing.count++
    existing.lastOccurred = new Date()
    this.errors.set(pattern, existing)
  }
  
  // Analytics abrufen
  getAnalytics(): WorkflowAnalytics {
    // Agent-Usage berechnen
    const agentUsage: WorkflowAnalytics["agentUsage"] = {}
    this.agentStats.forEach((stats, agentId) => {
      agentUsage[agentId] = {
        calls: stats.calls,
        avgDuration: stats.calls > 0 ? stats.totalDuration / stats.calls : 0,
        successRate: stats.calls > 0 ? (stats.successes / stats.calls) * 100 : 0,
      }
    })
    
    // Bottlenecks identifizieren (Nodes mit höchster avg Duration)
    const bottlenecks: WorkflowAnalytics["bottlenecks"] = []
    this.nodeDurations.forEach((durations, nodeId) => {
      const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length
      bottlenecks.push({ nodeId, nodeName: nodeId, avgDuration: avg })
    })
    bottlenecks.sort((a, b) => b.avgDuration - a.avgDuration)
    
    // Error-Patterns
    const errorPatterns: WorkflowAnalytics["errorPatterns"] = []
    this.errors.forEach((data, pattern) => {
      errorPatterns.push({ pattern, count: data.count, lastOccurred: data.lastOccurred })
    })
    errorPatterns.sort((a, b) => b.count - a.count)
    
    // Recommendations generieren
    const recommendations: string[] = []
    
    // Bottleneck-Empfehlungen
    if (bottlenecks.length > 0 && bottlenecks[0].avgDuration > 30000) {
      recommendations.push(`Node "${bottlenecks[0].nodeName}" ist langsam (${Math.round(bottlenecks[0].avgDuration / 1000)}s) - erwäge Optimierung oder Caching`)
    }
    
    // Agent-Empfehlungen
    Object.entries(agentUsage).forEach(([agentId, stats]) => {
      if (stats.successRate < 80) {
        recommendations.push(`Agent "${agentId}" hat niedrige Erfolgsrate (${stats.successRate.toFixed(1)}%) - prüfe Prompts`)
      }
    })
    
    // Error-Empfehlungen
    if (errorPatterns.length > 0 && errorPatterns[0].count > 5) {
      recommendations.push(`Häufiger Fehler: "${errorPatterns[0].pattern}" (${errorPatterns[0].count}x) - behebe Grundursache`)
    }
    
    return {
      executionHistory: this.history,
      agentUsage,
      bottlenecks: bottlenecks.slice(0, 5),
      errorPatterns: errorPatterns.slice(0, 10),
      recommendations,
    }
  }
  
  // Erfolgsrate berechnen
  getSuccessRate(): number {
    if (this.history.length === 0) return 100
    const successes = this.history.filter(h => h.success).length
    return (successes / this.history.length) * 100
  }
  
  // Durchschnittliche Dauer
  getAverageDuration(): number {
    if (this.history.length === 0) return 0
    return this.history.reduce((sum, h) => sum + h.duration, 0) / this.history.length
  }
}

// === WORKFLOW SCHEDULER ===

export interface ScheduledWorkflow {
  id: string
  workflowId: string
  schedule: {
    type: "once" | "recurring"
    executeAt?: Date
    interval?: number // in Millisekunden
    cron?: string // z.B. "0 9 * * 1-5" für Werktage 9 Uhr
  }
  enabled: boolean
  lastRun?: Date
  nextRun?: Date
  runCount: number
}

export class WorkflowScheduler {
  private scheduledWorkflows: Map<string, ScheduledWorkflow> = new Map()
  private timers: Map<string, NodeJS.Timeout> = new Map()
  private onExecute: (workflowId: string) => Promise<void>
  
  constructor(onExecute: (workflowId: string) => Promise<void>) {
    this.onExecute = onExecute
  }
  
  // Workflow einplanen
  schedule(workflowId: string, schedule: ScheduledWorkflow["schedule"]): string {
    const id = `scheduled-${Date.now()}`
    const scheduled: ScheduledWorkflow = {
      id,
      workflowId,
      schedule,
      enabled: true,
      runCount: 0,
    }
    
    this.scheduledWorkflows.set(id, scheduled)
    this.setupTimer(scheduled)
    
    return id
  }
  
  // Timer einrichten
  private setupTimer(scheduled: ScheduledWorkflow): void {
    if (!scheduled.enabled) return
    
    // Bestehenden Timer löschen
    const existingTimer = this.timers.get(scheduled.id)
    if (existingTimer) clearTimeout(existingTimer)
    
    let delay: number
    
    if (scheduled.schedule.type === "once" && scheduled.schedule.executeAt) {
      delay = scheduled.schedule.executeAt.getTime() - Date.now()
      if (delay < 0) return // Bereits vergangen
      
      scheduled.nextRun = scheduled.schedule.executeAt
    } else if (scheduled.schedule.type === "recurring" && scheduled.schedule.interval) {
      delay = scheduled.schedule.interval
      scheduled.nextRun = new Date(Date.now() + delay)
    } else {
      return
    }
    
    const timer = setTimeout(async () => {
      await this.executeScheduled(scheduled)
    }, delay)
    
    this.timers.set(scheduled.id, timer)
  }
  
  // Geplanten Workflow ausführen
  private async executeScheduled(scheduled: ScheduledWorkflow): Promise<void> {
    scheduled.lastRun = new Date()
    scheduled.runCount++
    
    try {
      await this.onExecute(scheduled.workflowId)
    } catch (error) {
      console.error(`Scheduled workflow ${scheduled.workflowId} failed:`, error)
    }
    
    // Bei recurring: nächste Ausführung planen
    if (scheduled.schedule.type === "recurring" && scheduled.enabled) {
      this.setupTimer(scheduled)
    } else {
      scheduled.enabled = false
    }
    
    this.scheduledWorkflows.set(scheduled.id, scheduled)
  }
  
  // Geplanten Workflow abbrechen
  cancel(scheduleId: string): boolean {
    const scheduled = this.scheduledWorkflows.get(scheduleId)
    if (!scheduled) return false
    
    const timer = this.timers.get(scheduleId)
    if (timer) clearTimeout(timer)
    
    scheduled.enabled = false
    this.scheduledWorkflows.set(scheduleId, scheduled)
    return true
  }
  
  // Alle geplanten Workflows abrufen
  getScheduled(): ScheduledWorkflow[] {
    return Array.from(this.scheduledWorkflows.values())
  }
  
  // Pause all schedules
  pauseAll(): void {
    this.timers.forEach((timer, id) => {
      clearTimeout(timer)
      const scheduled = this.scheduledWorkflows.get(id)
      if (scheduled) {
        scheduled.enabled = false
        this.scheduledWorkflows.set(id, scheduled)
      }
    })
    this.timers.clear()
  }
  
  // Resume all schedules
  resumeAll(): void {
    this.scheduledWorkflows.forEach(scheduled => {
      if (!scheduled.enabled) {
        scheduled.enabled = true
        this.setupTimer(scheduled)
      }
    })
  }
}

// === AGENT FEEDBACK LOOP ===

export interface AgentFeedback {
  agentId: string
  nodeId: string
  rating: 1 | 2 | 3 | 4 | 5
  feedbackType: "quality" | "speed" | "accuracy" | "relevance"
  comment?: string
  timestamp: Date
  outputSnippet?: string
}

export class AgentFeedbackManager {
  private feedback: AgentFeedback[] = []
  private learnings: Map<string, string[]> = new Map()
  
  // Feedback hinzufügen
  addFeedback(feedback: Omit<AgentFeedback, "timestamp">): void {
    this.feedback.push({
      ...feedback,
      timestamp: new Date(),
    })
    
    // Behalte nur die letzten 500 Feedbacks
    if (this.feedback.length > 500) {
      this.feedback = this.feedback.slice(-500)
    }
    
    // Bei schlechtem Feedback: Learning erstellen
    if (feedback.rating <= 2 && feedback.comment) {
      this.addLearning(feedback.agentId, feedback.comment)
    }
  }
  
  // Learning für Agent hinzufügen
  addLearning(agentId: string, learning: string): void {
    const existing = this.learnings.get(agentId) || []
    existing.push(learning)
    
    // Max 20 Learnings pro Agent
    if (existing.length > 20) existing.shift()
    this.learnings.set(agentId, existing)
  }
  
  // Learnings für Agent abrufen (für Prompt-Erweiterung)
  getLearnings(agentId: string): string[] {
    return this.learnings.get(agentId) || []
  }
  
  // Learnings als Prompt-Erweiterung
  getLearningsPrompt(agentId: string): string {
    const learnings = this.getLearnings(agentId)
    if (learnings.length === 0) return ""
    
    return `
## LEARNINGS AUS VORHERIGEM FEEDBACK
Beachte diese Punkte basierend auf User-Feedback:
${learnings.map((l, i) => `${i + 1}. ${l}`).join("\n")}
`
  }
  
  // Durchschnittliche Bewertung für Agent
  getAverageRating(agentId: string): number {
    const agentFeedback = this.feedback.filter(f => f.agentId === agentId)
    if (agentFeedback.length === 0) return 0
    
    return agentFeedback.reduce((sum, f) => sum + f.rating, 0) / agentFeedback.length
  }
  
  // Feedback-Zusammenfassung
  getSummary(): {
    totalFeedback: number
    averageRating: number
    byAgent: Record<string, { count: number; avgRating: number }>
    byType: Record<string, { count: number; avgRating: number }>
    recentIssues: string[]
  } {
    const byAgent: Record<string, { ratings: number[]; count: number }> = {}
    const byType: Record<string, { ratings: number[]; count: number }> = {}
    
    this.feedback.forEach(f => {
      // By Agent
      if (!byAgent[f.agentId]) byAgent[f.agentId] = { ratings: [], count: 0 }
      byAgent[f.agentId].ratings.push(f.rating)
      byAgent[f.agentId].count++
      
      // By Type
      if (!byType[f.feedbackType]) byType[f.feedbackType] = { ratings: [], count: 0 }
      byType[f.feedbackType].ratings.push(f.rating)
      byType[f.feedbackType].count++
    })
    
    // Recent issues (low ratings with comments)
    const recentIssues = this.feedback
      .filter(f => f.rating <= 2 && f.comment)
      .slice(-5)
      .map(f => `${f.agentId}: ${f.comment}`)
    
    return {
      totalFeedback: this.feedback.length,
      averageRating: this.feedback.length > 0 
        ? this.feedback.reduce((sum, f) => sum + f.rating, 0) / this.feedback.length 
        : 0,
      byAgent: Object.fromEntries(
        Object.entries(byAgent).map(([id, data]) => [
          id, 
          { count: data.count, avgRating: data.ratings.reduce((s, r) => s + r, 0) / data.ratings.length }
        ])
      ),
      byType: Object.fromEntries(
        Object.entries(byType).map(([type, data]) => [
          type, 
          { count: data.count, avgRating: data.ratings.reduce((s, r) => s + r, 0) / data.ratings.length }
        ])
      ),
      recentIssues,
    }
  }
}

// === WORKFLOW DEBUGGING TOOLS ===

export interface WorkflowDebugState {
  breakpoints: Set<string>
  watchedVariables: Map<string, unknown>
  stepMode: boolean
  currentStep: number
  executionLog: WorkflowDebugLogEntry[]
  isPaused: boolean
}

export interface WorkflowDebugLogEntry {
  timestamp: Date
  type: "node-enter" | "node-exit" | "variable-change" | "error" | "decision" | "condition"
  nodeId?: string
  nodeName?: string
  message: string
  data?: Record<string, unknown>
  duration?: number
}

export class WorkflowDebugger {
  private state: WorkflowDebugState = {
    breakpoints: new Set(),
    watchedVariables: new Map(),
    stepMode: false,
    currentStep: 0,
    executionLog: [],
    isPaused: false,
  }
  private onPause?: (nodeId: string) => void
  private onLogUpdate?: (log: WorkflowDebugLogEntry[]) => void
  
  constructor(options?: {
    onPause?: (nodeId: string) => void
    onLogUpdate?: (log: WorkflowDebugLogEntry[]) => void
  }) {
    this.onPause = options?.onPause
    this.onLogUpdate = options?.onLogUpdate
  }
  
  // Breakpoint setzen
  setBreakpoint(nodeId: string): void {
    this.state.breakpoints.add(nodeId)
    this.log("breakpoint-set", `Breakpoint gesetzt: ${nodeId}`)
  }
  
  // Breakpoint entfernen
  removeBreakpoint(nodeId: string): void {
    this.state.breakpoints.delete(nodeId)
    this.log("breakpoint-removed", `Breakpoint entfernt: ${nodeId}`)
  }
  
  // Alle Breakpoints abrufen
  getBreakpoints(): string[] {
    return Array.from(this.state.breakpoints)
  }
  
  // Prüfen ob Node ein Breakpoint hat
  hasBreakpoint(nodeId: string): boolean {
    return this.state.breakpoints.has(nodeId)
  }
  
  // Variable beobachten
  watchVariable(name: string, initialValue?: unknown): void {
    this.state.watchedVariables.set(name, initialValue)
  }
  
  // Variable aktualisieren
  updateVariable(name: string, value: unknown): void {
    const oldValue = this.state.watchedVariables.get(name)
    this.state.watchedVariables.set(name, value)
    
    this.addLogEntry({
      timestamp: new Date(),
      type: "variable-change",
      message: `Variable "${name}" geändert`,
      data: { name, oldValue, newValue: value },
    })
  }
  
  // Alle beobachteten Variablen
  getWatchedVariables(): Record<string, unknown> {
    return Object.fromEntries(this.state.watchedVariables)
  }
  
  // Step-Modus aktivieren
  enableStepMode(): void {
    this.state.stepMode = true
    this.log("step-mode", "Step-Modus aktiviert")
  }
  
  // Step-Modus deaktivieren
  disableStepMode(): void {
    this.state.stepMode = false
    this.log("step-mode", "Step-Modus deaktiviert")
  }
  
  // Ist Step-Modus aktiv?
  isStepMode(): boolean {
    return this.state.stepMode
  }
  
  // Node betreten
  enterNode(nodeId: string, nodeName: string): boolean {
    this.state.currentStep++
    
    this.addLogEntry({
      timestamp: new Date(),
      type: "node-enter",
      nodeId,
      nodeName,
      message: `→ Node betreten: ${nodeName}`,
    })
    
    // Prüfe auf Breakpoint oder Step-Modus
    if (this.hasBreakpoint(nodeId) || this.state.stepMode) {
      this.state.isPaused = true
      this.onPause?.(nodeId)
      return false // Execution should pause
    }
    
    return true // Continue execution
  }
  
  // Node verlassen
  exitNode(nodeId: string, nodeName: string, duration: number, success: boolean): void {
    this.addLogEntry({
      timestamp: new Date(),
      type: "node-exit",
      nodeId,
      nodeName,
      message: `← Node verlassen: ${nodeName} (${success ? "✓" : "✗"})`,
      duration,
      data: { success },
    })
  }
  
  // Fehler loggen
  logError(nodeId: string, nodeName: string, error: string): void {
    this.addLogEntry({
      timestamp: new Date(),
      type: "error",
      nodeId,
      nodeName,
      message: `❌ Fehler in ${nodeName}: ${error}`,
      data: { error },
    })
  }
  
  // Entscheidung loggen
  logDecision(nodeId: string, nodeName: string, decision: string): void {
    this.addLogEntry({
      timestamp: new Date(),
      type: "decision",
      nodeId,
      nodeName,
      message: `🔀 Entscheidung in ${nodeName}: ${decision}`,
      data: { decision },
    })
  }
  
  // Bedingung loggen
  logCondition(nodeId: string, nodeName: string, condition: string, result: boolean): void {
    this.addLogEntry({
      timestamp: new Date(),
      type: "condition",
      nodeId,
      nodeName,
      message: `❓ Bedingung in ${nodeName}: "${condition}" = ${result}`,
      data: { condition, result },
    })
  }
  
  // Log-Eintrag hinzufügen
  private addLogEntry(entry: WorkflowDebugLogEntry): void {
    this.state.executionLog.push(entry)
    
    // Max 1000 Einträge behalten
    if (this.state.executionLog.length > 1000) {
      this.state.executionLog = this.state.executionLog.slice(-1000)
    }
    
    this.onLogUpdate?.(this.state.executionLog)
  }
  
  private log(type: string, message: string): void {
    console.log(`[Debug:${type}] ${message}`)
  }
  
  // Ausführung fortsetzen
  continue(): void {
    this.state.isPaused = false
  }
  
  // Nächster Schritt
  step(): void {
    this.state.isPaused = false
    this.state.stepMode = true
  }
  
  // Ist pausiert?
  isPaused(): boolean {
    return this.state.isPaused
  }
  
  // Execution Log abrufen
  getExecutionLog(): WorkflowDebugLogEntry[] {
    return [...this.state.executionLog]
  }
  
  // Gefilterter Log
  getFilteredLog(filter: {
    type?: WorkflowDebugLogEntry["type"]
    nodeId?: string
    since?: Date
  }): WorkflowDebugLogEntry[] {
    return this.state.executionLog.filter(entry => {
      if (filter.type && entry.type !== filter.type) return false
      if (filter.nodeId && entry.nodeId !== filter.nodeId) return false
      if (filter.since && entry.timestamp < filter.since) return false
      return true
    })
  }
  
  // Log leeren
  clearLog(): void {
    this.state.executionLog = []
    this.onLogUpdate?.([])
  }
  
  // Aktueller Schritt
  getCurrentStep(): number {
    return this.state.currentStep
  }
  
  // Debug-State exportieren
  exportState(): WorkflowDebugState {
    return {
      ...this.state,
      breakpoints: new Set(this.state.breakpoints),
      watchedVariables: new Map(this.state.watchedVariables),
      executionLog: [...this.state.executionLog],
    }
  }
  
  // State zurücksetzen
  reset(): void {
    this.state = {
      breakpoints: this.state.breakpoints, // Breakpoints beibehalten
      watchedVariables: new Map(),
      stepMode: false,
      currentStep: 0,
      executionLog: [],
      isPaused: false,
    }
  }
}

// === WORKFLOW EXECUTION CONTEXT ===

export interface WorkflowExecutionContext {
  workflowId: string
  executionId: string
  startedAt: Date
  environment: "development" | "staging" | "production"
  user?: { id: string; name: string }
  variables: Record<string, unknown>
  secrets: Record<string, string>
  features: Record<string, boolean>
}

export class WorkflowContextManager {
  private context: WorkflowExecutionContext
  private history: { key: string; oldValue: unknown; newValue: unknown; timestamp: Date }[] = []
  
  constructor(workflowId: string, environment: "development" | "staging" | "production" = "development") {
    this.context = {
      workflowId,
      executionId: `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      startedAt: new Date(),
      environment,
      variables: {},
      secrets: {},
      features: {},
    }
  }
  
  // Variable setzen
  setVariable(key: string, value: unknown): void {
    const oldValue = this.context.variables[key]
    this.context.variables[key] = value
    
    this.history.push({
      key,
      oldValue,
      newValue: value,
      timestamp: new Date(),
    })
  }
  
  // Variable abrufen
  getVariable<T = unknown>(key: string, defaultValue?: T): T {
    return (this.context.variables[key] as T) ?? (defaultValue as T)
  }
  
  // Alle Variablen
  getAllVariables(): Record<string, unknown> {
    return { ...this.context.variables }
  }
  
  // Secret setzen (nicht im Log)
  setSecret(key: string, value: string): void {
    this.context.secrets[key] = value
  }
  
  // Secret abrufen
  getSecret(key: string): string | undefined {
    return this.context.secrets[key]
  }
  
  // Feature Flag setzen
  setFeature(key: string, enabled: boolean): void {
    this.context.features[key] = enabled
  }
  
  // Feature Flag prüfen
  isFeatureEnabled(key: string): boolean {
    return this.context.features[key] ?? false
  }
  
  // User setzen
  setUser(user: { id: string; name: string }): void {
    this.context.user = user
  }
  
  // User abrufen
  getUser(): { id: string; name: string } | undefined {
    return this.context.user
  }
  
  // Kontext abrufen
  getContext(): WorkflowExecutionContext {
    return { ...this.context }
  }
  
  // Execution ID
  getExecutionId(): string {
    return this.context.executionId
  }
  
  // Environment
  getEnvironment(): "development" | "staging" | "production" {
    return this.context.environment
  }
  
  // Ist Produktion?
  isProduction(): boolean {
    return this.context.environment === "production"
  }
  
  // History abrufen
  getVariableHistory(key?: string): typeof this.history {
    if (key) {
      return this.history.filter(h => h.key === key)
    }
    return [...this.history]
  }
  
  // Template-String mit Variablen ersetzen
  interpolate(template: string): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const value = this.context.variables[key]
      return value !== undefined ? String(value) : `{{${key}}}`
    })
  }
  
  // Kontext als JSON exportieren
  export(): string {
    return JSON.stringify({
      ...this.context,
      secrets: "[REDACTED]", // Secrets nicht exportieren
    }, null, 2)
  }
  
  // Kontext klonen für Sub-Workflows
  clone(): WorkflowContextManager {
    const cloned = new WorkflowContextManager(this.context.workflowId, this.context.environment)
    cloned.context = {
      ...this.context,
      executionId: `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      startedAt: new Date(),
      variables: { ...this.context.variables },
      secrets: { ...this.context.secrets },
      features: { ...this.context.features },
    }
    return cloned
  }
}

// === AGENT SPEZIALISIERUNG ===

export interface AgentSpecialization {
  id: string
  name: string
  baseAgent: "planner" | "coder" | "reviewer" | "security" | "executor"
  promptExtensions: string[]
  temperature?: number
  focusAreas: string[]
  avoidAreas: string[]
  outputFormat?: "json" | "markdown" | "code" | "plain"
  maxTokens?: number
}

export const AGENT_SPECIALIZATIONS: Record<string, AgentSpecialization> = {
  "react-specialist": {
    id: "react-specialist",
    name: "React Spezialist",
    baseAgent: "coder",
    promptExtensions: [
      "Du bist ein React-Experte mit tiefem Wissen über Hooks, Context, und moderne Patterns.",
      "Bevorzuge funktionale Komponenten mit Hooks über Klassen-Komponenten.",
      "Nutze TypeScript für type safety.",
    ],
    focusAreas: ["React", "Hooks", "State Management", "Component Design"],
    avoidAreas: ["Backend", "Database"],
    outputFormat: "code",
  },
  
  "api-designer": {
    id: "api-designer",
    name: "API Designer",
    baseAgent: "planner",
    promptExtensions: [
      "Du bist ein API-Design-Experte mit Fokus auf RESTful und GraphQL APIs.",
      "Achte auf konsistente Namensgebung und HTTP-Status-Codes.",
      "Dokumentiere Endpoints mit OpenAPI/Swagger-Format.",
    ],
    focusAreas: ["REST API", "GraphQL", "OpenAPI", "HTTP Methods"],
    avoidAreas: ["Frontend", "UI"],
    outputFormat: "json",
  },
  
  "security-auditor": {
    id: "security-auditor",
    name: "Security Auditor",
    baseAgent: "security",
    promptExtensions: [
      "Du führst tiefgehende Sicherheitsaudits durch.",
      "Prüfe auf OWASP Top 10 Schwachstellen.",
      "Bewerte Risiken nach CVSS-Standard.",
    ],
    focusAreas: ["OWASP", "Authentication", "Authorization", "Input Validation"],
    avoidAreas: [],
    temperature: 0.2,
  },
  
  "performance-optimizer": {
    id: "performance-optimizer",
    name: "Performance Optimizer",
    baseAgent: "reviewer",
    promptExtensions: [
      "Du analysierst Code auf Performance-Probleme.",
      "Identifiziere N+1 Queries, Memory Leaks, und ineffiziente Algorithmen.",
      "Schlage konkrete Optimierungen mit messbarem Impact vor.",
    ],
    focusAreas: ["Performance", "Memory", "Algorithms", "Caching"],
    avoidAreas: ["Styling", "UI"],
    temperature: 0.3,
  },
  
  "test-writer": {
    id: "test-writer",
    name: "Test Writer",
    baseAgent: "coder",
    promptExtensions: [
      "Du schreibst umfassende Tests für bestehenden Code.",
      "Nutze Jest für Unit-Tests und Testing Library für Komponenten.",
      "Erreiche hohe Code-Coverage mit sinnvollen Test-Cases.",
    ],
    focusAreas: ["Unit Tests", "Integration Tests", "Mocking", "Coverage"],
    avoidAreas: ["Implementation"],
    outputFormat: "code",
  },
  
  "documentation-writer": {
    id: "documentation-writer",
    name: "Dokumentation Schreiber",
    baseAgent: "planner",
    promptExtensions: [
      "Du erstellst klare, strukturierte technische Dokumentation.",
      "Nutze Markdown mit Code-Beispielen.",
      "Erkläre komplexe Konzepte verständlich.",
    ],
    focusAreas: ["Documentation", "README", "API Docs", "Examples"],
    avoidAreas: ["Implementation"],
    outputFormat: "markdown",
  },
}

// Spezialisierung auf Agent anwenden
export function applySpecialization(
  basePrompt: string, 
  specialization: AgentSpecialization
): string {
  const focusSection = specialization.focusAreas.length > 0
    ? `\n\n## FOKUS-BEREICHE\nKonzentriere dich auf: ${specialization.focusAreas.join(", ")}`
    : ""
    
  const avoidSection = specialization.avoidAreas.length > 0
    ? `\n\n## VERMEIDE\nBehandele nicht: ${specialization.avoidAreas.join(", ")}`
    : ""
    
  const formatSection = specialization.outputFormat
    ? `\n\n## OUTPUT-FORMAT\nBevorzuge ${specialization.outputFormat}-Format für deine Ausgabe.`
    : ""
  
  return `${basePrompt}

## SPEZIALISIERUNG: ${specialization.name}
${specialization.promptExtensions.join("\n")}
${focusSection}${avoidSection}${formatSection}`
}

// === WORKFLOW PROGRESS TRACKING ===

export interface WorkflowProgress {
  percentage: number
  currentStep: number
  totalSteps: number
  currentNodeName: string
  estimatedTimeRemaining: number // in ms
  elapsedTime: number // in ms
  status: "idle" | "running" | "paused" | "completed" | "error"
  phase: "planning" | "execution" | "review" | "complete"
}

export class WorkflowProgressTracker {
  private startTime: Date | null = null
  private nodeDurations: Map<string, number> = new Map()
  private completedNodes: number = 0
  private totalNodes: number = 0
  private currentNodeName: string = ""
  private status: WorkflowProgress["status"] = "idle"
  
  // Tracker starten
  start(totalNodes: number): void {
    this.startTime = new Date()
    this.totalNodes = totalNodes
    this.completedNodes = 0
    this.status = "running"
  }
  
  // Node gestartet
  nodeStarted(nodeName: string): void {
    this.currentNodeName = nodeName
  }
  
  // Node abgeschlossen
  nodeCompleted(nodeId: string, duration: number): void {
    this.nodeDurations.set(nodeId, duration)
    this.completedNodes++
  }
  
  // Status setzen
  setStatus(status: WorkflowProgress["status"]): void {
    this.status = status
  }
  
  // Fortschritt berechnen
  getProgress(): WorkflowProgress {
    const elapsedTime = this.startTime 
      ? Date.now() - this.startTime.getTime()
      : 0
    
    const percentage = this.totalNodes > 0 
      ? Math.round((this.completedNodes / this.totalNodes) * 100)
      : 0
    
    // Geschätzte verbleibende Zeit basierend auf bisheriger Durchschnittszeit
    const avgDuration = this.completedNodes > 0
      ? Array.from(this.nodeDurations.values()).reduce((sum, d) => sum + d, 0) / this.completedNodes
      : 30000 // Default: 30 Sekunden pro Node
    
    const remainingNodes = this.totalNodes - this.completedNodes
    const estimatedTimeRemaining = remainingNodes * avgDuration
    
    // Phase basierend auf Fortschritt
    let phase: WorkflowProgress["phase"] = "planning"
    if (percentage > 0 && percentage < 30) phase = "planning"
    else if (percentage >= 30 && percentage < 80) phase = "execution"
    else if (percentage >= 80 && percentage < 100) phase = "review"
    else if (percentage === 100) phase = "complete"
    
    return {
      percentage,
      currentStep: this.completedNodes,
      totalSteps: this.totalNodes,
      currentNodeName: this.currentNodeName,
      estimatedTimeRemaining: Math.round(estimatedTimeRemaining),
      elapsedTime,
      status: this.status,
      phase,
    }
  }
  
  // Formatierte Zeit
  formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`
    }
    return `${remainingSeconds}s`
  }
  
  // Reset
  reset(): void {
    this.startTime = null
    this.nodeDurations.clear()
    this.completedNodes = 0
    this.totalNodes = 0
    this.currentNodeName = ""
    this.status = "idle"
  }
}

// === RETRY MIT EXPONENTIAL BACKOFF ===

export interface RetryConfig {
  maxRetries: number
  initialDelay: number // ms
  maxDelay: number // ms
  backoffMultiplier: number
  retryableErrors: string[]
  onRetry?: (attempt: number, error: string, delay: number) => void
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableErrors: [
    "timeout",
    "rate limit",
    "503",
    "502",
    "network",
    "ECONNRESET",
    "ETIMEDOUT",
  ],
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const fullConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config }
  let lastError: Error | null = null
  
  for (let attempt = 0; attempt <= fullConfig.maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error as Error
      const errorMessage = lastError.message.toLowerCase()
      
      // Prüfen ob Fehler retry-fähig ist
      const isRetryable = fullConfig.retryableErrors.some(
        e => errorMessage.includes(e.toLowerCase())
      )
      
      if (!isRetryable || attempt >= fullConfig.maxRetries) {
        throw lastError
      }
      
      // Exponential backoff berechnen
      const delay = Math.min(
        fullConfig.initialDelay * Math.pow(fullConfig.backoffMultiplier, attempt),
        fullConfig.maxDelay
      )
      
      // Callback aufrufen
      fullConfig.onRetry?.(attempt + 1, lastError.message, delay)
      
      // Warten
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  throw lastError
}

// === WORKFLOW NOTIFICATIONS ===

export type NotificationType = 
  | "workflow-started"
  | "workflow-completed"
  | "workflow-error"
  | "node-completed"
  | "node-error"
  | "human-decision-required"
  | "retry-attempt"
  | "progress-milestone"

export interface WorkflowNotification {
  id: string
  type: NotificationType
  title: string
  message: string
  timestamp: Date
  severity: "info" | "success" | "warning" | "error"
  data?: Record<string, unknown>
  read: boolean
}

export class WorkflowNotificationManager {
  private notifications: WorkflowNotification[] = []
  private listeners: ((notification: WorkflowNotification) => void)[] = []
  private maxNotifications: number = 100
  
  // Listener registrieren
  subscribe(listener: (notification: WorkflowNotification) => void): () => void {
    this.listeners.push(listener)
    return () => {
      const index = this.listeners.indexOf(listener)
      if (index > -1) this.listeners.splice(index, 1)
    }
  }
  
  // Notification erstellen
  private createNotification(
    type: NotificationType,
    title: string,
    message: string,
    severity: WorkflowNotification["severity"],
    data?: Record<string, unknown>
  ): WorkflowNotification {
    const notification: WorkflowNotification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      title,
      message,
      timestamp: new Date(),
      severity,
      data,
      read: false,
    }
    
    this.notifications.push(notification)
    
    // Max Notifications einhalten
    if (this.notifications.length > this.maxNotifications) {
      this.notifications = this.notifications.slice(-this.maxNotifications)
    }
    
    // Listener benachrichtigen
    this.listeners.forEach(listener => listener(notification))
    
    return notification
  }
  
  // Workflow-Start
  notifyWorkflowStarted(workflowName: string): WorkflowNotification {
    return this.createNotification(
      "workflow-started",
      "Workflow gestartet",
      `"${workflowName}" wurde gestartet.`,
      "info",
      { workflowName }
    )
  }
  
  // Workflow-Abschluss
  notifyWorkflowCompleted(workflowName: string, duration: number): WorkflowNotification {
    return this.createNotification(
      "workflow-completed",
      "Workflow abgeschlossen",
      `"${workflowName}" wurde in ${Math.round(duration / 1000)}s erfolgreich abgeschlossen.`,
      "success",
      { workflowName, duration }
    )
  }
  
  // Workflow-Fehler
  notifyWorkflowError(workflowName: string, error: string): WorkflowNotification {
    return this.createNotification(
      "workflow-error",
      "Workflow-Fehler",
      `Fehler in "${workflowName}": ${error}`,
      "error",
      { workflowName, error }
    )
  }
  
  // Node abgeschlossen
  notifyNodeCompleted(nodeName: string, duration: number): WorkflowNotification {
    return this.createNotification(
      "node-completed",
      "Schritt abgeschlossen",
      `"${nodeName}" wurde in ${Math.round(duration / 1000)}s abgeschlossen.`,
      "success",
      { nodeName, duration }
    )
  }
  
  // Human Decision erforderlich
  notifyHumanDecisionRequired(question: string): WorkflowNotification {
    return this.createNotification(
      "human-decision-required",
      "Entscheidung erforderlich",
      question,
      "warning",
      { question }
    )
  }
  
  // Retry-Versuch
  notifyRetryAttempt(nodeName: string, attempt: number, maxRetries: number): WorkflowNotification {
    return this.createNotification(
      "retry-attempt",
      "Wiederholungsversuch",
      `"${nodeName}" wird wiederholt (Versuch ${attempt}/${maxRetries})`,
      "warning",
      { nodeName, attempt, maxRetries }
    )
  }
  
  // Progress-Meilenstein
  notifyProgressMilestone(percentage: number): WorkflowNotification {
    const milestoneMessages: Record<number, string> = {
      25: "Ein Viertel geschafft!",
      50: "Halbzeit erreicht!",
      75: "Dreiviertel abgeschlossen!",
      100: "Fertig!",
    }
    
    return this.createNotification(
      "progress-milestone",
      `${percentage}% abgeschlossen`,
      milestoneMessages[percentage] || `${percentage}% des Workflows abgeschlossen.`,
      "info",
      { percentage }
    )
  }
  
  // Alle Notifications abrufen
  getAll(): WorkflowNotification[] {
    return [...this.notifications]
  }
  
  // Ungelesene Notifications
  getUnread(): WorkflowNotification[] {
    return this.notifications.filter(n => !n.read)
  }
  
  // Als gelesen markieren
  markAsRead(id: string): void {
    const notification = this.notifications.find(n => n.id === id)
    if (notification) notification.read = true
  }
  
  // Alle als gelesen markieren
  markAllAsRead(): void {
    this.notifications.forEach(n => n.read = true)
  }
  
  // Notification löschen
  delete(id: string): void {
    this.notifications = this.notifications.filter(n => n.id !== id)
  }
  
  // Alle löschen
  clearAll(): void {
    this.notifications = []
  }
}

// === WORKFLOW RATE LIMITER ===

export class WorkflowRateLimiter {
  private requests: Map<string, number[]> = new Map()
  private limits: Map<string, { maxRequests: number; windowMs: number }> = new Map()
  
  // Limit für einen Agent setzen
  setLimit(agentId: string, maxRequests: number, windowMs: number): void {
    this.limits.set(agentId, { maxRequests, windowMs })
  }
  
  // Prüfen ob Request erlaubt ist
  async checkLimit(agentId: string): Promise<{ allowed: boolean; waitMs: number }> {
    const limit = this.limits.get(agentId) || { maxRequests: 10, windowMs: 60000 }
    const now = Date.now()
    
    // Alte Requests entfernen
    const requests = (this.requests.get(agentId) || []).filter(
      time => now - time < limit.windowMs
    )
    
    if (requests.length >= limit.maxRequests) {
      // Berechne Wartezeit
      const oldestRequest = requests[0]
      const waitMs = limit.windowMs - (now - oldestRequest)
      return { allowed: false, waitMs }
    }
    
    // Request hinzufügen
    requests.push(now)
    this.requests.set(agentId, requests)
    
    return { allowed: true, waitMs: 0 }
  }
  
  // Warten bis Request erlaubt ist
  async waitForLimit(agentId: string): Promise<void> {
    const { allowed, waitMs } = await this.checkLimit(agentId)
    
    if (!allowed && waitMs > 0) {
      await new Promise(resolve => setTimeout(resolve, waitMs))
    }
  }
  
  // Reset für Agent
  reset(agentId: string): void {
    this.requests.delete(agentId)
  }
  
  // Reset all
  resetAll(): void {
    this.requests.clear()
  }
}
