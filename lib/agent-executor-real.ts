"use client"

import { useCallback } from "react"
import { useAgentStore, getEnvironmentPrompt } from "./agent-store"
import { sendChatRequest, getProviderFromModel } from "./api-client"
import type { AgentType, Message, WorkflowStep, ProjectFile, AgentSuggestion } from "./types"
import { marketplaceAgents } from "./marketplace-agents"
import { getMcpServerById } from "./mcp-servers"

// RAG-Kontext für Agenten abrufen
async function fetchRagContext(query: string, apiKey: string): Promise<string> {
  if (!apiKey) return ""
  
  try {
    const response = await fetch("/api/rag/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        apiKey,
        buildContext: true,
        maxTokens: 2000,
      }),
    })
    
    if (!response.ok) return ""
    
    const data = await response.json()
    return data.context || ""
  } catch (error) {
    console.warn("[RAG] Fehler beim Abrufen des Kontexts:", error)
    return ""
  }
}

interface ParsedCodeFile {
  path: string
  content: string
  language: string
}

interface ParsedSuggestion {
  type: AgentSuggestion["type"]
  title: string
  description: string
  priority: AgentSuggestion["priority"]
  filePath: string
  newContent: string
}

// Erstellt eine menschenlesbare Zusammenfassung der Agent-Ausgabe
function createHumanReadableSummary(
  agentType: AgentType,
  content: string,
  files: ParsedCodeFile[],
  duration: string
): string {
  const agentNames: Record<string, string> = {
    planner: "Planner",
    coder: "Coder",
    reviewer: "Reviewer",
    security: "Security-Prüfer",
    executor: "Executor",
  }
  
  const agentName = agentNames[agentType] || agentType

  // Planner Agent
  if (agentType === "planner") {
    const steps = (content.match(/^\d+\./gm) || []).length
    const hasArchitecture = content.toLowerCase().includes("architektur") || content.toLowerCase().includes("struktur")
    const hasTech = content.toLowerCase().includes("technolog") || content.toLowerCase().includes("react") || content.toLowerCase().includes("next")
    
    let summary = `✅ **${agentName} abgeschlossen** (${duration}s)\n\n`
    summary += `📋 **Was wurde geplant:**\n`
    if (steps > 0) summary += `- ${steps} Entwicklungsschritte definiert\n`
    if (hasArchitecture) summary += `- Projektarchitektur festgelegt\n`
    if (hasTech) summary += `- Technologie-Stack ausgewählt\n`
    summary += `- Anforderungen analysiert und strukturiert`
    
    return summary
  }

  // Coder Agent
  if (agentType === "coder") {
    if (files.length === 0) {
      return `✅ **${agentName} abgeschlossen** (${duration}s)\n\n📝 Code-Analyse durchgeführt, keine neuen Dateien erstellt.`
    }
    
    const fileTypes = new Set(files.map(f => f.language))
    const components = files.filter(f => f.path.includes("component") || f.content.includes("export default function") || f.content.includes("export function"))
    
    let summary = `✅ **${agentName} abgeschlossen** (${duration}s)\n\n`
    summary += `📁 **Erstellte Dateien:** ${files.length}\n`
    files.forEach(f => {
      const fileName = f.path.split("/").pop()
      summary += `- \`${fileName}\`\n`
    })
    
    if (components.length > 0) {
      summary += `\n🧩 **Komponenten:** ${components.length} React-Komponenten erstellt`
    }
    
    return summary
  }

  // Reviewer Agent
  if (agentType === "reviewer") {
    const hasIssues = content.toLowerCase().includes("problem") || content.toLowerCase().includes("fehler") || content.toLowerCase().includes("issue")
    const hasSuggestions = content.toLowerCase().includes("vorschlag") || content.toLowerCase().includes("empfehl") || content.toLowerCase().includes("verbess")
    const isApproved = content.toLowerCase().includes("gut") || content.toLowerCase().includes("korrekt") || content.toLowerCase().includes("✓") || content.toLowerCase().includes("approved")
    
    let summary = `✅ **${agentName} abgeschlossen** (${duration}s)\n\n`
    summary += `🔍 **Code-Review Ergebnis:**\n`
    
    if (isApproved && !hasIssues) {
      summary += `- ✓ Code-Qualität: Gut\n`
      summary += `- ✓ Keine kritischen Probleme gefunden`
    } else if (hasIssues) {
      summary += `- ⚠️ Verbesserungspotential identifiziert\n`
    }
    
    if (hasSuggestions) {
      summary += `\n- 💡 Optimierungsvorschläge erstellt`
    }
    
    return summary
  }

  // Security Agent
  if (agentType === "security") {
    const hasVulnerabilities = content.toLowerCase().includes("vulnerab") || content.toLowerCase().includes("sicherheitslücke") || content.toLowerCase().includes("risiko")
    const isSecure = content.toLowerCase().includes("sicher") || content.toLowerCase().includes("keine probleme") || content.toLowerCase().includes("✓")
    
    let summary = `✅ **${agentName} abgeschlossen** (${duration}s)\n\n`
    summary += `🔒 **Sicherheitsanalyse:**\n`
    
    if (isSecure && !hasVulnerabilities) {
      summary += `- ✓ Keine Sicherheitslücken gefunden\n`
      summary += `- ✓ Best Practices eingehalten`
    } else if (hasVulnerabilities) {
      summary += `- ⚠️ Sicherheitshinweise erstellt\n`
      summary += `- Empfehlungen im Detail-Log verfügbar`
    }
    
    return summary
  }

  // Executor Agent
  if (agentType === "executor") {
    let summary = `✅ **${agentName} abgeschlossen** (${duration}s)\n\n`
    summary += `🚀 **Ausführung:**\n`
    summary += `- Projekt ist bereit zur Vorschau\n`
    summary += `- Wechsle zum "Sandbox"-Tab für Live-Preview`
    
    return summary
  }

  // Fallback für unbekannte Agenten
  return `✅ **${agentName} abgeschlossen** (${duration}s)`
}

