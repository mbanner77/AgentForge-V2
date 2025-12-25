"use client"

import { useCallback } from "react"
import { useAgentStore, getEnvironmentPrompt, getIterationPrompt, getDeploymentTargetPrompt, type DeploymentTarget } from "./agent-store"
import { sendChatRequest, getProviderFromModel } from "./api-client"
import type { AgentType, Message, WorkflowStep, ProjectFile, AgentSuggestion } from "./types"
import { marketplaceAgents } from "./marketplace-agents"
import { getMcpServerById } from "./mcp-servers"

// RAG-Kontext für Agenten abrufen (mit Agent-spezifischer Filterung)
async function fetchRagContext(
  query: string, 
  apiKey: string, 
  agentId?: string,
  provider: "openai" | "openrouter" = "openai"
): Promise<string> {
  if (!apiKey) return ""
  
  // Coder bekommt mehr Kontext für bessere Code-Generierung
  const maxTokens = agentId === "coder" ? 4000 : 2000
  
  try {
    const response = await fetch("/api/rag/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        apiKey,
        buildContext: true,
        maxTokens,
        agentId,
        provider,
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

// Dependency-Analyse: Extrahiert installierte Pakete aus package.json
function analyzeDependencies(packageJsonContent: string): { dependencies: string[], devDependencies: string[], scripts: Record<string, string> } {
  try {
    const pkg = JSON.parse(packageJsonContent)
    return {
      dependencies: Object.keys(pkg.dependencies || {}),
      devDependencies: Object.keys(pkg.devDependencies || {}),
      scripts: pkg.scripts || {},
    }
  } catch {
    return { dependencies: [], devDependencies: [], scripts: {} }
  }
}

// Code-Pattern-Suche: Findet bestimmte Patterns in den bestehenden Dateien
function searchCodePatterns(files: { path: string; content: string }[], patterns: string[]): { pattern: string; matches: { file: string; line: number; context: string }[] }[] {
  const results: { pattern: string; matches: { file: string; line: number; context: string }[] }[] = []
  
  for (const pattern of patterns) {
    const matches: { file: string; line: number; context: string }[] = []
    const regex = new RegExp(pattern, 'gi')
    
    for (const file of files) {
      const lines = file.content.split('\n')
      lines.forEach((line, index) => {
        if (regex.test(line)) {
          matches.push({
            file: file.path,
            line: index + 1,
            context: line.trim().substring(0, 100),
          })
        }
        regex.lastIndex = 0 // Reset regex
      })
    }
    
    if (matches.length > 0) {
      results.push({ pattern, matches: matches.slice(0, 5) }) // Max 5 Matches pro Pattern
    }
  }
  
  return results
}

// Komponenten-Analyse: Findet alle React-Komponenten in den Dateien
function analyzeComponents(files: { path: string; content: string }[]): { name: string; file: string; hasState: boolean; hasEffects: boolean; props: string[] }[] {
  const components: { name: string; file: string; hasState: boolean; hasEffects: boolean; props: string[] }[] = []
  
  for (const file of files) {
    if (!file.path.endsWith('.tsx') && !file.path.endsWith('.jsx')) continue
    
    // Finde Funktions-Komponenten
    const funcMatches = file.content.matchAll(/export\s+(default\s+)?function\s+(\w+)\s*\(([^)]*)\)/g)
    for (const match of funcMatches) {
      const name = match[2]
      const propsStr = match[3]
      
      components.push({
        name,
        file: file.path,
        hasState: file.content.includes('useState'),
        hasEffects: file.content.includes('useEffect'),
        props: propsStr ? propsStr.split(',').map(p => p.trim().split(':')[0].replace(/[{}]/g, '').trim()).filter(Boolean) : [],
      })
    }
  }
  
  return components
}

interface ParsedCodeFile {
  path: string
  content: string
  language: string
}

// Agent-Ergebnis-Validierung
interface ValidationResult {
  isValid: boolean
  issues: string[]
  criticalIssues: string[] // Fatale Fehler die Retry erfordern
  score: number // 0-100
}

function validateAgentResult(
  agentType: AgentType,
  content: string,
  files: ParsedCodeFile[],
  deploymentTarget?: DeploymentTarget
): ValidationResult {
  const issues: string[] = []
  const criticalIssues: string[] = []
  let score = 100

  // Coder-Agent Validierung
  if (agentType === "coder") {
    // Muss mindestens eine Code-Datei enthalten
    if (files.length === 0) {
      criticalIssues.push("Keine Code-Dateien generiert")
      score -= 40
    }
    
    // KRITISCH: Prüfe auf doppelte export default (Build-Fehler!)
    for (const file of files) {
      const exportDefaultCount = (file.content.match(/export\s+default\s+function/g) || []).length
      if (exportDefaultCount > 1) {
        criticalIssues.push(`FATAL: ${file.path} hat ${exportDefaultCount}x "export default" - Build wird fehlschlagen!`)
        score -= 50
      }
      
      // KRITISCH: Context/Provider in app/page.tsx (für Next.js)
      if (file.path.includes("page.tsx") && deploymentTarget && deploymentTarget !== "github-only") {
        if (file.content.includes("createContext") || file.content.includes("Provider")) {
          criticalIssues.push(`FATAL: ${file.path} enthält Context/Provider - muss in components/ sein!`)
          score -= 40
        }
      }
      
      // Unvollständiger Code
      if (file.content.includes("// ... rest") || file.content.includes("// TODO") || file.content.includes("...")) {
        issues.push(`${file.path}: Enthält unvollständigen Code (...)`)
        score -= 20
      }
      
      // Leere Datei
      if (file.content.trim().length < 50) {
        issues.push(`${file.path}: Datei ist zu kurz`)
        score -= 30
      }
      
      // Fehlende Imports bei React-Komponenten
      if (file.path.endsWith(".tsx") || file.path.endsWith(".jsx")) {
        if (!file.content.includes("import") && file.content.includes("function")) {
          issues.push(`${file.path}: Fehlende Imports`)
          score -= 15
        }
        
        // Prüfe auf fehlende "use client" für Next.js
        if (deploymentTarget && deploymentTarget !== "github-only") {
          if (file.content.includes("useState") || file.content.includes("useEffect")) {
            if (!file.content.includes('"use client"') && !file.content.includes("'use client'")) {
              issues.push(`${file.path}: Fehlende "use client" Direktive für Client-Komponente`)
              score -= 10
            }
          }
        }
      }
    }
    
    // KRITISCH: Alle Komponenten in einer Datei?
    const componentCount = files.reduce((count, f) => {
      const matches = f.content.match(/export\s+(default\s+)?function\s+\w+/g) || []
      return count + matches.length
    }, 0)
    if (componentCount > 3 && files.length === 1) {
      criticalIssues.push(`WARNUNG: ${componentCount} Komponenten in nur 1 Datei - sollte aufgeteilt werden!`)
      score -= 25
    }
    
    // Prüfe ob Antwort nur Anweisungen enthält statt Code
    const instructionPatterns = [
      /du kannst.*ändern/i,
      /füge.*hinzu/i,
      /ändere zeile/i,
      /ersetze.*durch/i,
    ]
    if (instructionPatterns.some(p => p.test(content)) && files.length === 0) {
      criticalIssues.push("Antwort enthält nur Anweisungen statt Code")
      score -= 50
    }
  }
  
  // Planner-Agent Validierung
  if (agentType === "planner") {
    // Muss strukturierten Plan enthalten
    if (!content.includes("task") && !content.includes("Task") && !content.includes("##")) {
      issues.push("Kein strukturierter Plan erkennbar")
      score -= 30
    }
  }
  
  // Reviewer-Agent Validierung  
  if (agentType === "reviewer") {
    // Muss Bewertung oder Issues enthalten
    if (!content.includes("score") && !content.includes("issue") && !content.includes("Problem")) {
      issues.push("Kein Review-Feedback erkennbar")
      score -= 25
    }
  }

  return {
    isValid: score >= 50 && criticalIssues.length === 0,
    issues,
    criticalIssues,
    score: Math.max(0, score),
  }
}

// Retry-Konfiguration
const RETRY_CONFIG = {
  maxRetries: 2,
  retryDelay: 1000,
  retryableErrors: [
    "rate limit",
    "timeout",
    "network",
    "500",
    "503",
    "overloaded",
  ],
}

interface ParsedSuggestion {
  type: AgentSuggestion["type"]
  title: string
  description: string
  priority: AgentSuggestion["priority"]
  filePath: string
  newContent: string
}

// Intelligente Fehler-Erkennung im Agent-Output
interface DetectedError {
  type: "syntax" | "runtime" | "type" | "import" | "logic" | "security" | "unknown"
  message: string
  file?: string
  line?: number
  severity: "error" | "warning" | "info"
  autoFixable: boolean
  suggestedFix?: string
}

function detectErrorsInOutput(content: string): DetectedError[] {
  const errors: DetectedError[] = []
  const contentLower = content.toLowerCase()
  
  // TypeScript/JavaScript Syntax Errors
  const syntaxPatterns = [
    { regex: /SyntaxError:\s*(.+)/gi, type: "syntax" as const },
    { regex: /Unexpected token\s*['"]?(\w+)['"]?/gi, type: "syntax" as const },
    { regex: /Missing semicolon/gi, type: "syntax" as const },
  ]
  
  // Type Errors
  const typePatterns = [
    { regex: /TypeError:\s*(.+)/gi, type: "type" as const },
    { regex: /Type '(\w+)' is not assignable to type '(\w+)'/gi, type: "type" as const },
    { regex: /Property '(\w+)' does not exist/gi, type: "type" as const },
    { regex: /Cannot find name '(\w+)'/gi, type: "type" as const },
  ]
  
  // Import Errors
  const importPatterns = [
    { regex: /Cannot find module ['"]([^'"]+)['"]/gi, type: "import" as const },
    { regex: /Module not found:\s*(.+)/gi, type: "import" as const },
    { regex: /Failed to resolve import/gi, type: "import" as const },
  ]
  
  // Runtime Errors
  const runtimePatterns = [
    { regex: /ReferenceError:\s*(.+)/gi, type: "runtime" as const },
    { regex: /is not defined/gi, type: "runtime" as const },
    { regex: /Cannot read propert(y|ies) of (undefined|null)/gi, type: "runtime" as const },
  ]
  
  // Alle Patterns durchsuchen
  const allPatterns = [
    ...syntaxPatterns.map(p => ({ ...p, severity: "error" as const, autoFixable: true })),
    ...typePatterns.map(p => ({ ...p, severity: "error" as const, autoFixable: true })),
    ...importPatterns.map(p => ({ ...p, severity: "error" as const, autoFixable: true })),
    ...runtimePatterns.map(p => ({ ...p, severity: "error" as const, autoFixable: false })),
  ]
  
  for (const pattern of allPatterns) {
    const matches = content.matchAll(pattern.regex)
    for (const match of matches) {
      // Extrahiere Zeilennummer falls vorhanden
      const lineMatch = content.slice(Math.max(0, match.index! - 50), match.index! + 100).match(/line\s*(\d+)/i)
      const fileMatch = content.slice(Math.max(0, match.index! - 100), match.index! + 50).match(/([a-zA-Z0-9_-]+\.(tsx?|jsx?|ts|js))/i)
      
      errors.push({
        type: pattern.type,
        message: match[0],
        file: fileMatch?.[1],
        line: lineMatch ? parseInt(lineMatch[1]) : undefined,
        severity: pattern.severity,
        autoFixable: pattern.autoFixable,
      })
    }
  }
  
  // Deduplizieren
  const uniqueErrors = errors.filter((error, index, self) => 
    index === self.findIndex(e => e.message === error.message && e.type === error.type)
  )
  
  return uniqueErrors
}

// Generiere automatische Fix-Vorschläge basierend auf Fehlertyp
function generateAutoFixSuggestion(error: DetectedError): string | undefined {
  switch (error.type) {
    case "import":
      if (error.message.includes("Cannot find module")) {
        const moduleName = error.message.match(/['"]([^'"]+)['"]/)?.[1]
        if (moduleName) {
          return `Installiere das fehlende Modul: npm install ${moduleName}`
        }
      }
      return "Prüfe die Import-Pfade und stelle sicher, dass alle Module installiert sind"
      
    case "type":
      if (error.message.includes("is not assignable")) {
        return "Korrigiere den Typ oder füge eine Type-Assertion hinzu"
      }
      if (error.message.includes("does not exist")) {
        return "Füge die fehlende Property zum Interface hinzu oder korrigiere den Property-Namen"
      }
      return "Überprüfe die TypeScript-Typen und korrigiere die Typisierung"
      
    case "syntax":
      return "Korrigiere die Syntax (fehlende Klammern, Semikolons, etc.)"
      
    case "runtime":
      if (error.message.includes("undefined") || error.message.includes("null")) {
        return "Füge Null-Checks hinzu: variable?.property oder variable && variable.property"
      }
      return "Stelle sicher, dass alle Variablen vor Verwendung definiert sind"
      
    default:
      return undefined
  }
}

// Erstellt eine menschenlesbare Zusammenfassung der Agent-Ausgabe
function createHumanReadableSummary(
  agentType: AgentType,
  content: string,
  files: ParsedCodeFile[],
  duration: string,
  targetEnvironment?: string
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
    // Bestimme den korrekten Tab-Namen basierend auf targetEnvironment
    const envTabNames: Record<string, string> = {
      sandpack: "Sandpack",
      webcontainer: "WebContainer",
      local: "Editor",
      docker: "Editor",
    }
    const tabName = envTabNames[targetEnvironment || "sandpack"] || "Preview"
    
    let summary = `✅ **${agentName} abgeschlossen** (${duration}s)\n\n`
    summary += `🚀 **Ausführung:**\n`
    summary += `- Projekt ist bereit zur Vorschau\n`
    summary += `- Wechsle zum "${tabName}"-Tab für Live-Preview`
    
    return summary
  }

  // === MARKETPLACE AGENTS ===
  
  // Tester Agent
  if (agentType === "tester") {
    const testCount = (content.match(/(?:test|it|describe)\s*\(/gi) || []).length
    const hasJest = content.toLowerCase().includes("jest") || content.toLowerCase().includes("vitest")
    
    let summary = `✅ **Test Agent** abgeschlossen (${duration}s)\n\n`
    summary += `🧪 **Test-Generierung:**\n`
    if (testCount > 0) summary += `- ${testCount} Tests generiert\n`
    if (hasJest) summary += `- Jest/Vitest Test-Suite erstellt\n`
    if (files.length > 0) summary += `- ${files.length} Test-Dateien erstellt`
    
    return summary
  }
  
  // Documenter Agent
  if (agentType === "documenter") {
    const hasReadme = files.some(f => f.path.toLowerCase().includes("readme"))
    const hasApi = content.toLowerCase().includes("api") || content.toLowerCase().includes("endpoint")
    
    let summary = `✅ **Documentation Agent** abgeschlossen (${duration}s)\n\n`
    summary += `📝 **Dokumentation:**\n`
    if (hasReadme) summary += `- README.md erstellt\n`
    if (hasApi) summary += `- API-Dokumentation generiert\n`
    if (files.length > 0) summary += `- ${files.length} Dokumentationsdateien erstellt`
    
    return summary
  }
  
  // Optimizer Agent
  if (agentType === "optimizer") {
    const hasPerf = content.toLowerCase().includes("performance") || content.toLowerCase().includes("optimier")
    const hasBundle = content.toLowerCase().includes("bundle") || content.toLowerCase().includes("size")
    
    let summary = `✅ **Performance Optimizer** abgeschlossen (${duration}s)\n\n`
    summary += `⚡ **Optimierung:**\n`
    if (hasPerf) summary += `- Performance-Analyse durchgeführt\n`
    if (hasBundle) summary += `- Bundle-Size analysiert\n`
    summary += `- Optimierungsvorschläge erstellt`
    
    return summary
  }
  
  // Accessibility Agent
  if (agentType === "accessibility") {
    const hasA11y = content.toLowerCase().includes("wcag") || content.toLowerCase().includes("aria")
    
    let summary = `✅ **Accessibility Agent** abgeschlossen (${duration}s)\n\n`
    summary += `♿ **Barrierefreiheit:**\n`
    if (hasA11y) summary += `- WCAG-Prüfung durchgeführt\n`
    summary += `- A11y-Empfehlungen erstellt`
    
    return summary
  }
  
  // Database Agent
  if (agentType === "database") {
    const hasPrisma = content.toLowerCase().includes("prisma")
    const hasSchema = content.toLowerCase().includes("schema") || content.toLowerCase().includes("model")
    
    let summary = `✅ **Database Agent** abgeschlossen (${duration}s)\n\n`
    summary += `🗄️ **Datenbank:**\n`
    if (hasPrisma) summary += `- Prisma Schema generiert\n`
    if (hasSchema) summary += `- Datenmodell erstellt\n`
    if (files.length > 0) summary += `- ${files.length} Schema-Dateien erstellt`
    
    return summary
  }
  
  // DevOps Agent
  if (agentType === "devops") {
    const hasDocker = content.toLowerCase().includes("docker")
    const hasCI = content.toLowerCase().includes("github actions") || content.toLowerCase().includes("ci/cd")
    
    let summary = `✅ **DevOps Agent** abgeschlossen (${duration}s)\n\n`
    summary += `🐳 **DevOps:**\n`
    if (hasDocker) summary += `- Docker-Konfiguration erstellt\n`
    if (hasCI) summary += `- CI/CD Pipeline generiert\n`
    if (files.length > 0) summary += `- ${files.length} Konfigurationsdateien erstellt`
    
    return summary
  }
  
  // SAP Agents
  if ((agentType as string).startsWith("sap-")) {
    const agentDisplayNames: Record<string, string> = {
      "sap-cap-developer": "SAP CAP Developer",
      "sap-ui5-developer": "SAP UI5 Developer",
      "sap-fiori-developer": "SAP Fiori Developer",
      "sap-mdk-developer": "SAP MDK Developer",
    }
    
    const displayName = agentDisplayNames[agentType] || agentType
    const hasCDS = content.toLowerCase().includes("cds") || content.toLowerCase().includes("entity")
    const hasUI5 = content.toLowerCase().includes("ui5") || content.toLowerCase().includes("sapui5")
    const hasFiori = content.toLowerCase().includes("fiori") || content.toLowerCase().includes("annotation")
    
    let summary = `✅ **${displayName}** abgeschlossen (${duration}s)\n\n`
    summary += `🏢 **SAP Entwicklung:**\n`
    if (hasCDS) summary += `- CDS-Modelle erstellt\n`
    if (hasUI5) summary += `- UI5 Code generiert\n`
    if (hasFiori) summary += `- Fiori-Konfiguration erstellt\n`
    if (files.length > 0) summary += `- ${files.length} Dateien erstellt`
    
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
  
  // Debug: Log content length and first 500 chars
  console.log(`[parseCodeFromResponse] Content length: ${content.length}`)
  console.log(`[parseCodeFromResponse] Content preview: ${content.substring(0, 500)}...`)
  
  // Mehrere Patterns für Code-Blöcke - ROBUSTER REGEX
  // Akzeptiert: ```language\n, ```language \n, ```\n, ``` \n, mit \r\n oder \n
  // Pattern 1: ```language\n// filepath: path\ncode```
  // Pattern 2: ```language\ncode``` mit filepath im Code
  // Pattern 3: **filename** gefolgt von Code-Block
  const codeBlockRegex = /```(\w+)?[ \t]*[\r\n]+([\s\S]*?)```/gi
  
  // Debug: Check if content contains code blocks at all
  const hasBackticks = content.includes('```')
  console.log(`[parseCodeFromResponse] Contains backticks: ${hasBackticks}`)
  
  if (!hasBackticks) {
    console.warn(`[parseCodeFromResponse] WARNUNG: Keine Code-Blöcke gefunden! AI hat möglicherweise keinen Code generiert.`)
    // Versuche Code ohne Backticks zu finden (Fallback)
    const codePatterns = [
      /\/\/\s*filepath:\s*([\w\-./]+\.(?:tsx?|jsx?|css|json))\s*[\r\n]+([\s\S]+?)(?=\/\/\s*filepath:|$)/gi,
      /(?:^|\n)(?:import|export|function|const|"use client")/
    ]
    if (codePatterns[1].test(content)) {
      console.log(`[parseCodeFromResponse] Code-artige Inhalte gefunden, aber keine Backticks. Versuche Extraktion...`)
    }
  }
  
  let match
  let matchCount = 0
  while ((match = codeBlockRegex.exec(content)) !== null) {
    matchCount++
    let language = match[1] || "typescript"
    let code = match[2]?.trim()
    let path: string | undefined
    
    console.log(`[parseCodeFromResponse] Match ${matchCount}: language=${language}, code length=${code?.length || 0}`)
    
    if (!code) {
      console.log(`[parseCodeFromResponse] Match ${matchCount}: Leerer Code, überspringe`)
      continue
    }
    
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
    console.log(`[parseCodeFromResponse] Datei hinzugefügt: ${path} (${code.length} Zeichen)`)
  }
  
  console.log(`[parseCodeFromResponse] ERGEBNIS: ${files.length} Dateien gefunden`)
  if (files.length === 0 && hasBackticks) {
    console.warn(`[parseCodeFromResponse] Code-Blöcke vorhanden aber keine Dateien extrahiert! Mögliches Regex-Problem.`)
    // Zeige die ersten Backticks zum Debugging
    const firstBacktick = content.indexOf('```')
    if (firstBacktick >= 0) {
      console.log(`[parseCodeFromResponse] Erster Code-Block (Position ${firstBacktick}): "${content.substring(firstBacktick, firstBacktick + 100)}..."`)
    }
  }
  
  // FALLBACK: Wenn keine Dateien gefunden, versuche Code ohne Backticks zu extrahieren
  if (files.length === 0) {
    console.log(`[parseCodeFromResponse] Versuche Fallback-Extraktion...`)
    
    // Suche nach // filepath: Patterns ohne Code-Block
    const filepathPattern = /\/\/\s*filepath:\s*([\w\-./]+\.(?:tsx?|jsx?|css|json))\s*[\r\n]+([\s\S]+?)(?=\/\/\s*filepath:|$)/gi
    let fpMatch
    while ((fpMatch = filepathPattern.exec(content)) !== null) {
      const path = fpMatch[1].trim()
      let code = fpMatch[2].trim()
      // Entferne trailing ``` falls vorhanden
      code = code.replace(/```\s*$/, '').trim()
      
      if (code.length > 20) {
        const ext = path.split('.').pop() || 'tsx'
        const language = ext === 'css' ? 'css' : ext === 'json' ? 'json' : ext === 'js' ? 'javascript' : 'typescript'
        files.push({ path, content: code, language })
        console.log(`[parseCodeFromResponse] Fallback: Datei gefunden: ${path}`)
      }
    }
    
    // Wenn immer noch keine Dateien und es sieht nach React-Code aus
    if (files.length === 0) {
      const hasReactCode = content.includes('export default function') || 
                           content.includes('import { useState') ||
                           content.includes('import React')
      if (hasReactCode) {
        console.log(`[parseCodeFromResponse] React-Code erkannt ohne strukturierte Ausgabe, versuche Extraktion...`)
        
        // Versuche den gesamten Inhalt als App.tsx zu behandeln
        const codeStart = content.indexOf('import')
        if (codeStart >= 0) {
          let code = content.substring(codeStart)
          // Entferne Erklärungen nach dem Code (nach letzter })
          const lastBrace = code.lastIndexOf('}')
          if (lastBrace > 0) {
            code = code.substring(0, lastBrace + 1)
          }
          if (code.length > 50) {
            files.push({ path: 'App.tsx', content: code, language: 'typescript' })
            console.log(`[parseCodeFromResponse] Fallback: App.tsx aus rohem Content extrahiert`)
          }
        }
      }
    }
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
    saveToHistory,
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
      
      // Füge Deployment-Target spezifischen Prompt für ALLE Agenten hinzu
      const deployTarget = (globalConfig as { deploymentTarget?: string }).deploymentTarget as DeploymentTarget
      if (deployTarget) {
        const deployPrompt = getDeploymentTargetPrompt(agentType, deployTarget)
        if (deployPrompt) {
          config.systemPrompt += "\n\n" + deployPrompt
          console.log(`[Agent Executor] Deployment-Target ${deployTarget} Prompt für ${agentType} hinzugefügt`)
        }
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
      // Mit Fallback zu OpenRouter wenn der primäre Provider nicht konfiguriert ist
      let provider = getProviderFromModel(config.model)
      let apiKey: string
      let providerName: string
      let usedModel = config.model
      
      if (provider === "openrouter") {
        apiKey = globalConfig.openrouterApiKey
        providerName = "OpenRouter"
      } else if (provider === "anthropic") {
        apiKey = globalConfig.anthropicApiKey
        providerName = "Anthropic"
        // Fallback zu OpenRouter wenn Anthropic nicht konfiguriert
        if (!apiKey && globalConfig.openrouterApiKey) {
          apiKey = globalConfig.openrouterApiKey
          provider = "openrouter"
          providerName = "OpenRouter (Fallback)"
          usedModel = `anthropic/${config.model}`
          console.log(`[Agent Executor] Fallback zu OpenRouter für Anthropic Model`)
        }
      } else {
        // OpenAI
        apiKey = globalConfig.openaiApiKey
        providerName = "OpenAI"
        // Fallback zu OpenRouter wenn OpenAI nicht konfiguriert
        if (!apiKey && globalConfig.openrouterApiKey) {
          apiKey = globalConfig.openrouterApiKey
          provider = "openrouter"
          providerName = "OpenRouter (Fallback)"
          usedModel = `openai/${config.model}`
          console.log(`[Agent Executor] Fallback zu OpenRouter für OpenAI Model`)
        }
      }

      console.log(`[Agent Executor] Provider: ${provider}, hasApiKey: ${!!apiKey}`)

      if (!apiKey) {
        throw new Error(
          `Kein API-Key konfiguriert. Bitte OpenAI, Anthropic oder OpenRouter API-Key ` +
          `in den Einstellungen (Sidebar) hinterlegen.`
        )
      }
      
      // Aktualisiere Model wenn Fallback verwendet wird
      config.model = usedModel

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
        
        filesContext = `\n\n## ⚠️ ITERATIONS-MODUS AKTIV - BESTEHENDE DATEIEN (${existingFiles.length} Dateien):
Dies ist eine Folge-Anfrage zu einem bestehenden Projekt. Analysiere den bestehenden Code sorgfältig!

${fileContexts.join("\n\n")}

## WICHTIGE ANWEISUNGEN FÜR DIESE ITERATION:
1. Erkenne ob es ein BUGFIX, FEATURE oder ANPASSUNG ist
2. Analysiere welche Teile des Codes betroffen sind
3. Behalte ALLE funktionierenden Teile bei
4. Gib bei Änderungen den VOLLSTÄNDIGEN aktualisierten Code aus
5. Vergiss keine bestehenden Imports, States oder Handler`
      }

      const projectContext = currentProject
        ? `\n\nProjekt: ${currentProject.name}\nBeschreibung: ${currentProject.description}`
        : ""

      // Strukturierter Kontext vom vorherigen Agent
      let previousContext = ""
      if (previousOutput) {
        // Erkenne Agent-Typ aus vorherigem Output
        const isPlannerOutput = previousOutput.includes("## Plan") || previousOutput.includes("## Aufgaben") || previousOutput.includes("## Features")
        const isCoderOutput = previousOutput.includes("```") && (previousOutput.includes("export") || previousOutput.includes("function") || previousOutput.includes("const"))
        const isReviewerOutput = previousOutput.includes("## Review") || previousOutput.includes("Verbesserung") || previousOutput.includes("Problem")
        
        if (isPlannerOutput && agentType === "coder") {
          previousContext = `\n\n## 📋 PLAN VOM PLANNER (Folge diesem Plan exakt!):\n${previousOutput}\n\n**WICHTIG:** Implementiere ALLE Punkte aus dem Plan. Erstelle vollständige, lauffähige Dateien.`
        } else if (isCoderOutput && agentType === "reviewer") {
          previousContext = `\n\n## 💻 CODE VOM CODER (Prüfe diesen Code):\n${previousOutput}\n\n**AUFGABE:** Analysiere den Code auf Bugs, Best Practices, Performance und Sicherheit.`
        } else if (isReviewerOutput && agentType === "coder") {
          previousContext = `\n\n## 🔍 FEEDBACK VOM REVIEWER (Setze diese Verbesserungen um!):\n${previousOutput}\n\n**WICHTIG:** Implementiere ALLE genannten Verbesserungen. Gib den vollständigen korrigierten Code aus.`
        } else if (agentType === "security") {
          previousContext = `\n\n## 📄 ZU PRÜFENDER CODE:\n${previousOutput}\n\n**AUFGABE:** Führe einen vollständigen Security-Audit durch.`
        } else {
          previousContext = `\n\n## Vorheriger Output:\n${previousOutput}`
        }
      }

      // MCP Server Kontext
      const mcpServerIds = customConfig?.mcpServers || (coreConfig as any)?.mcpServers || []
      const mcpContext = mcpServerIds.length > 0
        ? `\n\nVerfügbare MCP Server:\n${mcpServerIds.map((id: string) => {
            const server = getMcpServerById(id)
            if (!server) return null
            return `- ${server.name}: ${server.description} (Capabilities: ${server.capabilities.join(", ")})`
          }).filter(Boolean).join("\n")}`
        : ""

      // RAG-Kontext aus der Knowledge Base abrufen (agentenspezifisch)
      // Verwende OpenAI wenn verfügbar, sonst OpenRouter als Fallback
      let ragContext = ""
      const ragApiKey = globalConfig.openaiApiKey || globalConfig.openrouterApiKey
      const ragProvider = globalConfig.openaiApiKey ? "openai" : "openrouter"
      
      if (ragApiKey) {
        try {
          ragContext = await fetchRagContext(userRequest, ragApiKey, agentType, ragProvider)
          if (ragContext) {
            addLog({
              level: "info",
              agent: agentType,
              message: `RAG-Kontext aus Knowledge Base geladen (${ragProvider})`,
            })
          }
        } catch (error) {
          console.warn("[RAG] Kontext konnte nicht geladen werden:", error)
        }
      }

      // Tools-Kontext basierend auf aktivierten Tools
      const enabledTools = config.tools?.filter((t: { enabled: boolean }) => t.enabled) || []
      let toolsContext = ""
      
      // INTELLIGENTE CODE-ANALYSE für Coder (automatisch aktiviert)
      if (agentType === "coder" && existingFiles.length > 0) {
        const analysisContext: string[] = []
        
        // Komponenten-Analyse
        const components = analyzeComponents(existingFiles)
        if (components.length > 0) {
          analysisContext.push(`\n## 📊 KOMPONENTEN-ANALYSE (${components.length} gefunden):`)
          for (const comp of components.slice(0, 10)) {
            const features = [
              comp.hasState ? "State" : "",
              comp.hasEffects ? "Effects" : "",
              comp.props.length > 0 ? `Props: ${comp.props.join(", ")}` : ""
            ].filter(Boolean).join(", ")
            analysisContext.push(`- **${comp.name}** (${comp.file})${features ? ` [${features}]` : ""}`)
          }
        }
        
        // Dependency-Analyse
        const packageJson = existingFiles.find(f => f.path.includes("package.json"))
        if (packageJson) {
          const deps = analyzeDependencies(packageJson.content)
          if (deps.dependencies.length > 0) {
            analysisContext.push(`\n## 📦 VERFÜGBARE PACKAGES:`)
            analysisContext.push(`Dependencies: ${deps.dependencies.join(", ")}`)
            if (deps.devDependencies.length > 0) {
              analysisContext.push(`DevDeps: ${deps.devDependencies.join(", ")}`)
            }
          }
        }
        
        // Pattern-Suche für häufige Probleme
        const criticalPatterns = searchCodePatterns(existingFiles, [
          'export\\s+default.*export\\s+default', // Doppelte exports
          'createContext.*Provider', // Context Pattern
          'useState|useEffect|useCallback', // Hooks
        ])
        if (criticalPatterns.length > 0) {
          analysisContext.push(`\n## 🔍 CODE-PATTERNS GEFUNDEN:`)
          for (const p of criticalPatterns) {
            analysisContext.push(`- Pattern "${p.pattern}": ${p.matches.length} Treffer`)
          }
        }
        
        if (analysisContext.length > 0) {
          toolsContext += analysisContext.join("\n")
        }
      }
      
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
              // Nutze die neue analyzeDependencies Funktion
              const pkgJson = existingFiles.find(f => f.path.includes("package.json"))
              if (pkgJson) {
                const deps = analyzeDependencies(pkgJson.content)
                toolDescriptions.push(`- **${toolName}**: Dependencies: ${deps.dependencies.join(", ") || "keine"} | DevDeps: ${deps.devDependencies.join(", ") || "keine"}`)
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
            // === MARKETPLACE AGENT TOOLS ===
            case "coverage_analyzer":
              toolDescriptions.push(`- **${toolName}**: Analysiere Test-Coverage und identifiziere ungetestete Code-Pfade.`)
              break
            case "readme_generator":
              toolDescriptions.push(`- **${toolName}**: Generiere README.md mit Installation, Verwendung und API-Dokumentation.`)
              break
            case "api_doc_generator":
              toolDescriptions.push(`- **${toolName}**: Erstelle OpenAPI/Swagger Spezifikationen und API-Dokumentation.`)
              break
            case "bundle_analyzer":
              toolDescriptions.push(`- **${toolName}**: Analysiere Bundle-Size, identifiziere große Dependencies und Tree-Shaking Möglichkeiten.`)
              break
            case "perf_profiler":
              toolDescriptions.push(`- **${toolName}**: Profile Performance: Render-Zeiten, Memory Usage, Network Requests.`)
              break
            case "wcag_checker":
              toolDescriptions.push(`- **${toolName}**: Prüfe WCAG 2.1 Konformität: Kontraste, ARIA-Labels, Keyboard Navigation.`)
              break
            case "string_extractor":
              toolDescriptions.push(`- **${toolName}**: Extrahiere hardcodierte Strings für i18n/Übersetzung.`)
              break
            case "translator":
              toolDescriptions.push(`- **${toolName}**: Übersetze Strings in verschiedene Sprachen.`)
              break
            case "schema_generator":
              toolDescriptions.push(`- **${toolName}**: Generiere Datenbank-Schemas (Prisma, Drizzle, TypeORM).`)
              break
            case "migration_generator":
              toolDescriptions.push(`- **${toolName}**: Erstelle Datenbank-Migrationen.`)
              break
            case "openapi_generator":
              toolDescriptions.push(`- **${toolName}**: Generiere OpenAPI 3.0 Spezifikationen für REST APIs.`)
              break
            case "code_smell_detector":
              toolDescriptions.push(`- **${toolName}**: Erkenne Code Smells: Duplicate Code, Long Methods, God Classes.`)
              break
            case "docker_generator":
              toolDescriptions.push(`- **${toolName}**: Generiere Dockerfile, docker-compose.yml, .dockerignore.`)
              break
            case "ci_generator":
              toolDescriptions.push(`- **${toolName}**: Erstelle CI/CD Pipelines für GitHub Actions, GitLab CI, Jenkins.`)
              break
            // === SAP AGENT TOOLS ===
            case "cds_modeler":
              toolDescriptions.push(`- **${toolName}**: Modelliere CDS Entitäten, Services und Annotationen für SAP CAP.`)
              break
            case "cap_project_setup":
              toolDescriptions.push(`- **${toolName}**: Initialisiere CAP Projekte mit db/, srv/, app/ Struktur.`)
              break
            case "ui5_analyzer":
              toolDescriptions.push(`- **${toolName}**: Analysiere UI5 Apps: Controls, Bindings, manifest.json.`)
              break
            case "fiori_generator":
              toolDescriptions.push(`- **${toolName}**: Generiere Fiori Elements Apps: List Report, Object Page, Worklist.`)
              break
            case "mdk_builder":
              toolDescriptions.push(`- **${toolName}**: Baue MDK Mobile Apps mit Offline-Sync und OData Integration.`)
              break
            default:
              toolDescriptions.push(`- **${toolName}**: ${(tool as { description: string }).description}`)
          }
        }
        
        if (toolDescriptions.length > 0) {
          toolsContext = `\n\n## VERFÜGBARE TOOLS:\n${toolDescriptions.join("\n")}`
        }
      }

      // Iterations-Erkennung und spezialisierte Prompts
      const isIterationMode = existingFiles.length > 0
      let iterationContext = ""
      
      if (isIterationMode && (agentType === "planner" || agentType === "coder" || agentType === "reviewer")) {
        iterationContext = getIterationPrompt(agentType as "planner" | "coder" | "reviewer")
        console.log(`[Agent Executor] Iterations-Modus für ${agentType} aktiviert (${existingFiles.length} bestehende Dateien)`)
      }

      const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
        {
          role: "system",
          content: config.systemPrompt + iterationContext + projectContext + filesContext + toolsContext + mcpContext + (ragContext ? `\n\n${ragContext}` : ""),
        },
        {
          role: "user",
          content: userRequest + previousContext,
        },
      ]

      // Retry-Logik für robustere Agent-Ausführung
      let lastError: Error | null = null
      let response: { content: string } | null = null
      
      for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            console.log(`[Agent Executor] Retry ${attempt}/${RETRY_CONFIG.maxRetries} für ${agentType}`)
            await new Promise(r => setTimeout(r, RETRY_CONFIG.retryDelay * attempt))
          }
          
          response = await sendChatRequest({
            messages,
            model: config.model,
            temperature: config.temperature,
            maxTokens: config.maxTokens,
            apiKey,
            provider,
          })
          
          break // Erfolgreich, beende Retry-Loop
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error))
          const errorMsg = lastError.message.toLowerCase()
          
          // Prüfe ob Fehler retryable ist
          const isRetryable = RETRY_CONFIG.retryableErrors.some(e => errorMsg.includes(e))
          
          if (!isRetryable || attempt === RETRY_CONFIG.maxRetries) {
            throw lastError
          }
        }
      }
      
      if (!response) {
        throw lastError || new Error("Keine Antwort vom Agent")
      }

      // Parse Code-Dateien aus der Antwort (nur für Coder-Agent)
      const files = agentType === "coder" ? parseCodeFromResponse(response.content) : []
      
      // Validiere Agent-Ergebnis
      const validation = validateAgentResult(agentType, response.content, files)
      
      // Intelligente Fehler-Erkennung
      const detectedErrors = detectErrorsInOutput(response.content)
      if (detectedErrors.length > 0) {
        console.log(`[Agent Executor] ${detectedErrors.length} Fehler erkannt:`, 
          detectedErrors.map(e => `${e.type}: ${e.message}`))
        
        // Füge Fix-Vorschläge hinzu
        for (const error of detectedErrors) {
          error.suggestedFix = generateAutoFixSuggestion(error)
        }
      }
      
      if (!validation.isValid) {
        console.warn(`[Agent Executor] Validierung für ${agentType} fehlgeschlagen:`, validation.issues)
        // Bei Coder: Versuche nochmal mit expliziterem Prompt
        if (agentType === "coder" && validation.issues.includes("Keine Code-Dateien generiert")) {
          console.log(`[Agent Executor] Coder hat keinen Code generiert, versuche erneut...`)
          
          const retryMessages = [
            ...messages,
            { role: "assistant" as const, content: response.content },
            { role: "user" as const, content: "WICHTIG: Du musst vollständigen, lauffähigen Code als Code-Block ausgeben. Keine Erklärungen, nur den kompletten Code mit // filepath: Dateiname am Anfang." }
          ]
          
          const retryResponse = await sendChatRequest({
            messages: retryMessages,
            model: config.model,
            temperature: 0.3, // Niedrigere Temperatur für konsistentere Ausgabe
            maxTokens: config.maxTokens,
            apiKey,
            provider,
          })
          
          const retryFiles = parseCodeFromResponse(retryResponse.content)
          if (retryFiles.length > 0) {
            return { content: retryResponse.content, files: retryFiles }
          }
        }
        
        // Bei erkannten Fehlern: Automatischer Fix-Versuch
        if (detectedErrors.some(e => e.autoFixable)) {
          console.log(`[Agent Executor] Versuche automatische Fehlerkorrektur...`)
          
          const errorSummary = detectedErrors
            .map(e => `- ${e.type}: ${e.message}${e.suggestedFix ? ` (Fix: ${e.suggestedFix})` : ''}`)
            .join('\n')
          
          const fixMessages = [
            ...messages,
            { role: "assistant" as const, content: response.content },
            { role: "user" as const, content: `Die folgende Fehler wurden erkannt:\n${errorSummary}\n\nBitte korrigiere ALLE Fehler und gib den VOLLSTÄNDIGEN, korrigierten Code aus.` }
          ]
          
          const fixResponse = await sendChatRequest({
            messages: fixMessages,
            model: config.model,
            temperature: 0.2,
            maxTokens: config.maxTokens,
            apiKey,
            provider,
          })
          
          const fixedFiles = parseCodeFromResponse(fixResponse.content)
          const fixedErrors = detectErrorsInOutput(fixResponse.content)
          
          // Wenn weniger Fehler, verwende korrigierte Version
          if (fixedErrors.length < detectedErrors.length || fixedFiles.length > files.length) {
            console.log(`[Agent Executor] Fehlerkorrektur erfolgreich: ${detectedErrors.length} → ${fixedErrors.length} Fehler`)
            return { content: fixResponse.content, files: fixedFiles }
          }
        }
      }

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
            let result = await executeAgent(agentType, userRequest, previousOutput)
            const duration = ((Date.now() - startTime) / 1000).toFixed(1)

            addLog({
              level: "debug",
              agent: agentType,
              message: `API-Antwort erhalten (${duration}s)`,
            })

            // NEUE INTELLIGENTE VALIDIERUNG mit Auto-Retry
            if (agentType === "coder") {
              // Hole deploymentTarget aus globalConfig (gleiche Methode wie in executeAgent)
              const deploymentTarget = (globalConfig as { deploymentTarget?: string }).deploymentTarget as DeploymentTarget || null
              const validation = validateAgentResult(agentType, result.content, result.files, deploymentTarget)
              
              addLog({
                level: "debug",
                agent: agentType,
                message: `Validierung: Score ${validation.score}/100, ${validation.criticalIssues.length} kritische Fehler`,
              })
              
              // Auto-Retry bei kritischen Fehlern
              if (validation.criticalIssues.length > 0 && RETRY_CONFIG.maxRetries > 0) {
                addLog({
                  level: "warn",
                  agent: agentType,
                  message: `⚠️ Kritische Fehler erkannt: ${validation.criticalIssues.join(", ")}`,
                })
                
                // Erstelle Korrektur-Prompt
                const correctionPrompt = `
⚠️ DEIN VORHERIGER CODE HAT KRITISCHE FEHLER!

FEHLER DIE DU BEHEBEN MUSST:
${validation.criticalIssues.map(e => `❌ ${e}`).join("\n")}
${validation.issues.length > 0 ? `\nWeitere Probleme:\n${validation.issues.map(e => `⚠️ ${e}`).join("\n")}` : ""}

KORRIGIERE DIESE FEHLER und generiere den Code NOCHMAL:
- JEDE Komponente in EIGENE Datei unter components/
- NUR EINE "export default" pro Datei
- Context/Provider in components/XContext.tsx
- "use client" bei Client-Komponenten

ORIGINAL-ANFRAGE: ${userRequest}
`
                addLog({
                  level: "info",
                  agent: agentType,
                  message: `🔄 Auto-Korrektur gestartet...`,
                })
                
                // Retry mit Korrektur-Prompt
                const retryResult = await executeAgent(agentType, correctionPrompt, result.content)
                
                // Validiere Retry-Ergebnis
                const retryValidation = validateAgentResult(agentType, retryResult.content, retryResult.files, deploymentTarget)
                
                if (retryValidation.score > validation.score) {
                  addLog({
                    level: "info",
                    agent: agentType,
                    message: `✅ Auto-Korrektur erfolgreich! Score: ${validation.score} → ${retryValidation.score}`,
                  })
                  result = retryResult
                } else {
                  addLog({
                    level: "warn",
                    agent: agentType,
                    message: `Auto-Korrektur nicht besser, verwende Original`,
                  })
                }
              } else if (validation.issues.length > 0) {
                addLog({
                  level: "info",
                  agent: agentType,
                  message: `ℹ️ Hinweise: ${validation.issues.slice(0, 3).join(", ")}`,
                })
              }
            }

            // Füge generierte Dateien hinzu oder aktualisiere bestehende
            if (result.files.length > 0) {
              const existingFiles = getFiles()
              for (const file of result.files) {
                // Prüfe ob Datei bereits existiert
                const existingFile = existingFiles.find(f => 
                  f.path === file.path || 
                  f.path.endsWith(file.path) || 
                  file.path.endsWith(f.path.split('/').pop() || '')
                )
                
                if (existingFile) {
                  // Aktualisiere bestehende Datei
                  updateFileByPath(existingFile.path, file.content)
                  addLog({
                    level: "info",
                    agent: agentType,
                    message: `Datei aktualisiert: ${existingFile.path}`,
                  })
                } else {
                  // Erstelle neue Datei
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
            const humanSummary = createHumanReadableSummary(agentType, result.content, result.files, duration, globalConfig.targetEnvironment)
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
        
        // Speichere Zustand in der Historie für Undo/Redo
        saveToHistory()
        
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
      saveToHistory,
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

  // Einzelnen Agent ausführen (für Workflow-Engine)
  const executeSingleAgent = useCallback(
    async (
      agentId: string,
      userRequest: string,
      previousOutput?: string
    ): Promise<string> => {
      const agentType = agentId as AgentType
      
      try {
        const result = await executeAgent(agentType, userRequest, previousOutput)
        
        // Füge generierte Dateien hinzu
        if (result.files.length > 0) {
          for (const file of result.files) {
            addFile({
              path: file.path,
              content: file.content,
              language: file.language,
              status: "created",
            })
          }
        }
        
        // Parse und füge Vorschläge hinzu (für Reviewer/Security Agents)
        if (agentType === "reviewer" || agentType === "security") {
          const existingFiles = getFiles()
          const suggestions = parseSuggestionsFromResponse(result.content, agentType, existingFiles)
          
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
            // Fallback: Erstelle generische Vorschläge aus der Antwort
            const hasImprovements = result.content.toLowerCase().includes("verbesser") || 
                                   result.content.toLowerCase().includes("empfehl") ||
                                   result.content.toLowerCase().includes("sollte") ||
                                   result.content.toLowerCase().includes("könnte") ||
                                   result.content.toLowerCase().includes("problem") ||
                                   result.content.toLowerCase().includes("fehler")
            
            if (hasImprovements) {
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
                  }
                }
              } else {
                addSuggestion({
                  agent: agentType,
                  type: "improvement",
                  title: `${agentType === 'reviewer' ? 'Code-Review' : 'Sicherheits'}-Empfehlungen`,
                  description: `Der ${agentType === 'reviewer' ? 'Reviewer' : 'Security'}-Agent hat Verbesserungsvorschläge erstellt.`,
                  affectedFiles: [],
                  suggestedChanges: [],
                  priority: "medium",
                })
              }
            }
          }
        }
        
        return result.content
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unbekannter Fehler"
        throw new Error(`Agent ${agentId} fehlgeschlagen: ${errMsg}`)
      }
    },
    [executeAgent, addFile, addSuggestion, getFiles, addLog]
  )

  // Funktion zum automatischen Umsetzen von Vorschlägen
  const applyAgentSuggestion = useCallback(
    async (suggestionId: string): Promise<{ success: boolean; message: string }> => {
      const { pendingSuggestions, approveSuggestion: markApproved, rejectSuggestion: markRejected, getFiles: getCurrentFiles } = useAgentStore.getState()
      
      const suggestion = pendingSuggestions.find(s => s.id === suggestionId)
      if (!suggestion) {
        return { success: false, message: "Vorschlag nicht gefunden" }
      }
      
      setIsProcessing(true)
      
      addLog({
        level: "info",
        agent: "system",
        message: `Setze Vorschlag um: ${suggestion.title}`,
      })
      
      try {
        // Wenn der Vorschlag bereits konkrete Änderungen hat, wende sie direkt an
        if (suggestion.suggestedChanges && suggestion.suggestedChanges.length > 0) {
          for (const change of suggestion.suggestedChanges) {
            if (change.filePath && change.newContent) {
              updateFileByPath(change.filePath, change.newContent, "typescript")
              addLog({
                level: "info",
                agent: "coder",
                message: `Datei aktualisiert: ${change.filePath}`,
              })
            }
          }
          
          markApproved(suggestionId)
          addMessage({
            role: "assistant",
            content: `✅ **Vorschlag umgesetzt:** ${suggestion.title}\n\nGeänderte Dateien:\n${suggestion.suggestedChanges.map(c => `- ${c.filePath}`).join("\n")}`,
            agent: "coder",
          })
          
          setIsProcessing(false)
          return { success: true, message: "Vorschlag erfolgreich umgesetzt" }
        }
        
        // Sonst: Lass den Coder-Agent den Vorschlag umsetzen
        const currentFiles = getCurrentFiles()
        const filesContext = currentFiles.map(f => 
          `**${f.path}:**\n\`\`\`${f.language}\n${f.content}\n\`\`\``
        ).join("\n\n")
        
        const implementPrompt = `## AUFGABE: Setze den folgenden Verbesserungsvorschlag um

**Vorschlag von ${suggestion.agent}:**
- Titel: ${suggestion.title}
- Beschreibung: ${suggestion.description}
- Priorität: ${suggestion.priority}
- Betroffene Dateien: ${suggestion.affectedFiles.join(", ") || "nicht spezifiziert"}

## AKTUELLER CODE:
${filesContext}

## ANWEISUNGEN:
1. Analysiere den Vorschlag und den aktuellen Code
2. Implementiere die vorgeschlagene Verbesserung
3. Gib den VOLLSTÄNDIGEN aktualisierten Code aus
4. Behalte alle anderen Funktionen bei

Setze den Vorschlag jetzt um:`

        const result = await executeAgent("coder" as AgentType, implementPrompt)
        
        if (result.files.length > 0) {
          for (const file of result.files) {
            updateFileByPath(file.path, file.content, file.language)
            addLog({
              level: "info",
              agent: "coder",
              message: `Datei aktualisiert: ${file.path}`,
            })
          }
          
          markApproved(suggestionId)
          addMessage({
            role: "assistant",
            content: `✅ **Vorschlag umgesetzt:** ${suggestion.title}\n\nGeänderte Dateien:\n${result.files.map(f => `- ${f.path}`).join("\n")}`,
            agent: "coder",
          })
          
          setIsProcessing(false)
          return { success: true, message: "Vorschlag erfolgreich umgesetzt" }
        } else {
          setIsProcessing(false)
          return { success: false, message: "Keine Änderungen generiert" }
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unbekannter Fehler"
        markRejected(suggestionId)
        addLog({
          level: "error",
          agent: "system",
          message: `Fehler beim Umsetzen des Vorschlags: ${errMsg}`,
        })
        setIsProcessing(false)
        return { success: false, message: errMsg }
      }
    },
    [executeAgent, updateFileByPath, addMessage, addLog, setIsProcessing]
  )

  // Funktion zur Code-Validierung vor Ausführung
  const validateCode = useCallback(
    async (): Promise<{ isValid: boolean; issues: string[] }> => {
      const currentFiles = getFiles()
      const issues: string[] = []
      
      if (currentFiles.length === 0) {
        return { isValid: false, issues: ["Keine Dateien zum Validieren vorhanden"] }
      }
      
      addLog({
        level: "info",
        agent: "system",
        message: "Starte Code-Validierung...",
      })
      
      for (const file of currentFiles) {
        // Basis-Validierungen
        if (!file.content || file.content.trim().length === 0) {
          issues.push(`${file.path}: Datei ist leer`)
          continue
        }
        
        // React/TypeScript spezifische Prüfungen
        if (file.path.endsWith(".tsx") || file.path.endsWith(".jsx") || file.path.endsWith(".ts") || file.path.endsWith(".js")) {
          // Prüfe auf häufige Syntaxfehler
          const openBraces = (file.content.match(/{/g) || []).length
          const closeBraces = (file.content.match(/}/g) || []).length
          if (openBraces !== closeBraces) {
            issues.push(`${file.path}: Ungleiche Anzahl von { } (${openBraces} vs ${closeBraces})`)
          }
          
          const openParens = (file.content.match(/\(/g) || []).length
          const closeParens = (file.content.match(/\)/g) || []).length
          if (openParens !== closeParens) {
            issues.push(`${file.path}: Ungleiche Anzahl von ( ) (${openParens} vs ${closeParens})`)
          }
          
          // Prüfe auf fehlende React-Imports
          if ((file.content.includes("useState") || file.content.includes("useEffect")) && 
              !file.content.includes("import") && !file.content.includes("React")) {
            issues.push(`${file.path}: React Hooks verwendet aber kein Import gefunden`)
          }
          
          // Prüfe auf unvollständigen Code
          if (file.content.includes("// TODO") || file.content.includes("// ...") || file.content.includes("/* ... */")) {
            issues.push(`${file.path}: Enthält unvollständigen Code (TODO oder ...)`)
          }
          
          // Prüfe auf export default in App-Komponente
          if (file.path.includes("App") && !file.content.includes("export default")) {
            issues.push(`${file.path}: App-Komponente hat keinen 'export default'`)
          }
        }
        
        // JSON Validierung
        if (file.path.endsWith(".json")) {
          try {
            JSON.parse(file.content)
          } catch {
            issues.push(`${file.path}: Ungültiges JSON`)
          }
        }
      }
      
      const isValid = issues.length === 0
      
      addLog({
        level: isValid ? "info" : "warn",
        agent: "system",
        message: isValid ? "Code-Validierung erfolgreich" : `${issues.length} Probleme gefunden`,
      })
      
      return { isValid, issues }
    },
    [getFiles, addLog]
  )

  // Funktion zum Ausführen eines spezifischen Marketplace-Agents
  const executeMarketplaceAgent = useCallback(
    async (agentId: string, userRequest: string): Promise<{ content: string; files: ParsedCodeFile[] }> => {
      const marketplaceAgent = marketplaceAgents.find(a => a.id === agentId)
      if (!marketplaceAgent) {
        throw new Error(`Marketplace Agent "${agentId}" nicht gefunden`)
      }
      
      addLog({
        level: "info",
        agent: agentId as AgentType,
        message: `${marketplaceAgent.name} gestartet`,
      })
      
      addMessage({
        role: "assistant",
        content: `🤖 **${marketplaceAgent.name}** wird ausgeführt...`,
        agent: agentId as AgentType,
      })
      
      const startTime = Date.now()
      const result = await executeAgent(agentId as AgentType, userRequest)
      const duration = ((Date.now() - startTime) / 1000).toFixed(1)
      
      // Generiere Zusammenfassung
      const summary = createHumanReadableSummary(agentId as AgentType, result.content, result.files, duration, globalConfig.targetEnvironment)
      
      addMessage({
        role: "assistant",
        content: summary,
        agent: agentId as AgentType,
      })
      
      // Füge Dateien hinzu
      if (result.files.length > 0) {
        for (const file of result.files) {
          addFile({
            path: file.path,
            content: file.content,
            language: file.language,
            status: "created",
          })
        }
      }
      
      addLog({
        level: "info",
        agent: agentId as AgentType,
        message: `${marketplaceAgent.name} abgeschlossen (${duration}s)`,
      })
      
      return result
    },
    [executeAgent, addMessage, addLog, addFile]
  )

  return { 
    executeWorkflow, 
    fixErrors, 
    executeSingleAgent, 
    applyAgentSuggestion, 
    validateCode,
    executeMarketplaceAgent,
  }
}
