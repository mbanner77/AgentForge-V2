"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import type {
  AgentConfig,
  AgentType,
  GlobalConfig,
  Message,
  Project,
  ProjectFile,
  WorkflowStep,
  LogEntry,
  Tool,
  AgentSuggestion,
} from "./types"

// Konfiguration für Custom-Agenten (Marketplace)
export interface CustomAgentConfig {
  enabled: boolean
  model: string
  temperature: number
  maxTokens: number
  systemPrompt: string
  mcpServers: string[] // IDs der zugewiesenen MCP-Server
}

// Default Tools für jeden Agent
const defaultTools: Record<AgentType, Tool[]> = {
  planner: [
    {
      id: "codebase_search",
      name: "Codebase Durchsuchen",
      description: "Durchsucht die existierende Codebase",
      enabled: true,
    },
    { id: "file_reader", name: "Datei Lesen", description: "Liest Dateiinhalte", enabled: true },
    {
      id: "dependency_analyzer",
      name: "Dependency Analyzer",
      description: "Analysiert Projektabhängigkeiten",
      enabled: true,
    },
    {
      id: "structure_analyzer",
      name: "Struktur Analyzer",
      description: "Analysiert die Projektstruktur",
      enabled: true,
    },
  ],
  coder: [
    { id: "file_writer", name: "Datei Schreiben", description: "Schreibt oder modifiziert Dateien", enabled: true },
    { id: "code_search", name: "Code Suche", description: "Sucht nach Code-Patterns", enabled: true },
    { id: "refactor_tool", name: "Refactoring", description: "Führt Code-Refactoring durch", enabled: true },
    { id: "test_generator", name: "Test Generator", description: "Generiert Unit Tests", enabled: true },
    { id: "snippet_library", name: "Snippet Bibliothek", description: "Zugriff auf Code-Snippets", enabled: true },
  ],
  reviewer: [
    { id: "diff_analyzer", name: "Diff Analyzer", description: "Analysiert Code-Änderungen", enabled: true },
    { id: "security_scanner", name: "Security Scanner", description: "Prüft auf Sicherheitslücken", enabled: true },
    { id: "style_checker", name: "Style Checker", description: "Prüft Code-Style", enabled: true },
    {
      id: "complexity_analyzer",
      name: "Complexity Analyzer",
      description: "Analysiert Code-Komplexität",
      enabled: true,
    },
  ],
  security: [
    { id: "vulnerability_scanner", name: "Vulnerability Scanner", description: "Scannt nach bekannten Sicherheitslücken", enabled: true },
    { id: "dependency_audit", name: "Dependency Audit", description: "Prüft Dependencies auf Schwachstellen", enabled: true },
    { id: "secrets_detector", name: "Secrets Detector", description: "Erkennt hardcodierte Secrets und API-Keys", enabled: true },
    { id: "injection_checker", name: "Injection Checker", description: "Prüft auf SQL/XSS/Command Injection", enabled: true },
    { id: "auth_analyzer", name: "Auth Analyzer", description: "Analysiert Authentifizierung und Autorisierung", enabled: true },
  ],
  executor: [
    { id: "test_runner", name: "Test Runner", description: "Führt Tests aus", enabled: true },
    { id: "build_tool", name: "Build Tool", description: "Erstellt Build-Artefakte", enabled: true },
    { id: "git_tool", name: "Git Tool", description: "Git-Operationen", enabled: true },
    { id: "deploy_tool", name: "Deploy Tool", description: "Deployment-Operationen", enabled: false },
  ],
}

