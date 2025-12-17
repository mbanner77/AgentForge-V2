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

// === WORKFLOW CACHING SYSTEM ===

export interface CacheEntry<T> {
  value: T
  timestamp: number
  ttl: number
  hits: number
  key: string
}

export class WorkflowCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map()
  private maxSize: number = 100
  private defaultTTL: number = 10 * 60 * 1000 // 10 Minuten
  
  // Cache-Key aus Input generieren
  private generateKey(nodeId: string, input: string): string {
    // Einfacher Hash für Performance
    let hash = 0
    const str = `${nodeId}:${input}`
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    return `cache-${nodeId}-${Math.abs(hash).toString(36)}`
  }
  
  // Wert speichern
  set<T>(nodeId: string, input: string, value: T, ttl?: number): void {
    const key = this.generateKey(nodeId, input)
    
    // LRU: Ältesten Eintrag entfernen wenn voll
    if (this.cache.size >= this.maxSize) {
      let oldest: string | null = null
      let oldestTime = Infinity
      
      for (const [k, entry] of this.cache) {
        if (entry.timestamp < oldestTime) {
          oldestTime = entry.timestamp
          oldest = k
        }
      }
      
      if (oldest) this.cache.delete(oldest)
    }
    
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
      hits: 0,
      key,
    })
  }
  
  // Wert abrufen
  get<T>(nodeId: string, input: string): T | null {
    const key = this.generateKey(nodeId, input)
    const entry = this.cache.get(key)
    
    if (!entry) return null
    
    // TTL prüfen
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key)
      return null
    }
    
    // Hit zählen
    entry.hits++
    
    return entry.value as T
  }
  
  // Prüfen ob Eintrag existiert
  has(nodeId: string, input: string): boolean {
    return this.get(nodeId, input) !== null
  }
  
  // Eintrag invalidieren
  invalidate(nodeId: string, input?: string): void {
    if (input) {
      const key = this.generateKey(nodeId, input)
      this.cache.delete(key)
    } else {
      // Alle Einträge für diesen Node löschen
      for (const [key] of this.cache) {
        if (key.includes(`cache-${nodeId}-`)) {
          this.cache.delete(key)
        }
      }
    }
  }
  
  // Cache-Statistiken
  getStats(): { size: number; hitRate: number; entries: { key: string; hits: number; age: number }[] } {
    const entries = Array.from(this.cache.values()).map(e => ({
      key: e.key,
      hits: e.hits,
      age: Date.now() - e.timestamp,
    }))
    
    const totalHits = entries.reduce((sum, e) => sum + e.hits, 0)
    
    return {
      size: this.cache.size,
      hitRate: this.cache.size > 0 ? totalHits / this.cache.size : 0,
      entries,
    }
  }
  
  // Alles löschen
  clear(): void {
    this.cache.clear()
  }
}

// === MULTI-AGENT ORCHESTRATION ===

export interface AgentTask {
  id: string
  agentId: string
  input: string
  priority: number
  dependencies: string[] // Task IDs die zuerst abgeschlossen sein müssen
  status: "pending" | "running" | "completed" | "failed"
  result?: string
  error?: string
  startedAt?: Date
  completedAt?: Date
}

export interface AgentCollaborationConfig {
  maxParallel: number
  timeout: number
  onTaskStart?: (task: AgentTask) => void
  onTaskComplete?: (task: AgentTask) => void
  onTaskError?: (task: AgentTask, error: string) => void
}

export class MultiAgentOrchestrator {
  private tasks: Map<string, AgentTask> = new Map()
  private config: AgentCollaborationConfig
  private runningTasks: Set<string> = new Set()
  
  constructor(config: Partial<AgentCollaborationConfig> = {}) {
    this.config = {
      maxParallel: 3,
      timeout: 5 * 60 * 1000, // 5 Minuten
      ...config,
    }
  }
  
  // Task hinzufügen
  addTask(
    agentId: string,
    input: string,
    options: { priority?: number; dependencies?: string[] } = {}
  ): string {
    const id = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    this.tasks.set(id, {
      id,
      agentId,
      input,
      priority: options.priority || 0,
      dependencies: options.dependencies || [],
      status: "pending",
    })
    
    return id
  }
  
  // Prüfen ob Task ausführbar ist
  private canExecute(task: AgentTask): boolean {
    if (task.status !== "pending") return false
    if (this.runningTasks.size >= this.config.maxParallel) return false
    
    // Dependencies prüfen
    for (const depId of task.dependencies) {
      const dep = this.tasks.get(depId)
      if (!dep || dep.status !== "completed") return false
    }
    
    return true
  }
  
  // Nächste ausführbare Tasks holen
  private getExecutableTasks(): AgentTask[] {
    return Array.from(this.tasks.values())
      .filter(t => this.canExecute(t))
      .sort((a, b) => b.priority - a.priority)
      .slice(0, this.config.maxParallel - this.runningTasks.size)
  }
  
  // Alle Tasks ausführen
  async executeAll(
    executor: (agentId: string, input: string) => Promise<string>
  ): Promise<Map<string, AgentTask>> {
    const results = new Map<string, AgentTask>()
    
    while (true) {
      const executable = this.getExecutableTasks()
      
      if (executable.length === 0) {
        // Prüfen ob noch Tasks laufen
        if (this.runningTasks.size === 0) break
        
        // Warten bis ein Task fertig ist
        await new Promise(resolve => setTimeout(resolve, 100))
        continue
      }
      
      // Tasks parallel starten
      const promises = executable.map(async (task) => {
        task.status = "running"
        task.startedAt = new Date()
        this.runningTasks.add(task.id)
        this.config.onTaskStart?.(task)
        
        try {
          // Timeout implementieren
          const result = await Promise.race([
            executor(task.agentId, task.input),
            new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error("Timeout")), this.config.timeout)
            ),
          ])
          
          task.result = result
          task.status = "completed"
          task.completedAt = new Date()
          this.config.onTaskComplete?.(task)
        } catch (error) {
          task.error = (error as Error).message
          task.status = "failed"
          task.completedAt = new Date()
          this.config.onTaskError?.(task, task.error)
        } finally {
          this.runningTasks.delete(task.id)
          results.set(task.id, task)
        }
      })
      
      await Promise.all(promises)
    }
    
    return results
  }
  
  // Ergebnis eines Tasks holen
  getResult(taskId: string): AgentTask | undefined {
    return this.tasks.get(taskId)
  }
  
  // Alle Ergebnisse zusammenfassen
  combineResults(separator: string = "\n\n---\n\n"): string {
    return Array.from(this.tasks.values())
      .filter(t => t.status === "completed" && t.result)
      .sort((a, b) => (a.startedAt?.getTime() || 0) - (b.startedAt?.getTime() || 0))
      .map(t => `### ${t.agentId}\n${t.result}`)
      .join(separator)
  }
  
  // Reset
  reset(): void {
    this.tasks.clear()
    this.runningTasks.clear()
  }
}

// === WORKFLOW VALIDATION & AUTO-REPAIR ===

export interface ValidationError {
  type: "error" | "warning"
  nodeId?: string
  edgeId?: string
  code: string
  message: string
  autoFixable: boolean
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationError[]
}

export class WorkflowValidator {
  // Workflow validieren
  validate(workflow: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []
    
    // 1. Start-Node prüfen
    const startNodes = workflow.nodes.filter(n => n.type === "start")
    if (startNodes.length === 0) {
      errors.push({
        type: "error",
        code: "NO_START_NODE",
        message: "Workflow hat keinen Start-Node",
        autoFixable: true,
      })
    } else if (startNodes.length > 1) {
      errors.push({
        type: "error",
        code: "MULTIPLE_START_NODES",
        message: `Workflow hat ${startNodes.length} Start-Nodes (nur einer erlaubt)`,
        autoFixable: true,
      })
    }
    
    // 2. End-Node prüfen
    const endNodes = workflow.nodes.filter(n => n.type === "end")
    if (endNodes.length === 0) {
      warnings.push({
        type: "warning",
        code: "NO_END_NODE",
        message: "Workflow hat keinen End-Node (empfohlen)",
        autoFixable: true,
      })
    }
    
    // 3. Verwaiste Nodes (keine eingehenden Edges außer Start)
    for (const node of workflow.nodes) {
      if (node.type === "start") continue
      
      const hasIncoming = workflow.edges.some(e => e.target === node.id)
      if (!hasIncoming) {
        errors.push({
          type: "error",
          nodeId: node.id,
          code: "ORPHAN_NODE",
          message: `Node "${node.data.label || node.id}" hat keine eingehenden Verbindungen`,
          autoFixable: false,
        })
      }
    }
    
    // 4. Dead-End Nodes (keine ausgehenden Edges außer End)
    for (const node of workflow.nodes) {
      if (node.type === "end") continue
      
      const hasOutgoing = workflow.edges.some(e => e.source === node.id)
      if (!hasOutgoing) {
        warnings.push({
          type: "warning",
          nodeId: node.id,
          code: "DEAD_END_NODE",
          message: `Node "${node.data.label || node.id}" hat keine ausgehenden Verbindungen`,
          autoFixable: false,
        })
      }
    }
    
    // 5. Ungültige Edge-Referenzen
    for (const edge of workflow.edges) {
      const sourceExists = workflow.nodes.some(n => n.id === edge.source)
      const targetExists = workflow.nodes.some(n => n.id === edge.target)
      
      if (!sourceExists) {
        errors.push({
          type: "error",
          edgeId: edge.id,
          code: "INVALID_SOURCE",
          message: `Edge "${edge.id}" referenziert nicht-existierenden Source-Node`,
          autoFixable: true,
        })
      }
      
      if (!targetExists) {
        errors.push({
          type: "error",
          edgeId: edge.id,
          code: "INVALID_TARGET",
          message: `Edge "${edge.id}" referenziert nicht-existierenden Target-Node`,
          autoFixable: true,
        })
      }
    }
    
    // 6. Agent-Node ohne AgentId
    for (const node of workflow.nodes) {
      if (node.type === "agent" && !node.data.agentId) {
        errors.push({
          type: "error",
          nodeId: node.id,
          code: "MISSING_AGENT_ID",
          message: `Agent-Node "${node.data.label || node.id}" hat keine Agent-ID`,
          autoFixable: false,
        })
      }
    }
    
    // 7. Zyklus-Erkennung (einfach)
    const visited = new Set<string>()
    const recursionStack = new Set<string>()
    
    const hasCycle = (nodeId: string): boolean => {
      visited.add(nodeId)
      recursionStack.add(nodeId)
      
      const outgoing = workflow.edges.filter(e => e.source === nodeId)
      for (const edge of outgoing) {
        if (!visited.has(edge.target)) {
          if (hasCycle(edge.target)) return true
        } else if (recursionStack.has(edge.target)) {
          return true
        }
      }
      
      recursionStack.delete(nodeId)
      return false
    }
    
    for (const node of workflow.nodes) {
      if (!visited.has(node.id)) {
        if (hasCycle(node.id)) {
          warnings.push({
            type: "warning",
            code: "CYCLE_DETECTED",
            message: "Workflow enthält möglicherweise einen Zyklus (könnte Endlosschleife verursachen)",
            autoFixable: false,
          })
          break
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
    }
  }
  
  // Auto-Repair versuchen
  autoRepair(workflow: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }): { 
    workflow: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }
    repairs: string[]
  } {
    const repairs: string[] = []
    let nodes = [...workflow.nodes]
    let edges = [...workflow.edges]
    
    // 1. Start-Node hinzufügen wenn fehlt
    const startNodes = nodes.filter(n => n.type === "start")
    if (startNodes.length === 0) {
      const startNode: WorkflowNode = {
        id: `start-${Date.now()}`,
        type: "start",
        position: { x: 100, y: 100 },
        data: { label: "Start" },
      }
      nodes.unshift(startNode)
      repairs.push("Start-Node hinzugefügt")
      
      // Mit erstem Agent-Node verbinden
      const firstAgent = nodes.find(n => n.type === "agent")
      if (firstAgent) {
        edges.push({
          id: `edge-${Date.now()}`,
          source: startNode.id,
          target: firstAgent.id,
        })
        repairs.push(`Start-Node mit "${firstAgent.data.label}" verbunden`)
      }
    }
    
    // 2. Doppelte Start-Nodes entfernen
    if (startNodes.length > 1) {
      const [keep, ...remove] = startNodes
      nodes = nodes.filter(n => !remove.some(r => r.id === n.id))
      repairs.push(`${remove.length} zusätzliche Start-Nodes entfernt`)
    }
    
    // 3. Ungültige Edges entfernen
    const validNodeIds = new Set(nodes.map(n => n.id))
    const invalidEdges = edges.filter(
      e => !validNodeIds.has(e.source) || !validNodeIds.has(e.target)
    )
    if (invalidEdges.length > 0) {
      edges = edges.filter(e => validNodeIds.has(e.source) && validNodeIds.has(e.target))
      repairs.push(`${invalidEdges.length} ungültige Edges entfernt`)
    }
    
    // 4. End-Node hinzufügen wenn fehlt
    const endNodes = nodes.filter(n => n.type === "end")
    if (endNodes.length === 0) {
      // Letzten Node finden (höchste Y-Position)
      const lastNode = [...nodes]
        .filter(n => n.type !== "start")
        .sort((a, b) => (b.position?.y || 0) - (a.position?.y || 0))[0]
      
      if (lastNode) {
        const endNode: WorkflowNode = {
          id: `end-${Date.now()}`,
          type: "end",
          position: { 
            x: (lastNode.position?.x || 300), 
            y: (lastNode.position?.y || 300) + 150 
          },
          data: { label: "Ende" },
        }
        nodes.push(endNode)
        
        // Mit letztem Node verbinden wenn keine ausgehenden Edges
        const hasOutgoing = edges.some(e => e.source === lastNode.id)
        if (!hasOutgoing) {
          edges.push({
            id: `edge-${Date.now() + 1}`,
            source: lastNode.id,
            target: endNode.id,
          })
        }
        repairs.push("End-Node hinzugefügt")
      }
    }
    
    return { workflow: { nodes, edges }, repairs }
  }
}