function parseSuggestionsFromResponse(content: string, agent: string, existingFiles: ProjectFile[]): Omit<AgentSuggestion, "id" | "createdAt" | "status">[] {
  const suggestions: Omit<AgentSuggestion, "id" | "createdAt" | "status">[] = []
  
  console.log(`[parseSuggestions] Parsing response from ${agent}, length: ${content.length}`)
  
  // Methode 1: Versuche JSON aus der Antwort zu extrahieren
  const jsonMatch = content.match(/\{[\s\S]*"suggestedFixes"[\s\S]*\}/m)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      console.log(`[parseSuggestions] Found JSON with suggestedFixes:`, parsed.suggestedFixes?.length || 0)
      if (parsed.suggestedFixes && Array.isArray(parsed.suggestedFixes)) {
        for (const fix of parsed.suggestedFixes) {
          if (fix.filePath && fix.newContent) {
            const existingFile = existingFiles.find(f => f.path === fix.filePath)
            suggestions.push({
              agent,
              type: fix.type || "improvement",
              title: fix.title || "Verbesserungsvorschlag",
              description: fix.description || "",
              affectedFiles: [fix.filePath],
              suggestedChanges: [{
                filePath: fix.filePath,
                originalContent: existingFile?.content || "",
                newContent: fix.newContent,
              }],
              priority: fix.priority || "medium",
            })
          }
        }
      }
    } catch (e) {
      console.log(`[parseSuggestions] JSON parsing failed:`, e)
    }
  }
  
  // Methode 2: Parse "issues" Array aus dem JSON (alternatives Format)
  if (suggestions.length === 0) {
    const issuesMatch = content.match(/\{[\s\S]*"issues"[\s\S]*\}/m)
    if (issuesMatch) {
      try {
        const parsed = JSON.parse(issuesMatch[0])
        console.log(`[parseSuggestions] Found JSON with issues:`, parsed.issues?.length || 0)
        if (parsed.issues && Array.isArray(parsed.issues)) {
          for (const issue of parsed.issues) {
            if (issue.file && issue.suggestion) {
              suggestions.push({
                agent,
                type: issue.severity === "critical" ? "fix" : "improvement",
                title: issue.message || "Code-Issue",
                description: issue.suggestion,
                affectedFiles: [issue.file],
                suggestedChanges: [],
                priority: issue.severity === "critical" ? "high" : issue.severity === "warning" ? "medium" : "low",
              })
            }
          }
        }
      } catch (e) {
        console.log(`[parseSuggestions] Issues JSON parsing failed:`, e)
      }
    }
  }
  
  // Methode 3: Parse natürlichsprachliche Vorschläge (Fallback)
  if (suggestions.length === 0) {
    // Suche nach Mustern wie "Problem:", "Issue:", "Verbesserung:", etc.
    const patterns = [
      /(?:Problem|Issue|Fehler|Error):\s*(.+?)(?:\n|$)/gi,
      /(?:Verbesserung|Improvement|Empfehlung|Recommendation):\s*(.+?)(?:\n|$)/gi,
      /(?:⚠️|❌|🔴)\s*(.+?)(?:\n|$)/gi,
    ]
    
    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(content)) !== null) {
        const title = match[1].trim().substring(0, 100)
        if (title.length > 10) {
          suggestions.push({
            agent,
            type: "improvement",
            title: title,
            description: "",
            affectedFiles: [],
            suggestedChanges: [],
            priority: "medium",
          })
        }
      }
    }
    console.log(`[parseSuggestions] Found ${suggestions.length} natural language suggestions`)
  }
  
  console.log(`[parseSuggestions] Total suggestions found: ${suggestions.length}`)
  return suggestions
}