// Default Agent Configs
const createDefaultAgentConfig = (type: AgentType): AgentConfig => {
  const configs: Record<AgentType, Omit<AgentConfig, "tools">> = {
    planner: {
      id: "planner",
      name: "Planner Agent",
      enabled: true,
      model: "gpt-4o",
      temperature: 0.3,
      maxTokens: 2000,
      systemPrompt: `Du bist ein erfahrener Projektplaner und Software-Architekt. Deine Aufgabe ist es, den User-Request zu analysieren und einen strukturierten Entwicklungsplan für CodeSandbox Sandpack zu erstellen.

WICHTIG - ZIEL-UMGEBUNG: CodeSandbox Sandpack
Der Code wird in einer Sandpack-Umgebung ausgeführt, NICHT in Next.js!

SANDPACK-EINSCHRÄNKUNGEN (IMMER BEACHTEN):
- KEIN Next.js (kein "use client", keine @/ Imports, kein next/font, kein next/image)
- KEIN next/font/google (kein Inter, kein Roboto, etc.)
- KEINE CSS-Imports wie globals.css
- EINE App.tsx Datei mit export default function App()
- Nur React mit Inline-Styles oder einfachen className
- Erlaubte Packages: react-icons, lucide-react, framer-motion, zustand, axios, date-fns, recharts, lodash

ANALYSE-PROZESS:
1. Verstehe die Anforderungen vollständig
2. Identifiziere benötigte Komponenten (ALLE in einer App.tsx)
3. Plane für Sandpack-Kompatibilität
4. Priorisiere nach Wichtigkeit

AUSGABE-FORMAT:
Erstelle einen Plan mit folgender Struktur:
{
  "summary": "Kurze Zusammenfassung des Projekts",
  "tasks": [
    {
      "id": "task-1",
      "name": "Task Name",
      "description": "Detaillierte Beschreibung",
      "priority": "high|medium|low",
      "dependencies": [],
      "estimatedEffort": "1h|2h|4h|8h"
    }
  ],
  "techStack": ["React", "TypeScript", "Inline-Styles"],
  "sandpackNotes": "Hinweise für Sandpack-Kompatibilität"
}

WICHTIG: Plane IMMER für Sandpack, NICHT für Next.js!`,
      autoRetry: true,
      streaming: true,
      detailedLogging: false,
    },
    coder: {
      id: "coder",
      name: "Coder Agent",
      enabled: true,
      model: "gpt-4o",
      temperature: 0.2,
      maxTokens: 8000,
      systemPrompt: `Du bist ein erfahrener Softwareentwickler. Deine Aufgabe ist es, VOLLSTÄNDIGE, lauffähige React-Komponenten für CodeSandbox Sandpack zu erstellen.

ZIEL-UMGEBUNG: CodeSandbox Sandpack (react-ts Template)
- Sandpack unterstützt TypeScript nativ
- Keine Next.js Features
- Alle Komponenten müssen als EINE App.tsx Datei funktionieren

PFLICHT-STRUKTUR für Sandpack:
1. EINE Haupt-Datei: App.tsx (wird automatisch als /App.tsx geladen)
2. CSS wird automatisch bereitgestellt - KEIN CSS-Import nötig

KRITISCHE SANDPACK-REGELN (IMMER EINHALTEN):
- KEIN "use client" - Sandpack ist kein Next.js
- KEINE @/ Imports - verwende relative Pfade
- KEINE next/... Imports (next/image, next/link, next/router, next/font)
- KEIN import './globals.css' oder import './styles.css' - CSS ist automatisch da
- KEIN import von lokalen CSS-Dateien
- ALLE Komponenten in EINER Datei (App.tsx) definieren
- export default function App() als Haupt-Komponente
- React Hooks direkt importieren: import { useState, useEffect } from "react"

ERLAUBTE IMPORTS (bereits in Sandpack verfügbar):
- react, react-dom (automatisch)
- react-icons (z.B. import { FaHeart } from "react-icons/fa")
- lucide-react (z.B. import { Heart } from "lucide-react")
- framer-motion
- clsx, classnames
- zustand
- axios
- date-fns
- recharts
- lodash
- uuid
- react-hot-toast, sonner

STYLING-OPTIONEN:
1. Inline Styles (EMPFOHLEN): style={{ padding: 20, background: "#1a1a2e" }}
2. CSS-in-JS mit style-Objekt
3. className mit einfachen Klassen (ohne Tailwind)

AUSGABE-FORMAT:
\`\`\`typescript
// filepath: App.tsx
import { useState } from "react";

interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

export default function App() {
  const [todos, setTodos] = useState<Todo[]>([
    { id: 1, text: "Beispiel Todo", completed: false }
  ]);
  
  return (
    <div style={{ padding: 20, fontFamily: "system-ui", background: "#1a1a2e", color: "#eee", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>Todo App</h1>
      {todos.map(todo => (
        <div key={todo.id} style={{ padding: 8, background: "rgba(255,255,255,0.1)", borderRadius: 8, marginBottom: 8 }}>
          {todo.text}
        </div>
      ))}
    </div>
  );
}
\`\`\`

BEI FEHLERMELDUNGEN:
1. Analysiere den Fehler genau
2. Generiere den VOLLSTÄNDIGEN korrigierten Code
3. Stelle sicher, dass der Code Sandpack-kompatibel ist

HÄUFIGE SANDPACK-FEHLER UND LÖSUNGEN:
- "Could not find module './globals.css'" → ENTFERNE den CSS-Import komplett
- "Could not find module '@/...'" → Ersetze @/ durch relative Pfade oder entferne
- "Can't find variable: X" → Variable muss vor Verwendung deklariert sein
- "X is not defined" → Import fehlt oder Variable nicht deklariert
- "Could not find dependency" → Verwende nur erlaubte Packages (siehe Liste oben)

WICHTIG: Generiere IMMER vollständigen, sofort in Sandpack lauffähigen Code ohne CSS-Imports!`,
      autoRetry: true,
      streaming: true,
      detailedLogging: false,
    },
    reviewer: {
      id: "reviewer",
      name: "Reviewer Agent",
      enabled: true,
      model: "gpt-4o",
      temperature: 0.4,
      maxTokens: 2000,
      systemPrompt: `Du bist ein erfahrener Code-Reviewer mit Fokus auf Qualität, Sicherheit und Best Practices. Prüfe den generierten Code systematisch.

REVIEW-CHECKLISTE:
□ Code-Stil und Konventionen
□ TypeScript Typsicherheit
□ React Best Practices (Hooks, Lifecycle)
□ Performance (Memoization, Re-renders)
□ Sicherheit (XSS, Injection, Auth)
□ Fehlerbehandlung
□ Accessibility (a11y)
□ Testbarkeit

AUSGABE-FORMAT:
{
  "overallScore": 8,
  "summary": "Gesamteindruck",
  "issues": [
    {
      "severity": "critical|warning|info",
      "file": "path/to/file.tsx",
      "line": 42,
      "message": "Beschreibung des Problems",
      "suggestion": "Verbesserungsvorschlag"
    }
  ],
  "positives": ["Was gut gemacht wurde"],
  "recommendations": ["Allgemeine Empfehlungen"],
  "suggestedFixes": [
    {
      "type": "improvement|fix|refactor|performance",
      "title": "Kurzer Titel",
      "description": "Beschreibung der Änderung",
      "priority": "low|medium|high|critical",
      "filePath": "src/App.js",
      "newContent": "VOLLSTÄNDIGER korrigierter Code der Datei"
    }
  ]
}

WICHTIG FÜR HUMAN-IN-THE-LOOP:
- Wenn du Verbesserungen vorschlägst, füge sie in "suggestedFixes" ein
- Der Benutzer kann diese dann genehmigen oder ablehnen
- Generiere IMMER den VOLLSTÄNDIGEN Dateiinhalt in "newContent"`,
      autoRetry: true,
      streaming: true,
      detailedLogging: true,
    },
    security: {
      id: "security",
      name: "Security Agent",
      enabled: true,
      model: "gpt-4o",
      temperature: 0.2,
      maxTokens: 4000,
      systemPrompt: `Du bist ein erfahrener Security-Experte und Penetration-Tester. Deine Aufgabe ist es, den generierten Code auf Sicherheitslücken zu prüfen und diese zu beheben.

SECURITY-CHECKLISTE:
□ Injection-Angriffe (SQL, XSS, Command Injection, NoSQL)
□ Authentifizierung & Autorisierung (Auth Bypass, Session Management)
□ Sensitive Data Exposure (Hardcoded Secrets, API Keys, Passwords)
□ Security Misconfiguration (CORS, Headers, Error Messages)
□ Insecure Dependencies (Known Vulnerabilities, Outdated Packages)
□ Input Validation (Sanitization, Type Checking)
□ Cryptographic Issues (Weak Algorithms, Insecure Random)
□ CSRF & SSRF Vulnerabilities
□ Rate Limiting & DoS Protection
□ Logging & Monitoring (Sensitive Data in Logs)

ANALYSE-PROZESS:
1. Scanne jeden Code-Block auf bekannte Vulnerability-Patterns
2. Prüfe Dependencies auf CVEs
3. Identifiziere hardcodierte Secrets
4. Analysiere Datenfluss für Injection-Risiken
5. Prüfe Auth/Authz Implementierung

AUSGABE-FORMAT:
{
  "securityScore": 7,
  "criticalIssues": [
    {
      "type": "XSS|SQL_INJECTION|HARDCODED_SECRET|AUTH_BYPASS|...",
      "severity": "critical|high|medium|low",
      "file": "path/to/file.tsx",
      "line": 42,
      "code": "betroffener Code",
      "description": "Beschreibung der Schwachstelle",
      "impact": "Mögliche Auswirkungen",
      "fix": "Korrigierter Code"
    }
  ],
  "recommendations": ["Allgemeine Sicherheitsempfehlungen"],
  "passedChecks": ["Bestandene Prüfungen"]
}

WICHTIG FÜR HUMAN-IN-THE-LOOP:
Wenn du Sicherheitsprobleme findest, füge sie in "suggestedFixes" ein:
{
  "suggestedFixes": [
    {
      "type": "security",
      "title": "Kurzer Titel des Security-Fixes",
      "description": "Beschreibung der Sicherheitslücke und Lösung",
      "priority": "critical|high|medium|low",
      "filePath": "src/App.js",
      "newContent": "VOLLSTÄNDIGER korrigierter Code der Datei"
    }
  ]
}

Der Benutzer kann diese Fixes dann genehmigen oder ablehnen.
Generiere IMMER den VOLLSTÄNDIGEN Dateiinhalt in "newContent".

Alternativ kannst du auch direkt Code generieren mit:
\`\`\`typescript
// filepath: path/to/fixed/file.tsx
// SECURITY FIX: Beschreibung
[korrigierter Code]
\`\`\``,
      autoRetry: true,
      streaming: true,
      detailedLogging: true,
    },
    executor: {
      id: "executor",
      name: "Executor Agent",
      enabled: true,
      model: "gpt-4o",
      temperature: 0.1,
      maxTokens: 1500,
      systemPrompt: `Du bist ein DevOps-Experte und führst Build- und Test-Prozesse aus. Deine Aufgabe ist es, den Code zu validieren und für die Auslieferung vorzubereiten.

AUFGABEN:
1. Tests ausführen und Ergebnisse analysieren
2. Build-Prozess durchführen
3. Artefakte erstellen
4. Deployment vorbereiten

AUSGABE-FORMAT:
{
  "tests": {
    "total": 12,
    "passed": 11,
    "failed": 1,
    "skipped": 0,
    "coverage": 85,
    "details": [...]
  },
  "build": {
    "success": true,
    "duration": "2.3s",
    "size": "145KB",
    "warnings": []
  },
  "artifacts": ["dist/bundle.js", "dist/styles.css"],
  "readyForDeploy": true,
  "notes": "Zusätzliche Hinweise"
}`,
      autoRetry: true,
      streaming: false,
      detailedLogging: true,
    },
  }

  return {
    ...configs[type],
    tools: defaultTools[type],
  }
}