// === WORKFLOW TEMPLATES ERWEITERT ===

export interface WorkflowTemplateCategory {
  id: string
  name: string
  description: string
  icon: string
  templates: string[]
}

export const WORKFLOW_TEMPLATE_CATEGORIES: WorkflowTemplateCategory[] = [
  {
    id: "development",
    name: "Entwicklung",
    description: "Workflows für Software-Entwicklung",
    icon: "Code",
    templates: ["code-review", "bug-fix", "feature-development", "refactoring"],
  },
  {
    id: "documentation",
    name: "Dokumentation",
    description: "Workflows für Dokumentationserstellung",
    icon: "FileText",
    templates: ["api-docs", "readme-generator", "changelog"],
  },
  {
    id: "testing",
    name: "Testing",
    description: "Workflows für Test-Erstellung und QA",
    icon: "TestTube",
    templates: ["unit-tests", "integration-tests", "e2e-tests"],
  },
  {
    id: "devops",
    name: "DevOps",
    description: "Workflows für CI/CD und Infrastruktur",
    icon: "Cloud",
    templates: ["ci-pipeline", "deployment", "monitoring-setup"],
  },
]

// Erweiterte Templates
export const EXTENDED_WORKFLOW_TEMPLATES: Record<string, {
  name: string
  description: string
  category: string
  difficulty: "beginner" | "intermediate" | "advanced"
  estimatedTime: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}> = {
  "unit-tests": {
    name: "Unit-Test Generator",
    description: "Generiert Unit-Tests für bestehenden Code",
    category: "testing",
    difficulty: "intermediate",
    estimatedTime: "2-3 min",
    nodes: [
      { id: "start", type: "start", position: { x: 250, y: 50 }, data: { label: "Start" } },
      { id: "analyzer", type: "agent", position: { x: 250, y: 150 }, data: { 
        label: "Code Analyzer", 
        agentId: "reviewer",
        description: "Analysiert Code-Struktur für Testbarkeit"
      }},
      { id: "test-gen", type: "agent", position: { x: 250, y: 280 }, data: { 
        label: "Test Generator", 
        agentId: "coder",
        description: "Generiert Unit-Tests"
      }},
      { id: "review", type: "agent", position: { x: 250, y: 410 }, data: { 
        label: "Test Review", 
        agentId: "reviewer",
        description: "Prüft Test-Qualität und Coverage"
      }},
      { id: "end", type: "end", position: { x: 250, y: 540 }, data: { label: "Ende" } },
    ],
    edges: [
      { id: "e1", source: "start", target: "analyzer" },
      { id: "e2", source: "analyzer", target: "test-gen" },
      { id: "e3", source: "test-gen", target: "review" },
      { id: "e4", source: "review", target: "end" },
    ],
  },
  "refactoring": {
    name: "Code Refactoring",
    description: "Automatisches Refactoring mit Best Practices",
    category: "development",
    difficulty: "advanced",
    estimatedTime: "5-8 min",
    nodes: [
      { id: "start", type: "start", position: { x: 250, y: 50 }, data: { label: "Start" } },
      { id: "smell-detect", type: "agent", position: { x: 250, y: 150 }, data: { 
        label: "Code Smell Detection", 
        agentId: "reviewer",
        description: "Erkennt Code Smells und Anti-Patterns"
      }},
      { id: "decision", type: "human-decision", position: { x: 250, y: 280 }, data: { 
        label: "Refactoring-Scope",
        question: "Welchen Umfang soll das Refactoring haben?",
        options: [
          { id: "minimal", label: "Minimal", description: "Nur kritische Issues" },
          { id: "standard", label: "Standard", description: "Alle empfohlenen Änderungen" },
          { id: "comprehensive", label: "Umfassend", description: "Vollständiges Refactoring" },
        ]
      }},
      { id: "refactor", type: "agent", position: { x: 250, y: 410 }, data: { 
        label: "Refactoring", 
        agentId: "coder",
        description: "Führt Refactoring durch"
      }},
      { id: "verify", type: "agent", position: { x: 250, y: 540 }, data: { 
        label: "Verification", 
        agentId: "reviewer",
        description: "Prüft Refactoring-Ergebnis"
      }},
      { id: "end", type: "end", position: { x: 250, y: 670 }, data: { label: "Ende" } },
    ],
    edges: [
      { id: "e1", source: "start", target: "smell-detect" },
      { id: "e2", source: "smell-detect", target: "decision" },
      { id: "e3", source: "decision", target: "refactor" },
      { id: "e4", source: "refactor", target: "verify" },
      { id: "e5", source: "verify", target: "end" },
    ],
  },
  "api-docs": {
    name: "API Documentation",
    description: "Generiert API-Dokumentation aus Code",
    category: "documentation",
    difficulty: "beginner",
    estimatedTime: "1-2 min",
    nodes: [
      { id: "start", type: "start", position: { x: 250, y: 50 }, data: { label: "Start" } },
      { id: "extract", type: "agent", position: { x: 250, y: 150 }, data: { 
        label: "API Extractor", 
        agentId: "researcher",
        description: "Extrahiert API-Endpunkte und Schemas"
      }},
      { id: "document", type: "agent", position: { x: 250, y: 280 }, data: { 
        label: "Doc Generator", 
        agentId: "coder",
        description: "Generiert Markdown-Dokumentation"
      }},
      { id: "end", type: "end", position: { x: 250, y: 410 }, data: { label: "Ende" } },
    ],
    edges: [
      { id: "e1", source: "start", target: "extract" },
      { id: "e2", source: "extract", target: "document" },
      { id: "e3", source: "document", target: "end" },
    ],
  },
}

// === WORKFLOW HISTORY & UNDO/REDO ===

export interface WorkflowHistoryEntry {
  id: string
  timestamp: Date
  action: string
  description: string
  before: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }
  after: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }
}

export class WorkflowHistoryManager {
  private history: WorkflowHistoryEntry[] = []
  private currentIndex: number = -1
  private maxHistory: number = 50
  private listeners: ((canUndo: boolean, canRedo: boolean) => void)[] = []
  
  // Änderung aufzeichnen
  record(
    action: string,
    description: string,
    before: { nodes: WorkflowNode[]; edges: WorkflowEdge[] },
    after: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }
  ): void {
    // Alles nach currentIndex entfernen (für neuen Branch)
    this.history = this.history.slice(0, this.currentIndex + 1)
    
    const entry: WorkflowHistoryEntry = {
      id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      action,
      description,
      before: this.deepClone(before),
      after: this.deepClone(after),
    }
    
    this.history.push(entry)
    this.currentIndex = this.history.length - 1
    
    // Max History einhalten
    if (this.history.length > this.maxHistory) {
      this.history.shift()
      this.currentIndex--
    }
    
    this.notifyListeners()
  }
  
  // Deep Clone für State
  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj))
  }
  
  // Undo
  undo(): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } | null {
    if (!this.canUndo()) return null
    
    const entry = this.history[this.currentIndex]
    this.currentIndex--
    this.notifyListeners()
    
    return this.deepClone(entry.before)
  }
  
  // Redo
  redo(): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } | null {
    if (!this.canRedo()) return null
    
    this.currentIndex++
    const entry = this.history[this.currentIndex]
    this.notifyListeners()
    
    return this.deepClone(entry.after)
  }
  
  // Kann Undo?
  canUndo(): boolean {
    return this.currentIndex >= 0
  }
  
  // Kann Redo?
  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1
  }
  
  // Listener für UI-Updates
  subscribe(listener: (canUndo: boolean, canRedo: boolean) => void): () => void {
    this.listeners.push(listener)
    return () => {
      const idx = this.listeners.indexOf(listener)
      if (idx > -1) this.listeners.splice(idx, 1)
    }
  }
  
  private notifyListeners(): void {
    this.listeners.forEach(l => l(this.canUndo(), this.canRedo()))
  }
  
  // History abrufen
  getHistory(): WorkflowHistoryEntry[] {
    return [...this.history]
  }
  
  // Zu bestimmtem Punkt springen
  jumpTo(index: number): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } | null {
    if (index < 0 || index >= this.history.length) return null
    
    this.currentIndex = index
    this.notifyListeners()
    
    return this.deepClone(this.history[index].after)
  }
  
  // History löschen
  clear(): void {
    this.history = []
    this.currentIndex = -1
    this.notifyListeners()
  }
}

// === AGENT MEMORY SYSTEM ===

export interface AgentMemory {
  id: string
  agentId: string
  type: "fact" | "preference" | "context" | "learning"
  content: string
  importance: number // 0-1
  createdAt: Date
  lastAccessedAt: Date
  accessCount: number
  metadata?: Record<string, unknown>
}

export interface AgentMemoryQuery {
  agentId?: string
  type?: AgentMemory["type"]
  minImportance?: number
  limit?: number
  searchText?: string
}

export class AgentMemoryManager {
  private memories: Map<string, AgentMemory> = new Map()
  private maxMemoriesPerAgent: number = 100
  