function parseCodeFromResponse(content: string): ParsedCodeFile[] {
  const files: ParsedCodeFile[] = []
  
  // Mehrere Patterns für Code-Blöcke
  // Pattern 1: ```language\n// filepath: path\ncode```
  // Pattern 2: ```language\ncode``` mit filepath im Code
  // Pattern 3: **filename** gefolgt von Code-Block
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/gi
  
  let match
  while ((match = codeBlockRegex.exec(content)) !== null) {
    let language = match[1] || "typescript"
    let code = match[2]?.trim()
    let path: string | undefined
    
    if (!code) continue
    
    // Versuche Pfad aus verschiedenen Formaten zu extrahieren
    // Format 1: // filepath: path/to/file.tsx oder // src/App.js
    const filepathMatch = code.match(/^(?:\/\/|#|\/\*)\s*(?:filepath|file|path|filename)?:?\s*((?:src\/|app\/|components\/)?[\w\-./]+\.(?:tsx?|jsx?|css|json|html))(?:\s*\*\/)?$/m)
    if (filepathMatch) {
      path = filepathMatch[1].trim()
      // Entferne die filepath-Zeile aus dem Code
      code = code.replace(/^(?:\/\/|#|\/\*)\s*(?:filepath|file|path|filename)?:?\s*(?:src\/|app\/|components\/)?[\w\-./]+\.(?:tsx?|jsx?|css|json|html)(?:\s*\*\/)?[\r\n]*/m, "").trim()
    }
    
    // Format 2: Schaue vor dem Code-Block nach **filename** oder `filename`
    if (!path) {
      const beforeBlock = content.substring(0, match.index)
      const fileNameMatch = beforeBlock.match(/(?:\*\*|`)([^*`\n]+\.(?:tsx?|jsx?|json|css|html|md))(?:\*\*|`)\s*$/i)
      if (fileNameMatch) {
        path = fileNameMatch[1].trim()
      }
    }
    
    // Format 3: Erkenne Dateityp aus dem Inhalt
    if (!path) {
      if (code.startsWith("{") && (code.includes('"name"') || code.includes('"dependencies"'))) {
        path = "package.json"
        language = "json"
      } else if (code.includes('"compilerOptions"')) {
        path = "tsconfig.json"
        language = "json"
      } else if (code.includes("@tailwind") || code.includes("@import")) {
        path = "app/globals.css"
        language = "css"
      } else if (code.includes("module.exports") && code.includes("content:")) {
        path = "tailwind.config.js"
        language = "javascript"
      } else if (code.includes("export default function App")) {
        // WICHTIG: App-Komponente immer als App.tsx speichern (für Sandpack)
        path = "App.tsx"
      } else if (code.includes("export default function RootLayout") || code.includes("export default function Layout")) {
        path = "app/layout.tsx"
      } else if (code.includes("export default function Home") || code.includes("export default function Page")) {
        path = "app/page.tsx"
      } else if (code.includes("export default function") || code.includes("export function")) {
        const funcMatch = code.match(/export\s+(?:default\s+)?function\s+(\w+)/)
        if (funcMatch) {
          const name = funcMatch[1]
          // Prüfe ob es App ist (für Sandpack)
          if (name === "App") {
            path = "App.tsx"
          } else if (name.toLowerCase().includes("page")) {
            path = `app/${name.toLowerCase().replace("page", "")}/page.tsx`
          } else {
            path = `components/${name.charAt(0).toLowerCase() + name.slice(1)}.tsx`
          }
        }
      }
      
      if (!path) {
        const ext = language === "css" ? "css" : language === "json" ? "json" : language === "javascript" ? "js" : "tsx"
        path = `generated/file-${files.length + 1}.${ext}`
      }
    }
    
    // Normalisiere Pfad
    path = path.replace(/^\/+/, "") // Entferne führende Slashes
    
    // Bestimme Sprache aus Dateiendung wenn nicht gesetzt
    if (path.endsWith(".css")) language = "css"
    else if (path.endsWith(".json")) language = "json"
    else if (path.endsWith(".js")) language = "javascript"
    else if (path.endsWith(".tsx") || path.endsWith(".ts")) language = "typescript"
    
    files.push({
      path,
      content: code,
      language,
    })
  }
  
  return files
}

export function useAgentExecutor() {
  const {
    agentConfigs,
    globalConfig,
    addMessage,
    addFile,
    addLog,
    setWorkflowSteps,
    updateWorkflowStep,
    setIsProcessing,
    setCurrentAgent,
    setError,
    currentProject,
    getFiles,
    clearFiles,
    clearLogs,
    updateFileByPath,
    workflowOrder,
    customAgentConfigs,
    addSuggestion,
  } = useAgentStore()

  const executeAgent = useCallback(
    async (
      agentType: AgentType,
      userRequest: string,
      previousOutput?: string
    ): Promise<{ content: string; files: ParsedCodeFile[] }> => {
      // Hole Config aus agentConfigs oder Marketplace
      const coreConfig = agentConfigs[agentType]
      const marketplaceAgent = marketplaceAgents.find(a => a.id === agentType)
      const customConfig = customAgentConfigs[agentType]
      
      // Erstelle eine einheitliche Config (Custom-Config überschreibt Marketplace-Defaults)
      const config = coreConfig || (marketplaceAgent ? {
        name: marketplaceAgent.name,
        systemPrompt: customConfig?.systemPrompt || marketplaceAgent.systemPrompt || `Du bist der ${marketplaceAgent.name}. ${marketplaceAgent.description}`,
        model: customConfig?.model || marketplaceAgent.defaultModel || "gpt-4o",
        temperature: customConfig?.temperature ?? marketplaceAgent.defaultTemperature ?? 0.7,
        maxTokens: customConfig?.maxTokens || marketplaceAgent.defaultMaxTokens || 4000,
        enabled: customConfig?.enabled ?? true,
        tools: marketplaceAgent.tools || [],
      } : null)
      
      if (!config) {
        throw new Error(`Agent "${agentType}" nicht gefunden`)
      }
      
      // Validiere Config
      if (!config.systemPrompt) {
        console.warn(`Agent "${agentType}" hat keinen systemPrompt, verwende Fallback`)
        config.systemPrompt = `Du bist ein hilfreicher KI-Assistent namens ${config.name}.`
      }
      
      // Für Planner und Coder: Verwende umgebungsspezifischen Prompt
      const targetEnv = globalConfig.targetEnvironment || "sandpack"
      if (agentType === "planner" || agentType === "coder") {
        config.systemPrompt = getEnvironmentPrompt(agentType, targetEnv)
        console.log(`[Agent Executor] Verwende ${targetEnv}-Prompt für ${agentType}`)
      }
      
      // Debug: Zeige Config
      console.log(`[Agent Executor] Config für ${agentType}:`, {
        name: config.name,
        model: config.model,
        hasSystemPrompt: !!config.systemPrompt,
        systemPromptLength: config.systemPrompt?.length,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      })
      
      // Bestimme den API-Key basierend auf dem Model
      const provider = getProviderFromModel(config.model)
      let apiKey: string
      let providerName: string
      
      if (provider === "openrouter") {
        apiKey = globalConfig.openrouterApiKey
        providerName = "OpenRouter"
      } else if (provider === "anthropic") {
        apiKey = globalConfig.anthropicApiKey
        providerName = "Anthropic"
      } else {
        apiKey = globalConfig.openaiApiKey
        providerName = "OpenAI"
      }

      console.log(`[Agent Executor] Provider: ${provider}, hasApiKey: ${!!apiKey}`)

      if (!apiKey) {
        throw new Error(
          `Kein API-Key für ${providerName} konfiguriert. ` +
          `Bitte in den Einstellungen (Sidebar) hinterlegen.`
        )
      }

      // Baue die Nachrichten für den Agent
      const existingFiles = getFiles()
      
      // Bei Iterationen: Zeige Dateiinhalt, aber limitiere Größe
      const MAX_CONTEXT_CHARS = 50000 // ~12k Tokens
      let filesContext = ""
      
      if (existingFiles.length > 0) {
        let totalChars = 0
        const fileContexts: string[] = []
        
        for (const f of existingFiles) {
          const fileContext = `### ${f.path}\n\`\`\`${f.language || 'typescript'}\n${f.content}\n\`\`\``
          if (totalChars + fileContext.length < MAX_CONTEXT_CHARS) {
            fileContexts.push(fileContext)
            totalChars += fileContext.length
          } else {
            // Nur Dateinamen für restliche Dateien
            fileContexts.push(`### ${f.path} (Inhalt gekürzt - ${f.content.length} Zeichen)`)
          }
        }
        
        filesContext = `\n\n## BESTEHENDE DATEIEN IM PROJEKT (${existingFiles.length} Dateien):\n${fileContexts.join("\n\n")}\n\nWICHTIG: Bei Änderungen an bestehenden Dateien, gib den VOLLSTÄNDIGEN aktualisierten Code aus.`
      }

      const projectContext = currentProject
        ? `\n\nProjekt: ${currentProject.name}\nBeschreibung: ${currentProject.description}`
        : ""

      const previousContext = previousOutput
        ? `\n\nOutput des vorherigen Agenten:\n${previousOutput}`
        : ""

      // MCP Server Kontext
      const mcpServerIds = customConfig?.mcpServers || (coreConfig as any)?.mcpServers || []
      const mcpContext = mcpServerIds.length > 0
        ? `\n\nVerfügbare MCP Server:\n${mcpServerIds.map((id: string) => {
            const server = getMcpServerById(id)
            if (!server) return null
            return `- ${server.name}: ${server.description} (Capabilities: ${server.capabilities.join(", ")})`
          }).filter(Boolean).join("\n")}`
        : ""

      // RAG-Kontext aus der Knowledge Base abrufen
      let ragContext = ""
      if (globalConfig.openaiApiKey) {
        try {
          ragContext = await fetchRagContext(userRequest, globalConfig.openaiApiKey)
          if (ragContext) {
            addLog({
              level: "info",
              agent: agentType,
              message: "RAG-Kontext aus Knowledge Base geladen",
            })
          }
        } catch (error) {
          console.warn("[RAG] Kontext konnte nicht geladen werden:", error)
        }
      }

      // Tools-Kontext basierend auf aktivierten Tools
      const enabledTools = config.tools?.filter((t: { enabled: boolean }) => t.enabled) || []
      let toolsContext = ""
      
      if (enabledTools.length > 0) {
        const toolDescriptions: string[] = []
        
        for (const tool of enabledTools) {
          const toolId = (tool as { id: string }).id
          const toolName = (tool as { name: string }).name
          
          // Tool-spezifische Kontexte
          switch (toolId) {
            case "codebase_search":
            case "code_search":
              toolDescriptions.push(`- **${toolName}**: Du kannst den bestehenden Code analysieren und Patterns finden.`)
              break
            case "file_reader":
              toolDescriptions.push(`- **${toolName}**: Du hast Zugriff auf alle Projektdateien (siehe BESTEHENDE DATEIEN).`)
              break
            case "file_writer":
              toolDescriptions.push(`- **${toolName}**: Du kannst Dateien erstellen und modifizieren. Gib Code in \`\`\`typescript // filepath: Dateiname.tsx\`\`\` Blöcken aus.`)
              break
            case "dependency_analyzer":
              // Analysiere package.json wenn vorhanden
              const packageJson = existingFiles.find(f => f.path.includes("package.json"))
              if (packageJson) {
                try {
                  const pkg = JSON.parse(packageJson.content)
                  const deps = Object.keys(pkg.dependencies || {}).join(", ")
                  const devDeps = Object.keys(pkg.devDependencies || {}).join(", ")
                  toolDescriptions.push(`- **${toolName}**: Dependencies: ${deps || "keine"} | DevDeps: ${devDeps || "keine"}`)
                } catch {
                  toolDescriptions.push(`- **${toolName}**: package.json vorhanden aber nicht parsebar.`)
                }
              } else {
                toolDescriptions.push(`- **${toolName}**: Keine package.json gefunden.`)
              }
              break
            case "structure_analyzer":
              // Zeige Projektstruktur
              const filePaths = existingFiles.map(f => f.path).sort()
              if (filePaths.length > 0) {
                toolDescriptions.push(`- **${toolName}**: Projektstruktur:\n  ${filePaths.join("\n  ")}`)
              }
              break
            case "refactor_tool":
              toolDescriptions.push(`- **${toolName}**: Du kannst Code refactoren. Gib immer den vollständigen refactored Code aus.`)
              break
            case "test_generator":
              toolDescriptions.push(`- **${toolName}**: Du kannst Unit Tests generieren. Verwende Jest/Vitest Syntax.`)
              break
            case "diff_analyzer":
              toolDescriptions.push(`- **${toolName}**: Analysiere Änderungen zwischen altem und neuem Code.`)
              break
            case "security_scanner":
            case "vulnerability_scanner":
              toolDescriptions.push(`- **${toolName}**: Prüfe auf: XSS, SQL Injection, unsichere Dependencies, hardcodierte Secrets.`)
              break
            case "secrets_detector":
              toolDescriptions.push(`- **${toolName}**: Suche nach: API Keys, Passwörter, Tokens, private Keys im Code.`)
              break
            case "injection_checker":
              toolDescriptions.push(`- **${toolName}**: Prüfe auf: SQL Injection, XSS, Command Injection, Path Traversal.`)
              break
            case "auth_analyzer":
              toolDescriptions.push(`- **${toolName}**: Analysiere: Auth-Flows, Session-Management, Token-Handling, RBAC.`)
              break
            case "complexity_analyzer":
              toolDescriptions.push(`- **${toolName}**: Berechne: Cyclomatic Complexity, Nesting Depth, Function Length.`)
              break
            case "style_checker":
              toolDescriptions.push(`- **${toolName}**: Prüfe: Naming Conventions, Code Formatting, Best Practices.`)
              break
            case "test_runner":
              toolDescriptions.push(`- **${toolName}**: Führe Tests aus und berichte Ergebnisse.`)
              break
            case "build_tool":
              toolDescriptions.push(`- **${toolName}**: Erstelle Build-Artefakte (npm run build).`)
              break
            case "git_tool":
              toolDescriptions.push(`- **${toolName}**: Git-Operationen: commit, push, branch, merge.`)
              break
            case "deploy_tool":
              toolDescriptions.push(`- **${toolName}**: Deployment zu Vercel, Netlify, Render.`)
              break
            default:
              toolDescriptions.push(`- **${toolName}**: ${(tool as { description: string }).description}`)
          }
        }
        
        if (toolDescriptions.length > 0) {
          toolsContext = `\n\n## VERFÜGBARE TOOLS:\n${toolDescriptions.join("\n")}`
        }
      }

      const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
        {
          role: "system",
          content: config.systemPrompt + projectContext + filesContext + toolsContext + mcpContext + (ragContext ? `\n\n${ragContext}` : ""),
        },
        {
          role: "user",
          content: userRequest + previousContext,
        },
      ]

      const response = await sendChatRequest({
        messages,
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        apiKey,
        provider,
      })

      // Parse Code-Dateien aus der Antwort (nur für Coder-Agent)
      const files = agentType === "coder" ? parseCodeFromResponse(response.content) : []

      return {
        content: response.content,
        files,
      }
    },
    [agentConfigs, globalConfig, currentProject, getFiles, customAgentConfigs]
  )

  const executeWorkflow = useCallback(
    async (userRequest: string, isIteration: boolean = false) => {
      setIsProcessing(true)
      setError(null)
      
      // Bei Iterationen: Behalte bestehende Dateien, nur Logs löschen
      // Bei neuem Projekt: Alles löschen
      if (!isIteration) {
        clearFiles()
      }
      clearLogs()

      const existingFilesCount = getFiles().length
      const iterationHint = existingFilesCount > 0 
        ? ` (Iteration - ${existingFilesCount} bestehende Dateien werden berücksichtigt)`
        : ""

      addLog({
        level: "info",
        agent: "system",
        message: `Workflow gestartet${iterationHint}`,
      })

      // Initialisiere Workflow-Steps basierend auf workflowOrder aus dem Store
      // Inkludiere sowohl Core-Agenten (aus agentConfigs) als auch Marketplace-Agenten
      addLog({
        level: "debug",
        agent: "system",
        message: `Workflow Order: ${workflowOrder.join(", ")}`,
      })
      
      const enabledAgents = (workflowOrder as AgentType[])
        .filter((type) => {
          // Core-Agenten: prüfe ob enabled
          if (agentConfigs[type]) {
            const enabled = agentConfigs[type].enabled
            addLog({
              level: "debug",
              agent: "system",
              message: `Agent ${type}: Core, enabled=${enabled}`,
            })
            return enabled
          }
          // Marketplace-Agenten: prüfe customAgentConfigs oder default enabled
          const customConfig = customAgentConfigs[type]
          if (customConfig !== undefined) {
            addLog({
              level: "debug",
              agent: "system",
              message: `Agent ${type}: Custom, enabled=${customConfig.enabled}`,
            })
            return customConfig.enabled
          }
          // Default: enabled wenn im Marketplace vorhanden
          const inMarketplace = marketplaceAgents.some(a => a.id === type)
          addLog({
            level: "debug",
            agent: "system",
            message: `Agent ${type}: Marketplace, found=${inMarketplace}`,
          })
          return inMarketplace
        })
      
      addLog({
        level: "info",
        agent: "system",
        message: `Aktivierte Agenten: ${enabledAgents.join(", ")}`,
      })

      const initialSteps: WorkflowStep[] = enabledAgents.map((agent) => {
        // Hole Agent-Info aus agentConfigs oder Marketplace
        const coreConfig = agentConfigs[agent]
        const marketplaceAgent = marketplaceAgents.find(a => a.id === agent)
        const name = coreConfig?.name || marketplaceAgent?.name || agent
        
        return {
          id: `step-${agent}`,
          agent,
          status: "idle" as const,
          title: name,
          description: `Warte auf Ausführung...`,
        }
      })

      setWorkflowSteps(initialSteps)

      // Füge User-Nachricht hinzu
      addMessage({
        role: "user",
        content: userRequest,
      })

      let previousOutput: string | undefined

      try {
        for (const agentType of enabledAgents) {
          setCurrentAgent(agentType)
          
          // Hole Agent-Name aus agentConfigs oder Marketplace
          const agentName = agentConfigs[agentType]?.name || 
            marketplaceAgents.find(a => a.id === agentType)?.name || 
            agentType

          addLog({
            level: "info",
            agent: agentType,
            message: `${agentName} gestartet`,
          })

          // Update Step Status
          updateWorkflowStep(`step-${agentType}`, {
            status: "running",
            description: "Agent arbeitet...",
            startTime: new Date(),
          })

          try {
            const startTime = Date.now()
            const result = await executeAgent(agentType, userRequest, previousOutput)
            const duration = ((Date.now() - startTime) / 1000).toFixed(1)

            addLog({
              level: "debug",
              agent: agentType,
              message: `API-Antwort erhalten (${duration}s)`,
            })

            // Füge generierte Dateien hinzu
            if (result.files.length > 0) {
              for (const file of result.files) {
                addFile({
                  path: file.path,
                  content: file.content,
                  language: file.language,
                  status: "created",
                })
                addLog({
                  level: "info",
                  agent: agentType,
                  message: `Datei erstellt: ${file.path}`,
                })
              }
            }

            // Parse und füge Vorschläge hinzu (für Reviewer/Security Agents)
            let suggestionsCount = 0
            if (agentType === "reviewer" || agentType === "security") {
              const existingFiles = getFiles()
              addLog({
                level: "debug",
                agent: agentType,
                message: `Parsing Vorschläge aus ${result.content.length} Zeichen...`,
              })
              
              const suggestions = parseSuggestionsFromResponse(result.content, agentType, existingFiles)
              suggestionsCount = suggestions.length
              
              addLog({
                level: "info",
                agent: agentType,
                message: `${suggestions.length} Vorschläge gefunden`,
              })
              
              if (suggestions.length > 0) {
                for (const suggestion of suggestions) {
                  addSuggestion(suggestion)
                  addLog({
                    level: "info",
                    agent: agentType,
                    message: `Vorschlag hinzugefügt: ${suggestion.title}`,
                  })
                }
              } else {
                // Fallback: Erstelle einen generischen Vorschlag wenn der Agent Verbesserungen erwähnt
                const hasImprovements = result.content.toLowerCase().includes("verbesser") || 
                                       result.content.toLowerCase().includes("empfehl") ||
                                       result.content.toLowerCase().includes("sollte") ||
                                       result.content.toLowerCase().includes("könnte") ||
                                       result.content.toLowerCase().includes("optimier") ||
                                       result.content.toLowerCase().includes("problem") ||
                                       result.content.toLowerCase().includes("fehler") ||
                                       result.content.toLowerCase().includes("issue")
                if (hasImprovements) {
                  // Extrahiere die ersten 3 Punkte aus der Antwort als Vorschläge
                  const lines = result.content.split('\n').filter(l => l.trim().length > 20)
                  const bulletPoints = lines.filter(l => 
                    l.trim().startsWith('-') || 
                    l.trim().startsWith('•') || 
                    l.trim().startsWith('*') ||
                    /^\d+\./.test(l.trim())
                  ).slice(0, 5)
                  
                  if (bulletPoints.length > 0) {
                    for (const point of bulletPoints) {
                      const cleanPoint = point.replace(/^[-•*\d.]+\s*/, '').trim()
                      if (cleanPoint.length > 15) {
                        addSuggestion({
                          agent: agentType,
                          type: "improvement",
                          title: cleanPoint.substring(0, 80) + (cleanPoint.length > 80 ? '...' : ''),
                          description: cleanPoint,
                          affectedFiles: [],
                          suggestedChanges: [],
                          priority: "medium",
                        })
                        addLog({
                          level: "info",
                          agent: agentType,
                          message: `Generischer Vorschlag hinzugefügt: ${cleanPoint.substring(0, 50)}...`,
                        })
                      }
                    }
                  } else {
                    // Erstelle einen einzelnen generischen Vorschlag
                    addSuggestion({
                      agent: agentType,
                      type: "improvement",
                      title: `${agentType === 'reviewer' ? 'Code-Review' : 'Sicherheits'}-Empfehlungen verfügbar`,
                      description: `Der ${agentType === 'reviewer' ? 'Reviewer' : 'Security'}-Agent hat Verbesserungsvorschläge erstellt. Klicke auf "Vollständiges Ergebnis anzeigen" im Workflow-Tab für Details.`,
                      affectedFiles: [],
                      suggestedChanges: [],
                      priority: "medium",
                    })
                    addLog({
                      level: "info",
                      agent: agentType,
                      message: `Generischer Vorschlag hinzugefügt (keine strukturierten Daten gefunden)`,
                    })
                  }
                }
              }
            }

            // Füge Agent-Nachricht hinzu (menschenlesbare Zusammenfassung)
            const humanSummary = createHumanReadableSummary(agentType, result.content, result.files, duration)
            addMessage({
              role: "assistant",
              content: humanSummary,
              agent: agentType,
            })

            // Update Step Status
            updateWorkflowStep(`step-${agentType}`, {
              status: "completed",
              description: "Erfolgreich abgeschlossen",
              output: result.content,
              endTime: new Date(),
            })

            addLog({
              level: "info",
              agent: agentType,
              message: `${agentName} abgeschlossen`,
            })

            previousOutput = result.content
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unbekannter Fehler"
            
            addLog({
              level: "error",
              agent: agentType,
              message: `Fehler: ${errorMessage}`,
            })

            updateWorkflowStep(`step-${agentType}`, {
              status: "error",
              description: errorMessage,
              error: errorMessage,
              endTime: new Date(),
            })

            addMessage({
              role: "assistant",
              content: `❌ Fehler beim ${agentName}: ${errorMessage}`,
              agent: agentType,
            })

            // Bei Fehler abbrechen
            setError(errorMessage)
            break
          }
        }
      } finally {
        setCurrentAgent(null)
        setIsProcessing(false)
        addLog({
          level: "info",
          agent: "system",
          message: "Workflow beendet",
        })
      }
    },
    [
      agentConfigs,
      addMessage,
      addFile,
      addLog,
      setWorkflowSteps,
      updateWorkflowStep,
      setIsProcessing,
      setCurrentAgent,
      setError,
      executeAgent,
      clearFiles,
      clearLogs,
      workflowOrder,
      customAgentConfigs,
    ]
  )

  // Funktion zum Korrigieren von Fehlern
  const fixErrors = useCallback(
    async (errorMessage: string, maxAttempts: number = 3) => {
      setIsProcessing(true)
      
      addLog({
        level: "info",
        agent: "system",
        message: `Starte automatische Fehlerkorrektur (max. ${maxAttempts} Versuche)`,
      })
      
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        // WICHTIG: Hole aktuelle Dateien bei JEDEM Versuch (nicht nur einmal am Anfang)
        const currentFiles = getFiles()
        
        addLog({
          level: "info",
          agent: "coder",
          message: `Korrekturversuch ${attempt}/${maxAttempts}`,
        })

        addMessage({
          role: "assistant",
          content: `🔧 **Automatische Fehlerkorrektur** (Versuch ${attempt}/${maxAttempts})\n\nFehler: ${errorMessage}`,
          agent: "system",
        })

        // Erstelle Kontext mit aktuellem Code und Fehler
        const filesContext = currentFiles.map(f => 
          `**${f.path}:**\n\`\`\`${f.language}\n${f.content}\n\`\`\``
        ).join("\n\n")

        const attemptInfo = attempt > 1 
          ? `\n\n## WICHTIG - VERSUCH ${attempt}/${maxAttempts}:\nDies ist Korrekturversuch ${attempt}. Die vorherigen Versuche haben den Fehler NICHT behoben. Du MUSST einen ANDEREN Ansatz wählen!\n- Analysiere den Fehler GENAUER\n- Prüfe ob du die richtige Datei korrigierst\n- Stelle sicher, dass ALLE notwendigen Änderungen gemacht werden\n- Der Fehler tritt immer noch auf, also war die vorherige Korrektur FALSCH oder UNVOLLSTÄNDIG!`
          : ""

        const fixPrompt = `Du bist ein erfahrener React/TypeScript-Entwickler. Der folgende Code hat einen Fehler, der in StackBlitz aufgetreten ist. Analysiere und korrigiere ihn.
${attemptInfo}

## FEHLERMELDUNG:
\`\`\`
${errorMessage}
\`\`\`

## AKTUELLER CODE:
${filesContext}

## ANWEISUNGEN:
1. **Analysiere den Fehler genau** - Was ist die EXAKTE Ursache? Welche Zeile? Welche Datei?
2. **Korrigiere den Code VOLLSTÄNDIG** - Behebe das Problem an der Wurzel, nicht nur oberflächlich
3. **Gib den KOMPLETTEN korrigierten Code aus** - Nicht nur die geänderten Zeilen
4. **Prüfe auf Folgefehler** - Könnte die Korrektur andere Probleme verursachen?

## AUSGABEFORMAT (WICHTIG!):
Für JEDE korrigierte Datei, gib den Code so aus:

\`\`\`typescript
// filepath: src/App.js
[VOLLSTÄNDIGER KORRIGIERTER CODE HIER]
\`\`\`

## HÄUFIGE FEHLER UND LÖSUNGEN:
- "Cannot read property 'map' of undefined" → Prüfe ob Array existiert: \`items?.map()\` oder \`items || []\`
- "Module not found" → Prüfe Import-Pfade und fehlende Abhängigkeiten
- "Unexpected token" → Prüfe JSX-Syntax und fehlende Klammern
- "is not defined" → Prüfe ob Variable/Funktion importiert oder deklariert ist
- "useState is not defined" → Füge \`import { useState } from "react"\` hinzu
- TypeScript-Fehler in StackBlitz → Konvertiere zu JavaScript (entferne Typen)

## STACKBLITZ-SPEZIFISCH:
- StackBlitz verwendet JavaScript, nicht TypeScript
- Entferne alle TypeScript-Typen (: string, : number, interface, type)
- Entferne "use client" Direktiven
- Verwende .js Dateien, nicht .tsx

Korrigiere jetzt den Code:`

        try {
          const coderConfig = agentConfigs.coder
          const provider = getProviderFromModel(coderConfig.model)
          const apiKey = provider === "openai" 
            ? globalConfig.openaiApiKey 
            : provider === "openrouter"
              ? globalConfig.openrouterApiKey
              : globalConfig.anthropicApiKey

          const response = await sendChatRequest({
            provider,
            model: coderConfig.model,
            messages: [
              { role: "system", content: coderConfig.systemPrompt },
              { role: "user", content: fixPrompt }
            ],
            temperature: coderConfig.temperature,
            maxTokens: coderConfig.maxTokens,
            apiKey,
          })

          // Parse korrigierte Dateien
          const fixedFiles = parseCodeFromResponse(response.content)
          
          addLog({
            level: "debug",
            agent: "coder",
            message: `Geparste Dateien: ${fixedFiles.length} (${fixedFiles.map(f => f.path).join(", ") || "keine"})`,
          })

          if (fixedFiles.length > 0) {
            // Aktualisiere die Dateien (erstellt oder überschreibt)
            for (const file of fixedFiles) {
              updateFileByPath(file.path, file.content, file.language)
              const existingFile = currentFiles.find(f => f.path === file.path)
              addLog({
                level: "info",
                agent: "coder",
                message: existingFile ? `Datei aktualisiert: ${file.path}` : `Neue Datei erstellt: ${file.path}`,
              })
            }

            addMessage({
              role: "assistant",
              content: `✅ **Korrektur angewendet** (Versuch ${attempt})\n\nKorrigierte Dateien:\n${fixedFiles.map(f => `- ${f.path}`).join("\n")}\n\n${response.content}`,
              agent: "coder",
            })

            addLog({
              level: "info",
              agent: "system",
              message: `Korrektur erfolgreich nach ${attempt} Versuch(en)`,
            })

            setIsProcessing(false)
            return { success: true, attempts: attempt }
          } else {
            // Keine Dateien geparst - zeige trotzdem die Antwort
            addMessage({
              role: "assistant",
              content: `⚠️ **Korrekturvorschlag** (Versuch ${attempt})\n\nKeine Dateien automatisch erkannt. Bitte prüfe die Antwort:\n\n${response.content}`,
              agent: "coder",
            })
            
            addLog({
              level: "warn",
              agent: "coder",
              message: `Keine Dateien aus Antwort geparst - Versuch ${attempt}`,
            })
          }
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : "Unbekannter Fehler"
          addLog({
            level: "error",
            agent: "coder",
            message: `Korrekturversuch ${attempt} fehlgeschlagen: ${errMsg}`,
          })
        }
      }

      addMessage({
        role: "assistant",
        content: `❌ **Automatische Korrektur fehlgeschlagen** nach ${maxAttempts} Versuchen.\n\nBitte beschreibe den Fehler genauer oder korrigiere ihn manuell.`,
        agent: "system",
      })

      addLog({
        level: "error",
        agent: "system",
        message: `Automatische Korrektur fehlgeschlagen nach ${maxAttempts} Versuchen`,
      })

      setIsProcessing(false)
      return { success: false, attempts: maxAttempts }
    },
    [agentConfigs, globalConfig, getFiles, addMessage, addLog, setIsProcessing, updateFileByPath]
  )

  return { executeWorkflow, fixErrors }
}