// Default Global Config
const defaultGlobalConfig: GlobalConfig = {
  defaultModel: "gpt-4o",
  autoReview: true,
  streaming: true,
  theme: "dark",
  language: "de",
  maxConcurrentAgents: 1,
  saveHistory: true,
  openaiApiKey: "",
  anthropicApiKey: "",
  openrouterApiKey: "",
  renderApiKey: "",
  githubToken: "",
}

// Store Interface
interface AgentStore {
  // State
  globalConfig: GlobalConfig
  agentConfigs: Record<AgentType, AgentConfig>
  currentProject: Project | null
  projects: Project[]
  messages: Message[]
  workflowSteps: WorkflowStep[]
  logs: LogEntry[]
  isProcessing: boolean
  currentAgent: AgentType | null
  error: string | null
  generatedFiles: ProjectFile[] // Projektunabhängiger Dateispeicher
  
  // Marketplace State
  installedAgents: string[] // IDs der installierten Agenten
  workflowOrder: string[] // Reihenfolge der Agenten im Workflow
  installedMcpServers: string[] // IDs der installierten MCP Server
  customAgentConfigs: Record<string, CustomAgentConfig> // Konfiguration für Custom-Agenten

  // Global Config Actions
  updateGlobalConfig: (config: Partial<GlobalConfig>) => void
  