  // Memory hinzufügen
  addMemory(
    agentId: string,
    type: AgentMemory["type"],
    content: string,
    options: { importance?: number; metadata?: Record<string, unknown> } = {}
  ): string {
    const id = `mem-${agentId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    const memory: AgentMemory = {
      id,
      agentId,
      type,
      content,
      importance: options.importance || 0.5,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      accessCount: 0,
      metadata: options.metadata,
    }
    
    this.memories.set(id, memory)
    this.enforceLimit(agentId)
    
    return id
  }
  
  // Limit pro Agent einhalten (unwichtigste entfernen)
  private enforceLimit(agentId: string): void {
    const agentMemories = Array.from(this.memories.values())
      .filter(m => m.agentId === agentId)
      .sort((a, b) => {
        // Score basierend auf Importance und Zugriffshäufigkeit
        const scoreA = a.importance * 0.6 + (a.accessCount / 100) * 0.4
        const scoreB = b.importance * 0.6 + (b.accessCount / 100) * 0.4
        return scoreA - scoreB
      })
    
    while (agentMemories.length > this.maxMemoriesPerAgent) {
      const toRemove = agentMemories.shift()
      if (toRemove) this.memories.delete(toRemove.id)
    }
  }
  
  // Memory abrufen
  getMemory(id: string): AgentMemory | undefined {
    const memory = this.memories.get(id)
    if (memory) {
      memory.lastAccessedAt = new Date()
      memory.accessCount++
    }
    return memory
  }
  
  // Memories abfragen
  query(query: AgentMemoryQuery): AgentMemory[] {
    let results = Array.from(this.memories.values())
    
    if (query.agentId) {
      results = results.filter(m => m.agentId === query.agentId)
    }
    
    if (query.type) {
      results = results.filter(m => m.type === query.type)
    }
    
    if (query.minImportance !== undefined) {
      results = results.filter(m => m.importance >= query.minImportance!)
    }
    
    if (query.searchText) {
      const search = query.searchText.toLowerCase()
      results = results.filter(m => m.content.toLowerCase().includes(search))
    }
    
    // Nach Relevanz sortieren
    results.sort((a, b) => {
      const scoreA = a.importance * 0.5 + (a.accessCount / 100) * 0.3 + 
                     (1 - (Date.now() - a.lastAccessedAt.getTime()) / (24 * 60 * 60 * 1000)) * 0.2
      const scoreB = b.importance * 0.5 + (b.accessCount / 100) * 0.3 +
                     (1 - (Date.now() - b.lastAccessedAt.getTime()) / (24 * 60 * 60 * 1000)) * 0.2
      return scoreB - scoreA
    })
    
    if (query.limit) {
      results = results.slice(0, query.limit)
    }
    
    // Access zählen
    results.forEach(m => {
      m.lastAccessedAt = new Date()
      m.accessCount++
    })
    
    return results
  }
  
  // Relevante Memories für Kontext zusammenfassen
  getContextForAgent(agentId: string, maxTokens: number = 500): string {
    const memories = this.query({ 
      agentId, 
      minImportance: 0.3,
      limit: 10 
    })
    
    if (memories.length === 0) return ""
    
    const parts: string[] = ["## Relevante Erinnerungen"]
    let tokenCount = 0
    
    for (const memory of memories) {
      const entry = `- [${memory.type}] ${memory.content}`
      const entryTokens = entry.length / 4 // Grobe Schätzung
      
      if (tokenCount + entryTokens > maxTokens) break
      
      parts.push(entry)
      tokenCount += entryTokens
    }
    
    return parts.join("\n")
  }
  
  // Memory aktualisieren
  updateMemory(id: string, updates: Partial<Pick<AgentMemory, "content" | "importance" | "metadata">>): boolean {
    const memory = this.memories.get(id)
    if (!memory) return false
    
    if (updates.content !== undefined) memory.content = updates.content
    if (updates.importance !== undefined) memory.importance = updates.importance
    if (updates.metadata !== undefined) memory.metadata = { ...memory.metadata, ...updates.metadata }
    
    return true
  }
  
  // Memory löschen
  deleteMemory(id: string): boolean {
    return this.memories.delete(id)
  }
  
  // Alle Memories eines Agents löschen
  clearAgent(agentId: string): void {
    for (const [id, memory] of this.memories) {
      if (memory.agentId === agentId) {
        this.memories.delete(id)
      }
    }
  }
  
  // Export für Persistenz
  export(): AgentMemory[] {
    return Array.from(this.memories.values())
  }
  
  // Import
  import(memories: AgentMemory[]): void {
    for (const memory of memories) {
      this.memories.set(memory.id, {
        ...memory,
        createdAt: new Date(memory.createdAt),
        lastAccessedAt: new Date(memory.lastAccessedAt),
      })
    }
  }
}

// === WORKFLOW METRICS DASHBOARD DATA ===

export interface WorkflowMetricsSummary {
  totalExecutions: number
  successRate: number
  avgDuration: number
  totalNodesExecuted: number
  totalAgentCalls: number
  mostUsedAgents: { agentId: string; count: number }[]
  mostFailedNodes: { nodeId: string; label: string; failures: number }[]
  executionsByDay: { date: string; count: number; successRate: number }[]
  avgNodesPerWorkflow: number
  humanDecisionStats: {
    totalDecisions: number
    avgResponseTime: number
    mostChosenOptions: { optionId: string; label: string; count: number }[]
  }
}

export interface WorkflowExecutionRecord {
  id: string
  workflowId: string
  workflowName: string
  startedAt: Date
  completedAt?: Date
  status: "running" | "completed" | "failed" | "cancelled"
  nodesExecuted: number
  agentCalls: { agentId: string; duration: number; success: boolean }[]
  humanDecisions: { optionId: string; label: string; responseTime: number }[]
  error?: string
}

export class WorkflowMetricsCollector {
  private executions: WorkflowExecutionRecord[] = []
  private maxRecords: number = 1000
  
  // Execution starten
  startExecution(workflowId: string, workflowName: string): string {
    const id = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    this.executions.push({
      id,
      workflowId,
      workflowName,
      startedAt: new Date(),
      status: "running",
      nodesExecuted: 0,
      agentCalls: [],
      humanDecisions: [],
    })
    
    this.enforceLimit()
    return id
  }
  
  private enforceLimit(): void {
    if (this.executions.length > this.maxRecords) {
      this.executions = this.executions.slice(-this.maxRecords)
    }
  }
  
  // Agent-Call aufzeichnen
  recordAgentCall(executionId: string, agentId: string, duration: number, success: boolean): void {
    const execution = this.executions.find(e => e.id === executionId)
    if (execution) {
      execution.agentCalls.push({ agentId, duration, success })
      execution.nodesExecuted++
    }
  }
  
  // Human Decision aufzeichnen
  recordHumanDecision(executionId: string, optionId: string, label: string, responseTime: number): void {
    const execution = this.executions.find(e => e.id === executionId)
    if (execution) {
      execution.humanDecisions.push({ optionId, label, responseTime })
    }
  }
  
  // Execution abschließen
  completeExecution(executionId: string, status: "completed" | "failed" | "cancelled", error?: string): void {
    const execution = this.executions.find(e => e.id === executionId)
    if (execution) {
      execution.completedAt = new Date()
      execution.status = status
      execution.error = error
    }
  }
  
  // Zusammenfassung generieren
  getSummary(days: number = 30): WorkflowMetricsSummary {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const relevantExecs = this.executions.filter(e => e.startedAt >= cutoff)
    
    const completedExecs = relevantExecs.filter(e => e.status === "completed")
    const failedExecs = relevantExecs.filter(e => e.status === "failed")
    
    // Agent-Nutzung zählen
    const agentCounts: Record<string, number> = {}
    const nodeFailures: Record<string, { label: string; count: number }> = {}
    
    for (const exec of relevantExecs) {
      for (const call of exec.agentCalls) {
        agentCounts[call.agentId] = (agentCounts[call.agentId] || 0) + 1
        if (!call.success) {
          if (!nodeFailures[call.agentId]) {
            nodeFailures[call.agentId] = { label: call.agentId, count: 0 }
          }
          nodeFailures[call.agentId].count++
        }
      }
    }
    
    // Executions nach Tag gruppieren
    const byDay: Record<string, { count: number; success: number }> = {}
    for (const exec of relevantExecs) {
      const day = exec.startedAt.toISOString().split("T")[0]
      if (!byDay[day]) byDay[day] = { count: 0, success: 0 }
      byDay[day].count++
      if (exec.status === "completed") byDay[day].success++
    }
    
    // Human Decision Stats
    const allDecisions = relevantExecs.flatMap(e => e.humanDecisions)
    const optionCounts: Record<string, { label: string; count: number }> = {}
    for (const decision of allDecisions) {
      if (!optionCounts[decision.optionId]) {
        optionCounts[decision.optionId] = { label: decision.label, count: 0 }
      }
      optionCounts[decision.optionId].count++
    }
    
    return {
      totalExecutions: relevantExecs.length,
      successRate: relevantExecs.length > 0 
        ? completedExecs.length / relevantExecs.length 
        : 0,
      avgDuration: completedExecs.length > 0
        ? completedExecs.reduce((sum, e) => 
            sum + ((e.completedAt?.getTime() || 0) - e.startedAt.getTime()), 0
          ) / completedExecs.length
        : 0,
      totalNodesExecuted: relevantExecs.reduce((sum, e) => sum + e.nodesExecuted, 0),
      totalAgentCalls: relevantExecs.reduce((sum, e) => sum + e.agentCalls.length, 0),
      mostUsedAgents: Object.entries(agentCounts)
        .map(([agentId, count]) => ({ agentId, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      mostFailedNodes: Object.entries(nodeFailures)
        .map(([nodeId, data]) => ({ nodeId, label: data.label, failures: data.count }))
        .sort((a, b) => b.failures - a.failures)
        .slice(0, 5),
      executionsByDay: Object.entries(byDay)
        .map(([date, data]) => ({
          date,
          count: data.count,
          successRate: data.count > 0 ? data.success / data.count : 0,
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      avgNodesPerWorkflow: relevantExecs.length > 0
        ? relevantExecs.reduce((sum, e) => sum + e.nodesExecuted, 0) / relevantExecs.length
        : 0,
      humanDecisionStats: {
        totalDecisions: allDecisions.length,
        avgResponseTime: allDecisions.length > 0
          ? allDecisions.reduce((sum, d) => sum + d.responseTime, 0) / allDecisions.length
          : 0,
        mostChosenOptions: Object.entries(optionCounts)
          .map(([optionId, data]) => ({ optionId, label: data.label, count: data.count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5),
      },
    }
  }
  
  // Export für Persistenz
  export(): WorkflowExecutionRecord[] {
    return [...this.executions]
  }
  
  // Import
  import(records: WorkflowExecutionRecord[]): void {
    this.executions = records.map(r => ({
      ...r,
      startedAt: new Date(r.startedAt),
      completedAt: r.completedAt ? new Date(r.completedAt) : undefined,
    }))
  }
}

// === WORKFLOW KEYBOARD SHORTCUTS ===

export interface KeyboardShortcut {
  key: string
  modifiers: ("ctrl" | "shift" | "alt" | "meta")[]
  action: string
  description: string
}

export const WORKFLOW_KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  { key: "z", modifiers: ["ctrl"], action: "undo", description: "Rückgängig" },
  { key: "z", modifiers: ["ctrl", "shift"], action: "redo", description: "Wiederholen" },
  { key: "s", modifiers: ["ctrl"], action: "save", description: "Speichern" },
  { key: "n", modifiers: ["ctrl"], action: "new-node", description: "Neuer Node" },
  { key: "Delete", modifiers: [], action: "delete-selected", description: "Ausgewählte löschen" },
  { key: "Backspace", modifiers: [], action: "delete-selected", description: "Ausgewählte löschen" },
  { key: "a", modifiers: ["ctrl"], action: "select-all", description: "Alle auswählen" },
  { key: "c", modifiers: ["ctrl"], action: "copy", description: "Kopieren" },
  { key: "v", modifiers: ["ctrl"], action: "paste", description: "Einfügen" },
  { key: "d", modifiers: ["ctrl"], action: "duplicate", description: "Duplizieren" },
  { key: "g", modifiers: ["ctrl"], action: "group", description: "Gruppieren" },
  { key: "Escape", modifiers: [], action: "deselect", description: "Auswahl aufheben" },
  { key: " ", modifiers: [], action: "toggle-run", description: "Starten/Pausieren" },
  { key: "f", modifiers: ["ctrl"], action: "search", description: "Suchen" },
  { key: "+", modifiers: ["ctrl"], action: "zoom-in", description: "Reinzoomen" },
  { key: "-", modifiers: ["ctrl"], action: "zoom-out", description: "Rauszoomen" },
  { key: "0", modifiers: ["ctrl"], action: "zoom-reset", description: "Zoom zurücksetzen" },
]

// Shortcut-Matcher
export function matchShortcut(
  event: { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }
): KeyboardShortcut | null {
  for (const shortcut of WORKFLOW_KEYBOARD_SHORTCUTS) {
    if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) continue
    
    const hasCtrl = shortcut.modifiers.includes("ctrl")
    const hasShift = shortcut.modifiers.includes("shift")
    const hasAlt = shortcut.modifiers.includes("alt")
    const hasMeta = shortcut.modifiers.includes("meta")
    
    if (
      event.ctrlKey === hasCtrl &&
      event.shiftKey === hasShift &&
      event.altKey === hasAlt &&
      event.metaKey === hasMeta
    ) {
      return shortcut
    }
  }
  
  return null
}

// === ADVANCED CONDITIONAL BRANCHING ===

export interface ConditionalRule {
  id: string
  name: string
  condition: ConditionalExpression
  targetNodeId: string
  priority: number
}

export type ConditionalExpression = 
  | { type: "simple"; operator: ConditionalOperator; field: string; value: unknown }
  | { type: "and"; conditions: ConditionalExpression[] }
  | { type: "or"; conditions: ConditionalExpression[] }
  | { type: "not"; condition: ConditionalExpression }
  | { type: "custom"; evaluate: (context: EvaluationContext) => boolean }

export type ConditionalOperator = 
  | "equals" | "not-equals" 
  | "contains" | "not-contains"
  | "starts-with" | "ends-with"
  | "greater-than" | "less-than"
  | "greater-or-equal" | "less-or-equal"
  | "matches-regex" | "is-empty" | "is-not-empty"
  | "in-array" | "not-in-array"

export interface EvaluationContext {
  output: string
  metadata?: Record<string, unknown>
  variables: Record<string, unknown>
  previousResults: Record<string, WorkflowStepResult>
}

export class ConditionalEvaluator {
  // Regel auswerten
  evaluate(expression: ConditionalExpression, context: EvaluationContext): boolean {
    switch (expression.type) {
      case "simple":
        return this.evaluateSimple(expression, context)
      case "and":
        return expression.conditions.every(c => this.evaluate(c, context))
      case "or":
        return expression.conditions.some(c => this.evaluate(c, context))
      case "not":
        return !this.evaluate(expression.condition, context)
      case "custom":
        try {
          return expression.evaluate(context)
        } catch {
          return false
        }
    }
  }
  
  private evaluateSimple(
    expr: { operator: ConditionalOperator; field: string; value: unknown },
    context: EvaluationContext
  ): boolean {
    const fieldValue = this.getFieldValue(expr.field, context)
    const compareValue = expr.value
    
    switch (expr.operator) {
      case "equals":
        return fieldValue === compareValue
      case "not-equals":
        return fieldValue !== compareValue
      case "contains":
        return String(fieldValue).toLowerCase().includes(String(compareValue).toLowerCase())
      case "not-contains":
        return !String(fieldValue).toLowerCase().includes(String(compareValue).toLowerCase())
      case "starts-with":
        return String(fieldValue).toLowerCase().startsWith(String(compareValue).toLowerCase())
      case "ends-with":
        return String(fieldValue).toLowerCase().endsWith(String(compareValue).toLowerCase())
      case "greater-than":
        return Number(fieldValue) > Number(compareValue)
      case "less-than":
        return Number(fieldValue) < Number(compareValue)
      case "greater-or-equal":
        return Number(fieldValue) >= Number(compareValue)
      case "less-or-equal":
        return Number(fieldValue) <= Number(compareValue)
      case "matches-regex":
        try {
          return new RegExp(String(compareValue), "i").test(String(fieldValue))
        } catch {
          return false
        }
      case "is-empty":
        return fieldValue === null || fieldValue === undefined || fieldValue === ""
      case "is-not-empty":
        return fieldValue !== null && fieldValue !== undefined && fieldValue !== ""
      case "in-array":
        return Array.isArray(compareValue) && compareValue.includes(fieldValue)
      case "not-in-array":
        return !Array.isArray(compareValue) || !compareValue.includes(fieldValue)
      default:
        return false
    }
  }
  
  private getFieldValue(field: string, context: EvaluationContext): unknown {
    const parts = field.split(".")
    let value: unknown = context
    
    for (const part of parts) {
      if (value === null || value === undefined) return undefined
      value = (value as Record<string, unknown>)[part]
    }
    
    return value
  }
  
  // Erste passende Regel finden
  findMatchingRule(rules: ConditionalRule[], context: EvaluationContext): ConditionalRule | null {
    const sorted = [...rules].sort((a, b) => b.priority - a.priority)
    
    for (const rule of sorted) {
      if (this.evaluate(rule.condition, context)) {
        return rule
      }
    }
    
    return null
  }
}

// === AGENT OUTPUT PARSER ===

export interface ParsedOutput {
  type: "code" | "text" | "json" | "markdown" | "error" | "mixed"
  content: string
  codeBlocks: CodeBlock[]
  sections: OutputSection[]
  metadata: {
    hasErrors: boolean
    hasWarnings: boolean
    filesGenerated: string[]
    suggestionsCount: number
    confidence?: number
  }
}

export interface CodeBlock {
  language: string
  code: string
  filename?: string
  startLine: number
  endLine: number
}

export interface OutputSection {
  type: "heading" | "paragraph" | "list" | "code" | "quote"
  content: string
  level?: number
}

export class AgentOutputParser {
  // Output parsen
  parse(output: string): ParsedOutput {
    const codeBlocks = this.extractCodeBlocks(output)
    const sections = this.extractSections(output)
    const metadata = this.extractMetadata(output, codeBlocks)
    
    // Typ bestimmen
    let type: ParsedOutput["type"] = "text"
    if (codeBlocks.length > 0 && sections.length > 0) {
      type = "mixed"
    } else if (codeBlocks.length > 0) {
      type = "code"
    } else if (output.trim().startsWith("{") || output.trim().startsWith("[")) {
      type = "json"
    } else if (output.includes("# ") || output.includes("## ")) {
      type = "markdown"
    }
    
    if (metadata.hasErrors) {
      type = "error"
    }
    
    return {
      type,
      content: output,
      codeBlocks,
      sections,
      metadata,
    }
  }
  
  // Code-Blöcke extrahieren
  private extractCodeBlocks(output: string): CodeBlock[] {
    const blocks: CodeBlock[] = []
    const regex = /```(\w+)?(?:\s+([^\n]+))?\n([\s\S]*?)```/g
    let match
    
    while ((match = regex.exec(output)) !== null) {
      const language = match[1] || "text"
      const filenameHint = match[2]
      const code = match[3].trim()
      
      // Filename aus Hint oder Code extrahieren
      let filename: string | undefined
      if (filenameHint) {
        filename = filenameHint.trim()
      } else {
        // Versuche aus erstem Kommentar zu extrahieren
        const commentMatch = code.match(/^(?:\/\/|#|<!--)\s*(?:file|filename):\s*(.+)/i)
        if (commentMatch) {
          filename = commentMatch[1].trim()
        }
      }
      
      // Zeilennummern berechnen
      const beforeMatch = output.substring(0, match.index)
      const startLine = beforeMatch.split("\n").length
      const endLine = startLine + code.split("\n").length - 1
      
      blocks.push({
        language,
        code,
        filename,
        startLine,
        endLine,
      })
    }
    
    return blocks
  }
  
  // Sektionen extrahieren
  private extractSections(output: string): OutputSection[] {
    const sections: OutputSection[] = []
    const lines = output.split("\n")
    let currentSection: OutputSection | null = null
    
    for (const line of lines) {
      // Heading
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/)
      if (headingMatch) {
        if (currentSection) sections.push(currentSection)
        currentSection = {
          type: "heading",
          content: headingMatch[2],
          level: headingMatch[1].length,
        }
        continue
      }
      
      // List item
      if (line.match(/^[-*+]\s+/) || line.match(/^\d+\.\s+/)) {
        if (currentSection?.type !== "list") {
          if (currentSection) sections.push(currentSection)
          currentSection = { type: "list", content: "" }
        }
        currentSection.content += line + "\n"
        continue
      }
      
      // Quote
      if (line.startsWith("> ")) {
        if (currentSection?.type !== "quote") {
          if (currentSection) sections.push(currentSection)
          currentSection = { type: "quote", content: "" }
        }
        currentSection.content += line.substring(2) + "\n"
        continue
      }
      
      // Paragraph
      if (line.trim()) {
        if (currentSection?.type !== "paragraph") {
          if (currentSection) sections.push(currentSection)
          currentSection = { type: "paragraph", content: "" }
        }
        currentSection.content += line + " "
      }
    }
    
    if (currentSection) sections.push(currentSection)
    
    return sections.map(s => ({
      ...s,
      content: s.content.trim(),
    }))
  }
  
  // Metadata extrahieren
  private extractMetadata(output: string, codeBlocks: CodeBlock[]): ParsedOutput["metadata"] {
    const lower = output.toLowerCase()
    
    // Dateien aus Code-Blöcken
    const filesGenerated = codeBlocks
      .filter(b => b.filename)
      .map(b => b.filename!)
    
    // Zusätzliche Dateinamen suchen
    const fileMatches = output.match(/(?:erstellt|generiert|created|generated):\s*`?([^\s`]+\.\w+)`?/gi)
    if (fileMatches) {
      for (const match of fileMatches) {
        const filename = match.match(/`?([^\s`]+\.\w+)`?$/)?.[1]
        if (filename && !filesGenerated.includes(filename)) {
          filesGenerated.push(filename)
        }
      }
    }
    
    // Suggestions zählen
    const suggestionPatterns = [
      /(?:vorschlag|suggestion|empfehlung|tipp)(?:s)?:/gi,
      /(?:sollte|should|könnte|could|würde|would)\s+\w+/gi,
    ]
    let suggestionsCount = 0
    for (const pattern of suggestionPatterns) {
      const matches = output.match(pattern)
      if (matches) suggestionsCount += matches.length
    }
    
    // Confidence aus Output extrahieren
    let confidence: number | undefined
    const confidenceMatch = output.match(/(?:confidence|sicherheit|zuversicht):\s*(\d+)%?/i)
    if (confidenceMatch) {
      confidence = parseInt(confidenceMatch[1]) / 100
    }
    
    return {
      hasErrors: lower.includes("error:") || lower.includes("fehler:") || 
                 lower.includes("exception:") || lower.includes("failed:"),
      hasWarnings: lower.includes("warning:") || lower.includes("warnung:"),
      filesGenerated,
      suggestionsCount: Math.min(suggestionsCount, 10),
      confidence,
    }
  }
  
  // JSON aus Output extrahieren
  extractJSON<T>(output: string): T | null {
    // Versuche direktes Parsing
    try {
      return JSON.parse(output.trim())
    } catch {}
    
    // Suche JSON in Code-Block
    const jsonBlock = output.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonBlock) {
      try {
        return JSON.parse(jsonBlock[1].trim())
      } catch {}
    }
    
    // Suche JSON-Objekt im Text
    const jsonMatch = output.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0])
      } catch {}
    }
    
    return null
  }
}

// === WORKFLOW EXECUTION QUEUE ===

export interface QueuedWorkflow {
  id: string
  workflowId: string
  workflowName: string
  input: string
  priority: number
  status: "queued" | "running" | "completed" | "failed" | "cancelled"
  addedAt: Date
  startedAt?: Date
  completedAt?: Date
  result?: string
  error?: string
  retryCount: number
  maxRetries: number
}

export interface ExecutionQueueConfig {
  maxConcurrent: number
  defaultPriority: number
  maxRetries: number
  retryDelay: number
  onStart?: (workflow: QueuedWorkflow) => void
  onComplete?: (workflow: QueuedWorkflow) => void
  onError?: (workflow: QueuedWorkflow, error: string) => void
}

export class WorkflowExecutionQueue {
  private queue: QueuedWorkflow[] = []
  private running: Map<string, QueuedWorkflow> = new Map()
  private config: ExecutionQueueConfig
  private isProcessing: boolean = false
  private executor?: (workflowId: string, input: string) => Promise<string>
  
  constructor(config: Partial<ExecutionQueueConfig> = {}) {
    this.config = {
      maxConcurrent: 2,
      defaultPriority: 5,
      maxRetries: 2,
      retryDelay: 5000,
      ...config,
    }
  }
  
  // Executor setzen
  setExecutor(executor: (workflowId: string, input: string) => Promise<string>): void {
    this.executor = executor
  }
  
  // Workflow zur Queue hinzufügen
  enqueue(
    workflowId: string,
    workflowName: string,
    input: string,
    options: { priority?: number; maxRetries?: number } = {}
  ): string {
    const id = `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    const workflow: QueuedWorkflow = {
      id,
      workflowId,
      workflowName,
      input,
      priority: options.priority ?? this.config.defaultPriority,
      status: "queued",
      addedAt: new Date(),
      retryCount: 0,
      maxRetries: options.maxRetries ?? this.config.maxRetries,
    }
    
    this.queue.push(workflow)
    this.sortQueue()
    
    // Automatisch starten
    if (!this.isProcessing) {
      this.processQueue()
    }
    
    return id
  }
  
  // Queue nach Priorität sortieren
  private sortQueue(): void {
    this.queue.sort((a, b) => b.priority - a.priority)
  }
  
  // Queue verarbeiten
  private async processQueue(): Promise<void> {
    if (!this.executor) return
    this.isProcessing = true
    
    while (this.queue.length > 0 || this.running.size > 0) {
      // Neue Workflows starten wenn Kapazität frei
      while (
        this.queue.length > 0 && 
        this.running.size < this.config.maxConcurrent
      ) {
        const workflow = this.queue.shift()!
        this.running.set(workflow.id, workflow)
        this.executeWorkflow(workflow)
      }
      
      // Warten bevor nächste Iteration
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    this.isProcessing = false
  }
  
  // Einzelnen Workflow ausführen
  private async executeWorkflow(workflow: QueuedWorkflow): Promise<void> {
    workflow.status = "running"
    workflow.startedAt = new Date()
    this.config.onStart?.(workflow)
    
    try {
      const result = await this.executor!(workflow.workflowId, workflow.input)
      
      workflow.status = "completed"
      workflow.completedAt = new Date()
      workflow.result = result
      this.config.onComplete?.(workflow)
    } catch (error) {
      const errorMessage = (error as Error).message
      
      if (workflow.retryCount < workflow.maxRetries) {
        // Retry
        workflow.retryCount++
        workflow.status = "queued"
        
        // Mit Delay wieder in Queue einfügen
        setTimeout(() => {
          this.queue.unshift(workflow)
          this.sortQueue()
        }, this.config.retryDelay)
      } else {
        workflow.status = "failed"
        workflow.completedAt = new Date()
        workflow.error = errorMessage
        this.config.onError?.(workflow, errorMessage)
      }
    } finally {
      this.running.delete(workflow.id)
    }
  }
  
  // Workflow abbrechen
  cancel(id: string): boolean {
    const queueIndex = this.queue.findIndex(w => w.id === id)
    if (queueIndex >= 0) {
      this.queue[queueIndex].status = "cancelled"
      this.queue.splice(queueIndex, 1)
      return true
    }
    
    const running = this.running.get(id)
    if (running) {
      running.status = "cancelled"
      return true
    }
    
    return false
  }
  
  // Status abrufen
  getStatus(id: string): QueuedWorkflow | undefined {
    const queued = this.queue.find(w => w.id === id)
    if (queued) return queued
    
    return this.running.get(id)
  }
  
  // Alle Workflows abrufen
  getAll(): QueuedWorkflow[] {
    return [
      ...Array.from(this.running.values()),
      ...this.queue,
    ]
  }
  
  // Queue-Statistiken
  getStats(): {
    queued: number
    running: number
    completed: number
    failed: number
    avgWaitTime: number
  } {
    const all = this.getAll()
    const completed = all.filter(w => w.status === "completed")
    
    const avgWaitTime = completed.length > 0
      ? completed.reduce((sum, w) => {
          const wait = (w.startedAt?.getTime() || 0) - w.addedAt.getTime()
          return sum + wait
        }, 0) / completed.length
      : 0
    
    return {
      queued: this.queue.length,
      running: this.running.size,
      completed: completed.length,
      failed: all.filter(w => w.status === "failed").length,
      avgWaitTime,
    }
  }
  
  // Queue leeren
  clear(): void {
    this.queue = []
  }
  
  // Priorität ändern
  updatePriority(id: string, priority: number): boolean {
    const workflow = this.queue.find(w => w.id === id)
    if (workflow) {
      workflow.priority = priority
      this.sortQueue()
      return true
    }
    return false
  }
}

// === WORKFLOW DIFF & COMPARISON ===

export interface WorkflowDiff {
  addedNodes: WorkflowNode[]
  removedNodes: WorkflowNode[]
  modifiedNodes: { before: WorkflowNode; after: WorkflowNode; changes: string[] }[]
  addedEdges: WorkflowEdge[]
  removedEdges: WorkflowEdge[]
}

export function compareWorkflows(
  before: { nodes: WorkflowNode[]; edges: WorkflowEdge[] },
  after: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }
): WorkflowDiff {
  const diff: WorkflowDiff = {
    addedNodes: [],
    removedNodes: [],
    modifiedNodes: [],
    addedEdges: [],
    removedEdges: [],
  }
  
  const beforeNodeIds = new Set(before.nodes.map(n => n.id))
  const afterNodeIds = new Set(after.nodes.map(n => n.id))
  
  // Added nodes
  diff.addedNodes = after.nodes.filter(n => !beforeNodeIds.has(n.id))
  
  // Removed nodes
  diff.removedNodes = before.nodes.filter(n => !afterNodeIds.has(n.id))
  
  // Modified nodes
  for (const afterNode of after.nodes) {
    const beforeNode = before.nodes.find(n => n.id === afterNode.id)
    if (!beforeNode) continue
    
    const changes: string[] = []
    
    if (beforeNode.data.label !== afterNode.data.label) {
      changes.push(`label: "${beforeNode.data.label}" → "${afterNode.data.label}"`)
    }
    if (beforeNode.type !== afterNode.type) {
      changes.push(`type: ${beforeNode.type} → ${afterNode.type}`)
    }
    if (beforeNode.data.agentId !== afterNode.data.agentId) {
      changes.push(`agent: ${beforeNode.data.agentId} → ${afterNode.data.agentId}`)
    }
    if (JSON.stringify(beforeNode.position) !== JSON.stringify(afterNode.position)) {
      changes.push("position geändert")
    }
    
    if (changes.length > 0) {
      diff.modifiedNodes.push({ before: beforeNode, after: afterNode, changes })
    }
  }
  
  const beforeEdgeIds = new Set(before.edges.map(e => e.id))
  const afterEdgeIds = new Set(after.edges.map(e => e.id))
  
  // Added edges
  diff.addedEdges = after.edges.filter(e => !beforeEdgeIds.has(e.id))
  
  // Removed edges
  diff.removedEdges = before.edges.filter(e => !afterEdgeIds.has(e.id))
  
  return diff
}

// Diff als Text formatieren
export function formatWorkflowDiff(diff: WorkflowDiff): string {
  const lines: string[] = []
  
  if (diff.addedNodes.length > 0) {
    lines.push(`## Hinzugefügte Nodes (${diff.addedNodes.length})`)
    for (const node of diff.addedNodes) {
      lines.push(`+ ${node.data.label || node.id} (${node.type})`)
    }
    lines.push("")
  }
  
  if (diff.removedNodes.length > 0) {
    lines.push(`## Entfernte Nodes (${diff.removedNodes.length})`)
    for (const node of diff.removedNodes) {
      lines.push(`- ${node.data.label || node.id} (${node.type})`)
    }
    lines.push("")
  }
  
  if (diff.modifiedNodes.length > 0) {
    lines.push(`## Geänderte Nodes (${diff.modifiedNodes.length})`)
    for (const { after, changes } of diff.modifiedNodes) {
      lines.push(`~ ${after.data.label || after.id}:`)
      for (const change of changes) {
        lines.push(`  - ${change}`)
      }
    }
    lines.push("")
  }
  
  if (diff.addedEdges.length > 0) {
    lines.push(`## Hinzugefügte Verbindungen (${diff.addedEdges.length})`)
    for (const edge of diff.addedEdges) {
      lines.push(`+ ${edge.source} → ${edge.target}`)
    }
    lines.push("")
  }
  
  if (diff.removedEdges.length > 0) {
    lines.push(`## Entfernte Verbindungen (${diff.removedEdges.length})`)
    for (const edge of diff.removedEdges) {
      lines.push(`- ${edge.source} → ${edge.target}`)
    }
  }
  
  return lines.join("\n")
}

// === WORKFLOW AUTO-COMPLETION & SUGGESTIONS ===

export interface WorkflowSuggestion {
  id: string
  type: "add-node" | "connect-nodes" | "add-agent" | "optimize" | "fix-issue"
  title: string
  description: string
  priority: number
  autoApply?: () => { nodes: WorkflowNode[]; edges: WorkflowEdge[] }
}

export class WorkflowAutoComplete {
  // Vorschläge basierend auf aktuellem Workflow generieren
  getSuggestions(workflow: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }): WorkflowSuggestion[] {
    const suggestions: WorkflowSuggestion[] = []
    
    // 1. Fehlender End-Node
    const hasEndNode = workflow.nodes.some(n => n.type === "end")
    if (!hasEndNode) {
      suggestions.push({
        id: "add-end-node",
        type: "add-node",
        title: "End-Node hinzufügen",
        description: "Workflow hat keinen End-Node. Empfohlen für sauberen Abschluss.",
        priority: 8,
      })
    }
    
    // 2. Dead-End Nodes (außer End)
    for (const node of workflow.nodes) {
      if (node.type === "end") continue
      const hasOutgoing = workflow.edges.some(e => e.source === node.id)
      if (!hasOutgoing) {
        suggestions.push({
          id: `connect-${node.id}`,
          type: "connect-nodes",
          title: `"${node.data.label}" verbinden`,
          description: `Node hat keine ausgehende Verbindung.`,
          priority: 7,
        })
      }
    }
    
    // 3. Review nach Coder empfehlen
    const coderNodes = workflow.nodes.filter(n => n.data.agentId === "coder")
    for (const coder of coderNodes) {
      const outgoing = workflow.edges.filter(e => e.source === coder.id)
      const hasReviewAfter = outgoing.some(edge => {
        const target = workflow.nodes.find(n => n.id === edge.target)
        return target?.data.agentId === "reviewer"
      })
      
      if (!hasReviewAfter) {
        suggestions.push({
          id: `add-review-after-${coder.id}`,
          type: "add-agent",
          title: `Reviewer nach "${coder.data.label}" hinzufügen`,
          description: "Code-Review nach Coder verbessert Qualität.",
          priority: 6,
        })
      }
    }
    
    // 4. Human-Decision für kritische Entscheidungen
    const hasHumanDecision = workflow.nodes.some(n => n.type === "human-decision")
    if (!hasHumanDecision && workflow.nodes.length > 3) {
      suggestions.push({
        id: "add-human-decision",
        type: "add-node",
        title: "Human-Decision hinzufügen",
        description: "Menschliche Kontrolle bei wichtigen Entscheidungen.",
        priority: 5,
      })
    }
    
    // 5. Parallel-Execution Möglichkeit
    const independentAgents = this.findParallelizableNodes(workflow)
    if (independentAgents.length >= 2) {
      suggestions.push({
        id: "parallelize-agents",
        type: "optimize",
        title: "Agents parallelisieren",
        description: `${independentAgents.length} Agents könnten parallel laufen.`,
        priority: 4,
      })
    }
    
    // 6. Condition nach Review
    const reviewNodes = workflow.nodes.filter(n => n.data.agentId === "reviewer")
    for (const review of reviewNodes) {
      const outgoing = workflow.edges.filter(e => e.source === review.id)
      const hasCondition = outgoing.some(edge => {
        const target = workflow.nodes.find(n => n.id === edge.target)
        return target?.type === "condition"
      })
      
      if (!hasCondition && outgoing.length === 1) {
        suggestions.push({
          id: `add-condition-after-${review.id}`,
          type: "add-node",
          title: `Bedingung nach "${review.data.label}"`,
          description: "Bei Fehlern automatisch zur Korrektur weiterleiten.",
          priority: 5,
        })
      }
    }
    
    return suggestions.sort((a, b) => b.priority - a.priority)
  }
  
  // Parallelisierbare Nodes finden
  private findParallelizableNodes(workflow: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }): WorkflowNode[] {
    const result: WorkflowNode[] = []
    
    // Nodes mit gleichem Vorgänger finden
    const nodesBySource: Map<string, WorkflowNode[]> = new Map()
    
    for (const edge of workflow.edges) {
      const target = workflow.nodes.find(n => n.id === edge.target)
      if (target && target.type === "agent") {
        const existing = nodesBySource.get(edge.source) || []
        existing.push(target)
        nodesBySource.set(edge.source, existing)
      }
    }
    
    // Gruppen mit mehr als einem Agent
    for (const [, nodes] of nodesBySource) {
      if (nodes.length >= 2) {
        result.push(...nodes)
      }
    }
    
    return result
  }
  
  // Nächsten logischen Node-Typ vorschlagen
  suggestNextNode(currentNode: WorkflowNode): { type: string; agentId?: string; reason: string }[] {
    const suggestions: { type: string; agentId?: string; reason: string }[] = []
    
    switch (currentNode.type) {
      case "start":
        suggestions.push(
          { type: "agent", agentId: "researcher", reason: "Analyse zuerst" },
          { type: "agent", agentId: "coder", reason: "Direkt zur Implementierung" }
        )
        break
        
      case "agent":
        switch (currentNode.data.agentId) {
          case "coder":
            suggestions.push(
              { type: "agent", agentId: "reviewer", reason: "Code-Review" },
              { type: "human-decision", reason: "Manuelle Prüfung" },
              { type: "condition", reason: "Automatische Verzweigung" }
            )
            break
          case "reviewer":
            suggestions.push(
              { type: "condition", reason: "Bei Fehlern zu Coder" },
              { type: "agent", agentId: "coder", reason: "Direkte Korrektur" },
              { type: "end", reason: "Review abschließen" }
            )
            break
          case "researcher":
            suggestions.push(
              { type: "agent", agentId: "coder", reason: "Recherche implementieren" },
              { type: "agent", agentId: "architect", reason: "Architektur planen" }
            )
            break
          default:
            suggestions.push(
              { type: "agent", agentId: "reviewer", reason: "Ergebnis prüfen" },
              { type: "end", reason: "Abschließen" }
            )
        }
        break
        
      case "condition":
        suggestions.push(
          { type: "agent", agentId: "coder", reason: "Bei Fehler korrigieren" },
          { type: "end", reason: "Bei Erfolg beenden" }
        )
        break
        
      case "human-decision":
        suggestions.push(
          { type: "agent", agentId: "coder", reason: "Weiter implementieren" },
          { type: "end", reason: "Abbrechen möglich" }
        )
        break
    }
    
    return suggestions
  }
}