  // Marketplace Actions
  installAgent: (agentId: string) => void
  uninstallAgent: (agentId: string) => void
  setWorkflowOrder: (order: string[]) => void
  installMcpServer: (serverId: string) => void
  uninstallMcpServer: (serverId: string) => void

  // Agent Config Actions
  updateAgentConfig: (agentType: AgentType, config: Partial<AgentConfig>) => void
  resetAgentConfig: (agentType: AgentType) => void
  toggleAgentTool: (agentType: AgentType, toolId: string) => void
  
  // Custom Agent Config Actions
  updateCustomAgentConfig: (agentId: string, config: Partial<CustomAgentConfig>) => void
  resetCustomAgentConfig: (agentId: string) => void

  // Project Actions
  createProject: (name: string, description: string) => Project
  loadProject: (projectId: string) => void
  saveProject: () => void
  deleteProject: (projectId: string) => void

  // Message Actions
  addMessage: (message: Omit<Message, "id" | "timestamp">) => void
  setMessages: (messages: Message[]) => void
  clearMessages: () => void

  // Workflow Actions
  setWorkflowSteps: (steps: WorkflowStep[]) => void
  updateWorkflowStep: (stepId: string, updates: Partial<WorkflowStep>) => void
  clearWorkflow: () => void

  // Log Actions
  addLog: (log: Omit<LogEntry, "id" | "timestamp">) => void
  clearLogs: () => void