// === AGENT COLLABORATION PATTERNS ===

export type CollaborationPattern = 
  | "sequential"      // A → B → C
  | "parallel"        // A → [B, C, D] → E
  | "review-loop"     // Coder ↔ Reviewer
  | "expert-panel"    // Multiple Reviewers → Consensus
  | "divide-conquer"  // Split → Parallel → Merge
  | "supervisor"      // Main Agent + Helper Agents

export interface CollaborationConfig {
  pattern: CollaborationPattern
  agents: string[]
  options?: Record<string, unknown>
}

export class AgentCollaborationPatterns {
  // Pattern-basierte Workflow-Generierung
  generateWorkflow(config: CollaborationConfig): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
    switch (config.pattern) {
      case "sequential":
        return this.generateSequential(config.agents)
      case "parallel":
        return this.generateParallel(config.agents)
      case "review-loop":
        return this.generateReviewLoop(config.agents, config.options?.maxIterations as number || 3)
      case "expert-panel":
        return this.generateExpertPanel(config.agents)
      case "divide-conquer":
        return this.generateDivideConquer(config.agents)
      case "supervisor":
        return this.generateSupervisor(config.agents)
      default:
        return { nodes: [], edges: [] }
    }
  }
  
  // Sequential: A → B → C
  private generateSequential(agents: string[]): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
    const nodes: WorkflowNode[] = [
      { id: "start", type: "start", position: { x: 250, y: 50 }, data: { label: "Start" } }
    ]
    const edges: WorkflowEdge[] = []
    
    let y = 150
    let prevId = "start"
    
    for (let i = 0; i < agents.length; i++) {
      const nodeId = `agent-${i}`
      nodes.push({
        id: nodeId,
        type: "agent",
        position: { x: 250, y },
        data: { label: agents[i], agentId: agents[i] }
      })
      edges.push({ id: `e-${prevId}-${nodeId}`, source: prevId, target: nodeId })
      prevId = nodeId
      y += 120
    }
    
    nodes.push({ id: "end", type: "end", position: { x: 250, y }, data: { label: "Ende" } })
    edges.push({ id: `e-${prevId}-end`, source: prevId, target: "end" })
    
    return { nodes, edges }
  }
  
  // Parallel: A → [B, C, D] → E
  private generateParallel(agents: string[]): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
    if (agents.length < 2) return this.generateSequential(agents)
    
    const [first, ...parallel] = agents
    const nodes: WorkflowNode[] = [
      { id: "start", type: "start", position: { x: 250, y: 50 }, data: { label: "Start" } },
      { id: "split", type: "agent", position: { x: 250, y: 150 }, data: { label: first, agentId: first } }
    ]
    const edges: WorkflowEdge[] = [
      { id: "e-start-split", source: "start", target: "split" }
    ]
    
    // Parallele Agents
    const width = parallel.length * 200
    const startX = 250 - width / 2 + 100
    
    for (let i = 0; i < parallel.length; i++) {
      const nodeId = `parallel-${i}`
      nodes.push({
        id: nodeId,
        type: "agent",
        position: { x: startX + i * 200, y: 280 },
        data: { label: parallel[i], agentId: parallel[i] }
      })
      edges.push({ id: `e-split-${nodeId}`, source: "split", target: nodeId })
    }
    
    // Merge Node
    nodes.push({ id: "merge", type: "agent", position: { x: 250, y: 410 }, 
      data: { label: "Zusammenführen", agentId: "merger" } })
    
    for (let i = 0; i < parallel.length; i++) {
      edges.push({ id: `e-parallel-${i}-merge`, source: `parallel-${i}`, target: "merge" })
    }
    
    nodes.push({ id: "end", type: "end", position: { x: 250, y: 530 }, data: { label: "Ende" } })
    edges.push({ id: "e-merge-end", source: "merge", target: "end" })
    
    return { nodes, edges }
  }
  
  // Review-Loop: Coder ↔ Reviewer
  private generateReviewLoop(agents: string[], maxIterations: number): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
    const [coder, reviewer] = agents.length >= 2 ? agents : ["coder", "reviewer"]
    
    return {
      nodes: [
        { id: "start", type: "start", position: { x: 250, y: 50 }, data: { label: "Start" } },
        { id: "coder", type: "agent", position: { x: 250, y: 150 }, 
          data: { label: coder, agentId: coder, maxIterations } },
        { id: "reviewer", type: "agent", position: { x: 250, y: 280 }, 
          data: { label: reviewer, agentId: reviewer } },
        { id: "condition", type: "condition", position: { x: 250, y: 410 }, 
          data: { label: "Prüfung OK?", conditions: [
            { id: "has-issues", type: "has-issues", targetNodeId: "coder" },
            { id: "success", type: "success", targetNodeId: "end" }
          ] } },
        { id: "end", type: "end", position: { x: 250, y: 540 }, data: { label: "Ende" } }
      ],
      edges: [
        { id: "e1", source: "start", target: "coder" },
        { id: "e2", source: "coder", target: "reviewer" },
        { id: "e3", source: "reviewer", target: "condition" },
        { id: "e4", source: "condition", target: "coder", label: "Fehler" },
        { id: "e5", source: "condition", target: "end", label: "OK" }
      ]
    }
  }
  
  // Expert-Panel: Multiple Reviewers → Consensus
  private generateExpertPanel(agents: string[]): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
    const reviewers = agents.length > 0 ? agents : ["reviewer", "security-reviewer", "perf-reviewer"]
    
    const nodes: WorkflowNode[] = [
      { id: "start", type: "start", position: { x: 250, y: 50 }, data: { label: "Start" } },
      { id: "input", type: "agent", position: { x: 250, y: 150 }, 
        data: { label: "Eingabe vorbereiten", agentId: "researcher" } }
    ]
    const edges: WorkflowEdge[] = [
      { id: "e-start-input", source: "start", target: "input" }
    ]
    
    // Reviewer Panel
    const width = reviewers.length * 180
    const startX = 250 - width / 2 + 90
    
    for (let i = 0; i < reviewers.length; i++) {
      const nodeId = `expert-${i}`
      nodes.push({
        id: nodeId,
        type: "agent",
        position: { x: startX + i * 180, y: 280 },
        data: { label: reviewers[i], agentId: "reviewer" }
      })
      edges.push({ id: `e-input-${nodeId}`, source: "input", target: nodeId })
    }
    
    // Consensus
    nodes.push({ id: "consensus", type: "human-decision", position: { x: 250, y: 410 }, 
      data: { 
        label: "Konsens finden",
        question: "Experten-Bewertungen prüfen",
        options: [
          { id: "approve", label: "Alle OK", nextNodeId: "end" },
          { id: "revise", label: "Überarbeiten", nextNodeId: "input" }
        ]
      } })
    
    for (let i = 0; i < reviewers.length; i++) {
      edges.push({ id: `e-expert-${i}-consensus`, source: `expert-${i}`, target: "consensus" })
    }
    
    nodes.push({ id: "end", type: "end", position: { x: 250, y: 540 }, data: { label: "Ende" } })
    edges.push({ id: "e-consensus-end", source: "consensus", target: "end" })
    
    return { nodes, edges }
  }
  
  // Divide & Conquer
  private generateDivideConquer(agents: string[]): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
    const workers = agents.length > 0 ? agents : ["coder", "coder", "coder"]
    
    return {
      nodes: [
        { id: "start", type: "start", position: { x: 250, y: 50 }, data: { label: "Start" } },
        { id: "splitter", type: "agent", position: { x: 250, y: 150 }, 
          data: { label: "Aufgabe aufteilen", agentId: "architect" } },
        ...workers.map((w, i) => ({
          id: `worker-${i}`,
          type: "agent" as const,
          position: { x: 100 + i * 150, y: 280 },
          data: { label: `${w} ${i + 1}`, agentId: w }
        })),
        { id: "merger", type: "agent", position: { x: 250, y: 410 }, 
          data: { label: "Zusammenführen", agentId: "architect" } },
        { id: "end", type: "end", position: { x: 250, y: 540 }, data: { label: "Ende" } }
      ],
      edges: [
        { id: "e-start-splitter", source: "start", target: "splitter" },
        ...workers.map((_, i) => ({
          id: `e-splitter-worker-${i}`,
          source: "splitter",
          target: `worker-${i}`
        })),
        ...workers.map((_, i) => ({
          id: `e-worker-${i}-merger`,
          source: `worker-${i}`,
          target: "merger"
        })),
        { id: "e-merger-end", source: "merger", target: "end" }
      ]
    }
  }
  
  // Supervisor Pattern
  private generateSupervisor(agents: string[]): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
    const [supervisor, ...helpers] = agents.length > 1 ? agents : ["architect", "coder", "reviewer"]
    
    return {
      nodes: [
        { id: "start", type: "start", position: { x: 250, y: 50 }, data: { label: "Start" } },
        { id: "supervisor", type: "agent", position: { x: 250, y: 150 }, 
          data: { label: supervisor, agentId: supervisor } },
        { id: "decision", type: "human-decision", position: { x: 250, y: 280 }, 
          data: { 
            label: "Nächster Schritt?",
            question: "Welcher Agent soll arbeiten?",
            options: helpers.map((h, i) => ({
              id: `helper-${i}`,
              label: h,
              nextNodeId: `helper-${i}`
            }))
          } },
        ...helpers.map((h, i) => ({
          id: `helper-${i}`,
          type: "agent" as const,
          position: { x: 100 + i * 150, y: 410 },
          data: { label: h, agentId: h }
        })),
        { id: "review", type: "agent", position: { x: 250, y: 540 }, 
          data: { label: `${supervisor} Review`, agentId: supervisor } },
        { id: "end", type: "end", position: { x: 250, y: 670 }, data: { label: "Ende" } }
      ],
      edges: [
        { id: "e-start-supervisor", source: "start", target: "supervisor" },
        { id: "e-supervisor-decision", source: "supervisor", target: "decision" },
        ...helpers.map((_, i) => ({
          id: `e-decision-helper-${i}`,
          source: "decision",
          target: `helper-${i}`
        })),
        ...helpers.map((_, i) => ({
          id: `e-helper-${i}-review`,
          source: `helper-${i}`,
          target: "review"
        })),
        { id: "e-review-end", source: "review", target: "end" }
      ]
    }
  }
}

// === WORKFLOW STATE PERSISTENCE & RECOVERY ===

export interface PersistedWorkflowState {
  version: string
  workflowId: string
  workflow: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }
  executionState: WorkflowExecutionState
  context: Record<string, unknown>
  checkpoint: Date
  metadata: {
    name: string
    description?: string
    createdAt: Date
    lastModified: Date
    executionCount: number
  }
}

export class WorkflowStatePersistence {
  private storageKey: string = "workflow-states"
  
  // State speichern
  save(state: PersistedWorkflowState): void {
    const states = this.loadAll()
    const index = states.findIndex(s => s.workflowId === state.workflowId)
    
    if (index >= 0) {
      states[index] = state
    } else {
      states.push(state)
    }
    
    this.persist(states)
  }
  
  // State laden
  load(workflowId: string): PersistedWorkflowState | null {
    const states = this.loadAll()
    return states.find(s => s.workflowId === workflowId) || null
  }
  
  // Alle States laden
  loadAll(): PersistedWorkflowState[] {
    try {
      if (typeof localStorage !== "undefined") {
        const data = localStorage.getItem(this.storageKey)
        if (data) {
          return JSON.parse(data)
        }
      }
    } catch {}
    return []
  }
  
  // Persistieren
  private persist(states: PersistedWorkflowState[]): void {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(this.storageKey, JSON.stringify(states))
      }
    } catch {}
  }
  
  // State löschen
  delete(workflowId: string): boolean {
    const states = this.loadAll()
    const index = states.findIndex(s => s.workflowId === workflowId)
    
    if (index >= 0) {
      states.splice(index, 1)
      this.persist(states)
      return true
    }
    
    return false
  }
  
  // Checkpoint erstellen
  createCheckpoint(
    workflowId: string,
    workflow: { nodes: WorkflowNode[]; edges: WorkflowEdge[] },
    executionState: WorkflowExecutionState,
    context: Record<string, unknown> = {},
    metadata: Partial<PersistedWorkflowState["metadata"]> = {}
  ): PersistedWorkflowState {
    const existing = this.load(workflowId)
    
    const state: PersistedWorkflowState = {
      version: "1.0",
      workflowId,
      workflow,
      executionState,
      context,
      checkpoint: new Date(),
      metadata: {
        name: metadata.name || existing?.metadata.name || "Unbenannt",
        description: metadata.description || existing?.metadata.description,
        createdAt: existing?.metadata.createdAt || new Date(),
        lastModified: new Date(),
        executionCount: (existing?.metadata.executionCount || 0) + 1,
      }
    }
    
    this.save(state)
    return state
  }
  
  // Von Checkpoint wiederherstellen
  restore(workflowId: string): {
    workflow: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }
    executionState: WorkflowExecutionState
    context: Record<string, unknown>
  } | null {
    const state = this.load(workflowId)
    if (!state) return null
    
    return {
      workflow: state.workflow,
      executionState: {
        ...state.executionState,
        startedAt: state.executionState.startedAt 
          ? new Date(state.executionState.startedAt) 
          : undefined,
        completedAt: state.executionState.completedAt
          ? new Date(state.executionState.completedAt)
          : undefined,
      },
      context: state.context,
    }
  }
  
  // Auto-Recovery bei Crash
  getRecoverableWorkflows(): PersistedWorkflowState[] {
    return this.loadAll().filter(
      s => s.executionState.status === "running" || s.executionState.status === "paused"
    )
  }
  
  // Alte States aufräumen
  cleanup(maxAge: number = 30 * 24 * 60 * 60 * 1000): number {
    const states = this.loadAll()
    const cutoff = Date.now() - maxAge
    
    const filtered = states.filter(s => {
      const modified = new Date(s.metadata.lastModified).getTime()
      return modified > cutoff
    })
    
    const removed = states.length - filtered.length
    this.persist(filtered)
    
    return removed
  }
  
  // Export für Backup
  exportAll(): string {
    return JSON.stringify(this.loadAll(), null, 2)
  }
  
  // Import aus Backup
  importAll(json: string): number {
    try {
      const states = JSON.parse(json) as PersistedWorkflowState[]
      this.persist(states)
      return states.length
    } catch {
      return 0
    }
  }
}