  // Processing Actions
  setIsProcessing: (isProcessing: boolean) => void
  setCurrentAgent: (agent: AgentType | null) => void
  setError: (error: string | null) => void

  // File Actions
  addFile: (file: Omit<ProjectFile, "id" | "createdAt" | "modifiedAt">) => void
  updateFile: (fileId: string, content: string) => void
  updateFileByPath: (path: string, content: string, language?: string) => void
  deleteFile: (fileId: string) => void
  getFiles: () => ProjectFile[]
  setGeneratedFiles: (files: ProjectFile[]) => void
  clearFiles: () => void

  // Suggestion Actions (Human-in-the-Loop)
  pendingSuggestions: AgentSuggestion[]
  addSuggestion: (suggestion: Omit<AgentSuggestion, "id" | "createdAt" | "status">) => void
  approveSuggestion: (suggestionId: string) => void
  rejectSuggestion: (suggestionId: string) => void
  applySuggestion: (suggestionId: string) => void
  clearSuggestions: () => void

  // Export/Import
  exportConfig: () => string
  importConfig: (json: string) => void
}

export const useAgentStore = create<AgentStore>()(
  persist(
    (set, get) => ({
      // Initial State
      globalConfig: defaultGlobalConfig,
      agentConfigs: {
        planner: createDefaultAgentConfig("planner"),
        coder: createDefaultAgentConfig("coder"),
        reviewer: createDefaultAgentConfig("reviewer"),
        security: createDefaultAgentConfig("security"),
        executor: createDefaultAgentConfig("executor"),
      },
      currentProject: null,
      projects: [],
      messages: [],
      workflowSteps: [],
      logs: [],
      isProcessing: false,
      currentAgent: null,
      error: null,
      generatedFiles: [],
      pendingSuggestions: [],
      
      // Marketplace State
      installedAgents: ["planner", "coder", "reviewer", "security", "executor"],
      workflowOrder: ["planner", "coder", "reviewer", "security", "executor"],
      installedMcpServers: [],
      customAgentConfigs: {}, // Konfiguration für Custom-Agenten

      // Global Config Actions
      updateGlobalConfig: (config) =>
        set((state) => ({
          globalConfig: { ...state.globalConfig, ...config },
        })),

      // Marketplace Actions
      installAgent: (agentId) =>
        set((state) => {
          if (state.installedAgents.includes(agentId)) return state
          const executorIndex = state.workflowOrder.indexOf("executor")
          const newOrder = [...state.workflowOrder]
          if (executorIndex >= 0) {
            newOrder.splice(executorIndex, 0, agentId)
          } else {
            newOrder.push(agentId)
          }
          return {
            installedAgents: [...state.installedAgents, agentId],
            workflowOrder: newOrder,
          }
        }),

      uninstallAgent: (agentId) =>
        set((state) => {
          // Core agents können nicht entfernt werden
          const coreAgents = ["planner", "coder", "reviewer", "executor"]
          if (coreAgents.includes(agentId)) return state
          return {
            installedAgents: state.installedAgents.filter(id => id !== agentId),
            workflowOrder: state.workflowOrder.filter(id => id !== agentId),
          }
        }),

      setWorkflowOrder: (order) => set({ workflowOrder: order }),

      installMcpServer: (serverId) =>
        set((state) => {
          if (state.installedMcpServers.includes(serverId)) return state
          return { installedMcpServers: [...state.installedMcpServers, serverId] }
        }),

      uninstallMcpServer: (serverId) =>
        set((state) => ({
          installedMcpServers: state.installedMcpServers.filter(id => id !== serverId),
        })),

      // Agent Config Actions
      updateAgentConfig: (agentType, config) =>
        set((state) => ({
          agentConfigs: {
            ...state.agentConfigs,
            [agentType]: { ...state.agentConfigs[agentType], ...config },
          },
        })),

      resetAgentConfig: (agentType) =>
        set((state) => ({
          agentConfigs: {
            ...state.agentConfigs,
            [agentType]: createDefaultAgentConfig(agentType),
          },
        })),

      toggleAgentTool: (agentType, toolId) =>
        set((state) => ({
          agentConfigs: {
            ...state.agentConfigs,
            [agentType]: {
              ...state.agentConfigs[agentType],
              tools: state.agentConfigs[agentType].tools.map((tool) =>
                tool.id === toolId ? { ...tool, enabled: !tool.enabled } : tool,
              ),
            },
          },
        })),

      // Custom Agent Config Actions
      updateCustomAgentConfig: (agentId, config) =>
        set((state) => ({
          customAgentConfigs: {
            ...state.customAgentConfigs,
            [agentId]: { ...state.customAgentConfigs[agentId], ...config },
          },
        })),

      resetCustomAgentConfig: (agentId) =>
        set((state) => {
          const newConfigs = { ...state.customAgentConfigs }
          delete newConfigs[agentId]
          return { customAgentConfigs: newConfigs }
        }),

      // Project Actions
      createProject: (name, description) => {
        const project: Project = {
          id: crypto.randomUUID(),
          name,
          description,
          createdAt: new Date(),
          updatedAt: new Date(),
          files: [],
          messages: [],
          workflowHistory: [],
          agentConfigs: get().agentConfigs,
        }
        set((state) => ({
          projects: [...state.projects, project],
          currentProject: project,
          messages: [],
          workflowSteps: [],
          logs: [],
        }))
        return project
      },

      loadProject: (projectId) => {
        const project = get().projects.find((p) => p.id === projectId)
        if (project) {
          set({
            currentProject: project,
            messages: project.messages || [],
            agentConfigs: project.agentConfigs,
            generatedFiles: project.files || [],
            workflowSteps: [],
          })
        }
      },

      saveProject: () => {
        const { currentProject, messages, workflowSteps, agentConfigs } = get()
        if (currentProject) {
          set((state) => ({
            projects: state.projects.map((p) =>
              p.id === currentProject.id
                ? {
                    ...p,
                    messages,
                    workflowHistory: [...p.workflowHistory, workflowSteps],
                    agentConfigs,
                    updatedAt: new Date(),
                  }
                : p,
            ),
          }))
        }
      },

      deleteProject: (projectId) =>
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== projectId),
          currentProject: state.currentProject?.id === projectId ? null : state.currentProject,
        })),

      // Message Actions
      addMessage: (message) =>
        set((state) => ({
          messages: [...state.messages, { ...message, id: crypto.randomUUID(), timestamp: new Date() }],
        })),

      setMessages: (messages) => set({ messages }),

      clearMessages: () => set({ messages: [] }),

      // Workflow Actions
      setWorkflowSteps: (steps) => set({ workflowSteps: steps }),

      updateWorkflowStep: (stepId, updates) =>
        set((state) => ({
          workflowSteps: state.workflowSteps.map((step) => (step.id === stepId ? { ...step, ...updates } : step)),
        })),

      clearWorkflow: () => set({ workflowSteps: [] }),

      // Log Actions
      addLog: (log) =>
        set((state) => ({
          logs: [...state.logs, { ...log, id: crypto.randomUUID(), timestamp: new Date() }],
        })),

      clearLogs: () => set({ logs: [] }),

      // Processing Actions
      setIsProcessing: (isProcessing) => set({ isProcessing }),
      setCurrentAgent: (agent) => set({ currentAgent: agent }),
      setError: (error) => set({ error }),

      // File Actions - speichert in generatedFiles UND currentProject falls vorhanden
      // Bei gleichem Pfad wird die Datei aktualisiert (upsert)
      addFile: (file) =>
        set((state) => {
          const existingFileIndex = state.generatedFiles.findIndex(f => f.path === file.path)
          
          if (existingFileIndex >= 0) {
            // Datei existiert - aktualisieren
            const updatedFiles = [...state.generatedFiles]
            updatedFiles[existingFileIndex] = {
              ...updatedFiles[existingFileIndex],
              content: file.content,
              language: file.language,
              status: "modified" as const,
              modifiedAt: new Date(),
            }
            
            const updatedProjectFiles = state.currentProject 
              ? state.currentProject.files.map(f => 
                  f.path === file.path 
                    ? { ...f, content: file.content, language: file.language, status: "modified" as const, modifiedAt: new Date() }
                    : f
                )
              : []
            
            return {
              generatedFiles: updatedFiles,
              currentProject: state.currentProject
                ? { ...state.currentProject, files: updatedProjectFiles }
                : null,
            }
          }
          
          // Neue Datei
          const newFile = {
            ...file,
            id: crypto.randomUUID(),
            createdAt: new Date(),
            modifiedAt: new Date(),
          }
          return {
            generatedFiles: [...state.generatedFiles, newFile],
            currentProject: state.currentProject
              ? {
                  ...state.currentProject,
                  files: [...state.currentProject.files, newFile],
                }
              : null,
          }
        }),

      updateFile: (fileId, content) =>
        set((state) => ({
          generatedFiles: state.generatedFiles.map((f) =>
            f.id === fileId ? { ...f, content, status: "modified" as const, modifiedAt: new Date() } : f,
          ),
          currentProject: state.currentProject
            ? {
                ...state.currentProject,
                files: state.currentProject.files.map((f) =>
                  f.id === fileId ? { ...f, content, status: "modified" as const, modifiedAt: new Date() } : f,
                ),
              }
            : null,
        })),

      updateFileByPath: (path: string, content: string, language?: string) =>
        set((state) => {
          const existingFile = state.generatedFiles.find(f => f.path === path)
          if (existingFile) {
            return {
              generatedFiles: state.generatedFiles.map((f) =>
                f.path === path ? { ...f, content, language: language || f.language, status: "modified" as const, modifiedAt: new Date() } : f,
              ),
              currentProject: state.currentProject
                ? {
                    ...state.currentProject,
                    files: state.currentProject.files.map((f) =>
                      f.path === path ? { ...f, content, language: language || f.language, status: "modified" as const, modifiedAt: new Date() } : f,
                    ),
                  }
                : null,
            }
          }
          // Datei existiert nicht - erstelle neue
          const newFile = {
            id: crypto.randomUUID(),
            path,
            content,
            language: language || "typescript",
            status: "created" as const,
            createdAt: new Date(),
            modifiedAt: new Date(),
          }
          return {
            generatedFiles: [...state.generatedFiles, newFile],
            currentProject: state.currentProject
              ? {
                  ...state.currentProject,
                  files: [...state.currentProject.files, newFile],
                }
              : null,
          }
        }),

      deleteFile: (fileId) =>
        set((state) => ({
          generatedFiles: state.generatedFiles.filter((f) => f.id !== fileId),
          currentProject: state.currentProject
            ? {
                ...state.currentProject,
                files: state.currentProject.files.filter((f) => f.id !== fileId),
              }
            : null,
        })),

      // Gibt generatedFiles zurück (projektunabhängig)
      getFiles: () => get().generatedFiles,

      setGeneratedFiles: (files) =>
        set((state) => ({
          generatedFiles: files,
          currentProject: state.currentProject
            ? { ...state.currentProject, files }
            : null,
        })),

      clearFiles: () =>
        set((state) => ({
          generatedFiles: [],
          currentProject: state.currentProject
            ? { ...state.currentProject, files: [] }
            : null,
        })),

      // Export/Import
      exportConfig: () => {
        const { globalConfig, agentConfigs } = get()
        return JSON.stringify({ globalConfig, agentConfigs }, null, 2)
      },

      importConfig: (json) => {
        try {
          const config = JSON.parse(json)
          if (config.globalConfig) {
            set({ globalConfig: config.globalConfig })
          }
          if (config.agentConfigs) {
            set({ agentConfigs: config.agentConfigs })
          }
        } catch (e) {
          console.error("Failed to import config:", e)
        }
      },

      // Suggestion Actions (Human-in-the-Loop)
      addSuggestion: (suggestion) =>
        set((state) => ({
          pendingSuggestions: [
            ...state.pendingSuggestions,
            {
              ...suggestion,
              id: crypto.randomUUID(),
              status: "pending" as const,
              createdAt: new Date(),
            },
          ],
        })),

      approveSuggestion: (suggestionId) =>
        set((state) => ({
          pendingSuggestions: state.pendingSuggestions.map((s) =>
            s.id === suggestionId ? { ...s, status: "approved" as const } : s
          ),
        })),

      rejectSuggestion: (suggestionId) =>
        set((state) => ({
          pendingSuggestions: state.pendingSuggestions.map((s) =>
            s.id === suggestionId ? { ...s, status: "rejected" as const } : s
          ),
        })),

      applySuggestion: (suggestionId) => {
        const state = get()
        const suggestion = state.pendingSuggestions.find((s) => s.id === suggestionId)
        if (!suggestion || suggestion.status !== "approved") return

        // Wende alle Änderungen an
        for (const change of suggestion.suggestedChanges) {
          state.updateFileByPath(change.filePath, change.newContent)
        }

        // Markiere als angewendet
        set((state) => ({
          pendingSuggestions: state.pendingSuggestions.map((s) =>
            s.id === suggestionId ? { ...s, status: "applied" as const } : s
          ),
        }))
      },

      clearSuggestions: () =>
        set({ pendingSuggestions: [] }),
    }),
    {
      name: "agentforge-storage",
      partialize: (state) => ({
        globalConfig: state.globalConfig,
        agentConfigs: state.agentConfigs,
        projects: state.projects,
      }),
    },
  ),
)