// === WORKFLOW QUICK ACTIONS ===

export interface QuickAction {
  id: string
  label: string
  icon: string
  shortcut?: string
  action: (workflow: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }) => { 
    nodes: WorkflowNode[]
    edges: WorkflowEdge[] 
  }
}

export const WORKFLOW_QUICK_ACTIONS: QuickAction[] = [
  {
    id: "add-reviewer",
    label: "Reviewer hinzufügen",
    icon: "UserCheck",
    shortcut: "r",
    action: (workflow) => {
      const lastAgent = [...workflow.nodes]
        .filter(n => n.type === "agent")
        .sort((a, b) => (b.position?.y || 0) - (a.position?.y || 0))[0]
      
      if (!lastAgent) return workflow
      
      const newId = `reviewer-${Date.now()}`
      const newNode: WorkflowNode = {
        id: newId,
        type: "agent",
        position: { 
          x: lastAgent.position?.x || 250, 
          y: (lastAgent.position?.y || 300) + 130 
        },
        data: { label: "Reviewer", agentId: "reviewer" }
      }
      
      // Bestehende Edges vom letzten Agent zum neuen umleiten
      const edges = workflow.edges.map(e => {
        if (e.source === lastAgent.id) {
          return { ...e, source: newId }
        }
        return e
      })
      
      // Neue Edge vom letzten Agent zum Reviewer
      edges.push({
        id: `edge-${lastAgent.id}-${newId}`,
        source: lastAgent.id,
        target: newId
      })
      
      return {
        nodes: [...workflow.nodes, newNode],
        edges
      }
    }
  },
  {
    id: "add-condition",
    label: "Bedingung hinzufügen",
    icon: "GitBranch",
    shortcut: "c",
    action: (workflow) => {
      const lastNode = [...workflow.nodes]
        .filter(n => n.type !== "end")
        .sort((a, b) => (b.position?.y || 0) - (a.position?.y || 0))[0]
      
      if (!lastNode) return workflow
      
      const newId = `condition-${Date.now()}`
      return {
        nodes: [...workflow.nodes, {
          id: newId,
          type: "condition",
          position: {
            x: lastNode.position?.x || 250,
            y: (lastNode.position?.y || 300) + 130
          },
          data: { 
            label: "Prüfung",
            conditions: [
              { id: "success", type: "success", label: "Erfolgreich" },
              { id: "has-issues", type: "has-issues", label: "Hat Probleme" }
            ]
          }
        }],
        edges: [...workflow.edges, {
          id: `edge-${lastNode.id}-${newId}`,
          source: lastNode.id,
          target: newId
        }]
      }
    }
  },
  {
    id: "auto-layout",
    label: "Layout optimieren",
    icon: "Layout",
    shortcut: "l",
    action: (workflow) => {
      // Einfaches vertikales Layout
      const sorted = topologicalSort(workflow.nodes, workflow.edges)
      const nodes = workflow.nodes.map(node => {
        const index = sorted.indexOf(node.id)
        return {
          ...node,
          position: {
            x: 250,
            y: 50 + index * 130
          }
        }
      })
      
      return { nodes, edges: workflow.edges }
    }
  }
]

// Topologische Sortierung für Layout
function topologicalSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): string[] {
  const result: string[] = []
  const visited = new Set<string>()
  const temp = new Set<string>()
  
  const adjacency = new Map<string, string[]>()
  for (const node of nodes) {
    adjacency.set(node.id, [])
  }
  for (const edge of edges) {
    adjacency.get(edge.source)?.push(edge.target)
  }
  
  function visit(nodeId: string): void {
    if (visited.has(nodeId)) return
    if (temp.has(nodeId)) return // Zyklus
    
    temp.add(nodeId)
    
    for (const neighbor of adjacency.get(nodeId) || []) {
      visit(neighbor)
    }
    
    temp.delete(nodeId)
    visited.add(nodeId)
    result.unshift(nodeId)
  }
  
  // Start-Node zuerst
  const startNode = nodes.find(n => n.type === "start")
  if (startNode) visit(startNode.id)
  
  // Restliche Nodes
  for (const node of nodes) {
    visit(node.id)
  }
  
  return result
}

// === WORKFLOW LINTING & BEST PRACTICES ===

export interface LintRule {
  id: string
  name: string
  severity: "error" | "warning" | "info"
  category: "structure" | "performance" | "security" | "maintainability"
  check: (workflow: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }) => LintResult[]
}

export interface LintResult {
  ruleId: string
  severity: "error" | "warning" | "info"
  message: string
  nodeId?: string
  suggestion?: string
}

export const WORKFLOW_LINT_RULES: LintRule[] = [
  {
    id: "no-orphan-nodes",
    name: "Keine verwaisten Nodes",
    severity: "error",
    category: "structure",
    check: (workflow) => {
      const results: LintResult[] = []
      for (const node of workflow.nodes) {
        if (node.type === "start") continue
        const hasIncoming = workflow.edges.some(e => e.target === node.id)
        if (!hasIncoming) {
          results.push({
            ruleId: "no-orphan-nodes",
            severity: "error",
            message: `Node "${node.data.label}" ist nicht erreichbar`,
            nodeId: node.id,
            suggestion: "Verbinden Sie diesen Node mit dem Workflow oder entfernen Sie ihn"
          })
        }
      }
      return results
    }
  },
  {
    id: "no-dead-ends",
    name: "Keine Sackgassen",
    severity: "warning",
    category: "structure",
    check: (workflow) => {
      const results: LintResult[] = []
      for (const node of workflow.nodes) {
        if (node.type === "end") continue
        const hasOutgoing = workflow.edges.some(e => e.source === node.id)
        if (!hasOutgoing) {
          results.push({
            ruleId: "no-dead-ends",
            severity: "warning",
            message: `Node "${node.data.label}" hat keine ausgehende Verbindung`,
            nodeId: node.id,
            suggestion: "Verbinden Sie diesen Node mit einem nachfolgenden Node"
          })
        }
      }
      return results
    }
  },
  {
    id: "max-sequential-agents",
    name: "Maximale sequentielle Agents",
    severity: "warning",
    category: "performance",
    check: (workflow) => {
      const results: LintResult[] = []
      let maxSequence = 0
      let currentSequence = 0
      
      const visited = new Set<string>()
      const startNode = workflow.nodes.find(n => n.type === "start")
      if (!startNode) return results
      
      function traverse(nodeId: string, depth: number): void {
        if (visited.has(nodeId)) return
        visited.add(nodeId)
        
        const node = workflow.nodes.find(n => n.id === nodeId)
        if (node?.type === "agent") {
          currentSequence = depth
          maxSequence = Math.max(maxSequence, currentSequence)
        }
        
        const outgoing = workflow.edges.filter(e => e.source === nodeId)
        for (const edge of outgoing) {
          traverse(edge.target, node?.type === "agent" ? depth + 1 : depth)
        }
      }
      
      traverse(startNode.id, 0)
      
      if (maxSequence > 5) {
        results.push({
          ruleId: "max-sequential-agents",
          severity: "warning",
          message: `${maxSequence} Agents in Folge - könnte parallelisiert werden`,
          suggestion: "Prüfen Sie ob einige Agents parallel laufen könnten"
        })
      }
      
      return results
    }
  },
  {
    id: "reviewer-after-coder",
    name: "Review nach Coder",
    severity: "info",
    category: "maintainability",
    check: (workflow) => {
      const results: LintResult[] = []
      const coderNodes = workflow.nodes.filter(n => n.data.agentId === "coder")
      
      for (const coder of coderNodes) {
        const outgoing = workflow.edges.filter(e => e.source === coder.id)
        const hasReview = outgoing.some(edge => {
          const target = workflow.nodes.find(n => n.id === edge.target)
          return target?.data.agentId === "reviewer" || target?.type === "condition"
        })
        
        if (!hasReview) {
          results.push({
            ruleId: "reviewer-after-coder",
            severity: "info",
            message: `Kein Review nach "${coder.data.label}"`,
            nodeId: coder.id,
            suggestion: "Fügen Sie einen Reviewer oder eine Bedingung hinzu"
          })
        }
      }
      
      return results
    }
  },
  {
    id: "human-decision-timeout",
    name: "Human-Decision Timeout",
    severity: "warning",
    category: "security",
    check: (workflow) => {
      const results: LintResult[] = []
      const humanNodes = workflow.nodes.filter(n => n.type === "human-decision")
      
      for (const node of humanNodes) {
        if (!node.data.timeout) {
          results.push({
            ruleId: "human-decision-timeout",
            severity: "warning",
            message: `Human-Decision "${node.data.label}" hat kein Timeout`,
            nodeId: node.id,
            suggestion: "Setzen Sie ein Timeout um endloses Warten zu vermeiden"
          })
        }
      }
      
      return results
    }
  },
  {
    id: "descriptive-labels",
    name: "Beschreibende Labels",
    severity: "info",
    category: "maintainability",
    check: (workflow) => {
      const results: LintResult[] = []
      const genericLabels = ["agent", "node", "step", "task", "untitled"]
      
      for (const node of workflow.nodes) {
        const label = (node.data.label || "").toLowerCase()
        if (genericLabels.some(g => label === g || label.includes("node-"))) {
          results.push({
            ruleId: "descriptive-labels",
            severity: "info",
            message: `Node hat generischen Namen: "${node.data.label}"`,
            nodeId: node.id,
            suggestion: "Verwenden Sie einen beschreibenden Namen"
          })
        }
      }
      
      return results
    }
  }
]

export class WorkflowLinter {
  private rules: LintRule[] = WORKFLOW_LINT_RULES
  
  // Alle Regeln ausführen
  lint(workflow: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }): LintResult[] {
    const results: LintResult[] = []
    
    for (const rule of this.rules) {
      results.push(...rule.check(workflow))
    }
    
    return results.sort((a, b) => {
      const order = { error: 0, warning: 1, info: 2 }
      return order[a.severity] - order[b.severity]
    })
  }
  
  // Nur bestimmte Kategorien
  lintCategory(
    workflow: { nodes: WorkflowNode[]; edges: WorkflowEdge[] },
    category: LintRule["category"]
  ): LintResult[] {
    const rules = this.rules.filter(r => r.category === category)
    const results: LintResult[] = []
    
    for (const rule of rules) {
      results.push(...rule.check(workflow))
    }
    
    return results
  }
  
  // Zusammenfassung
  getSummary(results: LintResult[]): { errors: number; warnings: number; info: number } {
    return {
      errors: results.filter(r => r.severity === "error").length,
      warnings: results.filter(r => r.severity === "warning").length,
      info: results.filter(r => r.severity === "info").length,
    }
  }
  
  // Regel hinzufügen
  addRule(rule: LintRule): void {
    this.rules.push(rule)
  }
  
  // Regel entfernen
  removeRule(ruleId: string): void {
    this.rules = this.rules.filter(r => r.id !== ruleId)
  }
}

// === AGENT PERFORMANCE PROFILER ===

export interface PerformanceProfile {
  agentId: string
  executions: number
  totalDuration: number
  avgDuration: number
  minDuration: number
  maxDuration: number
  successRate: number
  errorRate: number
  tokensUsed: number
  costEstimate: number
}

export interface ExecutionTrace {
  id: string
  agentId: string
  startTime: Date
  endTime?: Date
  duration?: number
  success: boolean
  inputLength: number
  outputLength: number
  tokensEstimate: number
  error?: string
}

export class AgentPerformanceProfiler {
  private traces: ExecutionTrace[] = []
  private maxTraces: number = 1000
  
  // Execution starten
  startTrace(agentId: string, input: string): string {
    const id = `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    this.traces.push({
      id,
      agentId,
      startTime: new Date(),
      success: false,
      inputLength: input.length,
      outputLength: 0,
      tokensEstimate: Math.ceil(input.length / 4),
    })
    
    this.enforceLimit()
    return id
  }
  
  private enforceLimit(): void {
    if (this.traces.length > this.maxTraces) {
      this.traces = this.traces.slice(-this.maxTraces)
    }
  }
  
  // Execution beenden
  endTrace(traceId: string, output: string, success: boolean, error?: string): void {
    const trace = this.traces.find(t => t.id === traceId)
    if (!trace) return
    
    trace.endTime = new Date()
    trace.duration = trace.endTime.getTime() - trace.startTime.getTime()
    trace.success = success
    trace.outputLength = output.length
    trace.tokensEstimate += Math.ceil(output.length / 4)
    trace.error = error
  }
  
  // Profil für Agent erstellen
  getProfile(agentId: string): PerformanceProfile {
    const agentTraces = this.traces.filter(t => t.agentId === agentId && t.duration)
    
    if (agentTraces.length === 0) {
      return {
        agentId,
        executions: 0,
        totalDuration: 0,
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        successRate: 0,
        errorRate: 0,
        tokensUsed: 0,
        costEstimate: 0,
      }
    }
    
    const durations = agentTraces.map(t => t.duration!)
    const totalDuration = durations.reduce((sum, d) => sum + d, 0)
    const totalTokens = agentTraces.reduce((sum, t) => sum + t.tokensEstimate, 0)
    const successCount = agentTraces.filter(t => t.success).length
    
    return {
      agentId,
      executions: agentTraces.length,
      totalDuration,
      avgDuration: Math.round(totalDuration / agentTraces.length),
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      successRate: successCount / agentTraces.length,
      errorRate: (agentTraces.length - successCount) / agentTraces.length,
      tokensUsed: totalTokens,
      costEstimate: totalTokens * 0.00001, // Geschätzter Preis pro Token
    }
  }
  
  // Alle Profile
  getAllProfiles(): PerformanceProfile[] {
    const agentIds = [...new Set(this.traces.map(t => t.agentId))]
    return agentIds.map(id => this.getProfile(id))
  }
  
  // Langsamste Agents
  getSlowestAgents(limit: number = 5): PerformanceProfile[] {
    return this.getAllProfiles()
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, limit)
  }
  
  // Fehleranfälligste Agents
  getMostErrorProne(limit: number = 5): PerformanceProfile[] {
    return this.getAllProfiles()
      .filter(p => p.executions > 0)
      .sort((a, b) => b.errorRate - a.errorRate)
      .slice(0, limit)
  }
  
  // Gesamt-Statistik
  getTotalStats(): {
    totalExecutions: number
    totalDuration: number
    avgDuration: number
    totalTokens: number
    totalCost: number
  } {
    const profiles = this.getAllProfiles()
    const totalExecutions = profiles.reduce((sum, p) => sum + p.executions, 0)
    const totalDuration = profiles.reduce((sum, p) => sum + p.totalDuration, 0)
    const totalTokens = profiles.reduce((sum, p) => sum + p.tokensUsed, 0)
    
    return {
      totalExecutions,
      totalDuration,
      avgDuration: totalExecutions > 0 ? Math.round(totalDuration / totalExecutions) : 0,
      totalTokens,
      totalCost: totalTokens * 0.00001,
    }
  }
  
  // Traces exportieren
  exportTraces(): ExecutionTrace[] {
    return [...this.traces]
  }
  
  // Reset
  reset(): void {
    this.traces = []
  }
}

// === WORKFLOW EXPORT FORMATS ===

export type ExportFormat = "json" | "yaml" | "mermaid" | "markdown" | "dot"

export class WorkflowExporter {
  // Export in verschiedene Formate
  export(
    workflow: { nodes: WorkflowNode[]; edges: WorkflowEdge[] },
    format: ExportFormat,
    options: { name?: string; description?: string } = {}
  ): string {
    switch (format) {
      case "json":
        return this.toJSON(workflow, options)
      case "yaml":
        return this.toYAML(workflow, options)
      case "mermaid":
        return this.toMermaid(workflow, options)
      case "markdown":
        return this.toMarkdown(workflow, options)
      case "dot":
        return this.toDOT(workflow, options)
      default:
        return this.toJSON(workflow, options)
    }
  }
  
  // JSON Export
  private toJSON(
    workflow: { nodes: WorkflowNode[]; edges: WorkflowEdge[] },
    options: { name?: string; description?: string }
  ): string {
    return JSON.stringify({
      name: options.name || "Workflow",
      description: options.description,
      version: "1.0",
      exportedAt: new Date().toISOString(),
      nodes: workflow.nodes,
      edges: workflow.edges,
    }, null, 2)
  }
  
  // YAML Export (vereinfacht)
  private toYAML(
    workflow: { nodes: WorkflowNode[]; edges: WorkflowEdge[] },
    options: { name?: string; description?: string }
  ): string {
    const lines: string[] = [
      `name: ${options.name || "Workflow"}`,
      options.description ? `description: ${options.description}` : "",
      `version: "1.0"`,
      `exportedAt: ${new Date().toISOString()}`,
      "",
      "nodes:",
    ]
    
    for (const node of workflow.nodes) {
      lines.push(`  - id: ${node.id}`)
      lines.push(`    type: ${node.type}`)
      lines.push(`    label: "${node.data.label || ""}"`)
      if (node.data.agentId) {
        lines.push(`    agentId: ${node.data.agentId}`)
      }
      if (node.position) {
        lines.push(`    position:`)
        lines.push(`      x: ${node.position.x}`)
        lines.push(`      y: ${node.position.y}`)
      }
    }
    
    lines.push("")
    lines.push("edges:")
    
    for (const edge of workflow.edges) {
      lines.push(`  - id: ${edge.id}`)
      lines.push(`    source: ${edge.source}`)
      lines.push(`    target: ${edge.target}`)
      if (edge.label) {
        lines.push(`    label: "${edge.label}"`)
      }
    }
    
    return lines.filter(l => l !== "").join("\n")
  }
  
  // Mermaid Diagram
  private toMermaid(
    workflow: { nodes: WorkflowNode[]; edges: WorkflowEdge[] },
    options: { name?: string }
  ): string {
    const lines: string[] = [
      "```mermaid",
      "flowchart TD",
      options.name ? `    subgraph ${options.name.replace(/\s+/g, "_")}` : "",
    ]
    
    // Node Definitionen
    for (const node of workflow.nodes) {
      const label = node.data.label || node.id
      let shape: string
      
      switch (node.type) {
        case "start":
          shape = `((${label}))`
          break
        case "end":
          shape = `(((${label})))`
          break
        case "condition":
          shape = `{${label}}`
          break
        case "human-decision":
          shape = `[/${label}\\]`
          break
        default:
          shape = `[${label}]`
      }
      
      lines.push(`    ${node.id}${shape}`)
    }
    
    // Edge Definitionen
    for (const edge of workflow.edges) {
      const arrow = edge.label ? `-->|${edge.label}|` : "-->"
      lines.push(`    ${edge.source} ${arrow} ${edge.target}`)
    }
    
    if (options.name) {
      lines.push("    end")
    }
    
    lines.push("```")
    
    return lines.join("\n")
  }
  
  // Markdown Dokumentation
  private toMarkdown(
    workflow: { nodes: WorkflowNode[]; edges: WorkflowEdge[] },
    options: { name?: string; description?: string }
  ): string {
    const lines: string[] = [
      `# ${options.name || "Workflow Dokumentation"}`,
      "",
      options.description ? `${options.description}` : "",
      "",
      "## Übersicht",
      "",
      `- **Nodes:** ${workflow.nodes.length}`,
      `- **Verbindungen:** ${workflow.edges.length}`,
      `- **Agents:** ${workflow.nodes.filter(n => n.type === "agent").length}`,
      "",
      "## Workflow-Schritte",
      "",
    ]
    
    // Sortierte Nodes
    const sorted = topologicalSort(workflow.nodes, workflow.edges)
    let stepNum = 1
    
    for (const nodeId of sorted) {
      const node = workflow.nodes.find(n => n.id === nodeId)
      if (!node) continue
      
      const typeEmoji: Record<string, string> = {
        start: "🚀",
        end: "🏁",
        agent: "🤖",
        condition: "🔀",
        "human-decision": "👤",
      }
      
      lines.push(`### ${stepNum}. ${typeEmoji[node.type] || "📦"} ${node.data.label || node.id}`)
      lines.push("")
      lines.push(`- **Typ:** ${node.type}`)
      if (node.data.agentId) {
        lines.push(`- **Agent:** ${node.data.agentId}`)
      }
      if (node.data.description) {
        lines.push(`- **Beschreibung:** ${node.data.description}`)
      }
      
      // Ausgehende Verbindungen
      const outgoing = workflow.edges.filter(e => e.source === node.id)
      if (outgoing.length > 0) {
        lines.push(`- **Nächste Schritte:**`)
        for (const edge of outgoing) {
          const target = workflow.nodes.find(n => n.id === edge.target)
          lines.push(`  - ${edge.label ? `(${edge.label})` : "→"} ${target?.data.label || edge.target}`)
        }
      }
      
      lines.push("")
      stepNum++
    }
    
    // Mermaid Diagramm anhängen
    lines.push("## Diagramm")
    lines.push("")
    lines.push(this.toMermaid(workflow, options))
    
    return lines.join("\n")
  }
  
  // DOT (Graphviz) Format
  private toDOT(
    workflow: { nodes: WorkflowNode[]; edges: WorkflowEdge[] },
    options: { name?: string }
  ): string {
    const lines: string[] = [
      `digraph ${(options.name || "Workflow").replace(/\s+/g, "_")} {`,
      "  rankdir=TB;",
      "  node [fontname=\"Arial\"];",
      "",
    ]
    
    // Node Styles
    for (const node of workflow.nodes) {
      const label = node.data.label || node.id
      let attrs: string[] = [`label="${label}"`]
      
      switch (node.type) {
        case "start":
          attrs.push("shape=circle", "style=filled", "fillcolor=green")
          break
        case "end":
          attrs.push("shape=doublecircle", "style=filled", "fillcolor=red")
          break
        case "condition":
          attrs.push("shape=diamond", "style=filled", "fillcolor=yellow")
          break
        case "human-decision":
          attrs.push("shape=parallelogram", "style=filled", "fillcolor=orange")
          break
        case "agent":
          attrs.push("shape=box", "style=filled", "fillcolor=lightblue")
          break
        default:
          attrs.push("shape=box")
      }
      
      lines.push(`  ${node.id} [${attrs.join(", ")}];`)
    }
    
    lines.push("")
    
    // Edges
    for (const edge of workflow.edges) {
      const label = edge.label ? ` [label="${edge.label}"]` : ""
      lines.push(`  ${edge.source} -> ${edge.target}${label};`)
    }
    
    lines.push("}")
    
    return lines.join("\n")
  }
}

// === WORKFLOW IMPORT ===

export class WorkflowImporter {
  // Import aus JSON
  fromJSON(json: string): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } | null {
    try {
      const data = JSON.parse(json)
      
      if (data.nodes && data.edges) {
        return {
          nodes: data.nodes,
          edges: data.edges,
        }
      }
      
      return null
    } catch {
      return null
    }
  }
  
  // Import aus YAML (vereinfacht)
  fromYAML(yaml: string): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } | null {
    try {
      const lines = yaml.split("\n")
      const nodes: WorkflowNode[] = []
      const edges: WorkflowEdge[] = []
      
      let section: "nodes" | "edges" | null = null
      let currentItem: Record<string, unknown> = {}
      
      for (const line of lines) {
        const trimmed = line.trim()
        
        if (trimmed === "nodes:") {
          section = "nodes"
          continue
        }
        if (trimmed === "edges:") {
          section = "edges"
          continue
        }
        
        if (trimmed.startsWith("- ")) {
          // Neues Item
          if (Object.keys(currentItem).length > 0) {
            if (section === "nodes") {
              nodes.push(currentItem as unknown as WorkflowNode)
            } else if (section === "edges") {
              edges.push(currentItem as unknown as WorkflowEdge)
            }
          }
          currentItem = {}
          const match = trimmed.match(/^-\s+(\w+):\s*(.+)$/)
          if (match) {
            currentItem[match[1]] = match[2].replace(/^["']|["']$/g, "")
          }
        } else if (trimmed.includes(":")) {
          const match = trimmed.match(/^(\w+):\s*(.+)$/)
          if (match) {
            currentItem[match[1]] = match[2].replace(/^["']|["']$/g, "")
          }
        }
      }
      
      // Letztes Item
      if (Object.keys(currentItem).length > 0) {
        if (section === "nodes") {
          nodes.push(currentItem as unknown as WorkflowNode)
        } else if (section === "edges") {
          edges.push(currentItem as unknown as WorkflowEdge)
        }
      }
      
      return { nodes, edges }
    } catch {
      return null
    }
  }
}
