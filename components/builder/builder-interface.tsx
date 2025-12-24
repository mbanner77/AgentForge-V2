"use client"

import { useEffect, useCallback } from "react"
import { BuilderChat } from "./builder-chat"
import { BuilderWorkflow } from "./builder-workflow"
import { BuilderOutput } from "./builder-output"
import { BuilderSidebar } from "./builder-sidebar"
import { Button } from "@/components/ui/button"
import { Bot, PanelLeft, Download, FolderOpen, Plus, Rocket, Github, Loader2, ExternalLink, LogOut, Settings, GripHorizontal, Database, GitBranch, Upload, Copy, History, FileText, Undo, Redo, Keyboard, Server, Building2, Code2 } from "lucide-react"
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"
import Link from "next/link"
import { useAgentStore } from "@/lib/agent-store"
import { useAgentExecutor } from "@/lib/agent-executor-real"
import { enhancePrompt, getProviderFromModel } from "@/lib/api-client"
import { usePersistence } from "@/lib/use-persistence"
import { useAuth } from "@/lib/auth"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { KnowledgeBaseDialog } from "@/components/knowledge-base-dialog"
import { WorkflowSelectorDialog } from "@/components/workflow-selector-dialog"
import { WorkflowExecutionView } from "@/components/workflow-execution-view"
import { ThemeToggle } from "@/components/theme-toggle"
import { useKeyboardShortcut, useGlobalKeyboardShortcuts, formatShortcut, DEFAULT_SHORTCUTS } from "@/lib/keyboard-shortcuts"
import type { WorkflowGraph } from "@/lib/types"

export function BuilderInterface() {
  // Initialize global keyboard shortcuts
  useGlobalKeyboardShortcuts()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowGraph | null>(null)
  const [workflowPrompt, setWorkflowPrompt] = useState<string | null>(null) // Chat-Auftrag für Workflow
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [projectName, setProjectName] = useState("")
  const [projectDescription, setProjectDescription] = useState("")
  const [deployDialogOpen, setDeployDialogOpen] = useState(false)
  const [repoName, setRepoName] = useState("")
  const [isDeploying, setIsDeploying] = useState(false)
  const [deployStep, setDeployStep] = useState<"idle" | "github" | "vercel" | "render" | "btp" | "done" | "error">("idle")
  const [deployResult, setDeployResult] = useState<{ repoUrl?: string; renderUrl?: string; btpUrl?: string; error?: string } | null>(null)
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false)
  const [deployTarget, setDeployTarget] = useState<"vercel" | "render" | "btp" | "github-only">("vercel")
  const [deployLogs, setDeployLogs] = useState<string[]>([])
  const [generatedBlueprint, setGeneratedBlueprint] = useState<string | null>(null)

  const { messages, workflowSteps, isProcessing, currentProject, addMessage, createProject, saveProject, getFiles, globalConfig, setWorkflowOrder, workflowOrder, undo, redo, canUndo, canRedo, saveToHistory } =
    useAgentStore()
  
  // Default workflow order für Reset
  const defaultWorkflowOrder = ["planner", "coder", "reviewer", "security", "executor"]

  // Handler für Workflow-Auswahl - aktualisiert auch die Sidebar
  const handleSelectWorkflow = useCallback((workflow: WorkflowGraph | null) => {
    setSelectedWorkflow(workflow)
    
    if (workflow) {
      // Extrahiere Agent-IDs aus den Workflow-Nodes in der richtigen Reihenfolge
      // Sortiere nach Y-Position für vertikale Workflows
      const agentNodes = workflow.nodes
        .filter(node => node.type === "agent" && node.data.agentId)
        .sort((a, b) => a.position.y - b.position.y)
      
      const agentIds = agentNodes
        .map(node => node.data.agentId)
        .filter((id): id is string => id !== undefined)
      
      if (agentIds.length > 0) {
        setWorkflowOrder(agentIds)
        toast.info(`Workflow "${workflow.name}" mit ${agentIds.length} Agenten geladen`)
      }
    } else {
      // Zurück zum Default-Workflow
      setWorkflowOrder(defaultWorkflowOrder)
    }
  }, [setWorkflowOrder, defaultWorkflowOrder])

  // Keyboard shortcuts
  useKeyboardShortcut(
    { key: "s", ctrl: true, description: "Projekt speichern" },
    () => { if (currentProject) saveProject(); toast.success("Projekt gespeichert") },
    [currentProject, saveProject]
  )
  
  useKeyboardShortcut(
    { key: "n", ctrl: true, description: "Neues Projekt" },
    () => setNewProjectOpen(true),
    []
  )
  
  useKeyboardShortcut(
    { key: "b", ctrl: true, description: "Sidebar umschalten" },
    () => setSidebarOpen(prev => !prev),
    []
  )
  
  useKeyboardShortcut(
    { key: "?", shift: true, description: "Tastenkürzel anzeigen" },
    () => setShortcutsDialogOpen(true),
    []
  )
  
  useKeyboardShortcut(
    { key: "z", ctrl: true, description: "Rückgängig" },
    () => { if (canUndo()) { undo(); toast.info("Änderung rückgängig gemacht") } },
    [canUndo, undo]
  )
  
  useKeyboardShortcut(
    { key: "y", ctrl: true, description: "Wiederholen" },
    () => { if (canRedo()) { redo(); toast.info("Änderung wiederhergestellt") } },
    [canRedo, redo]
  )

  const { executeWorkflow, fixErrors } = useAgentExecutor()
  const { isLoading, isSyncing, saveCurrentProject } = usePersistence()
  const { logout, currentUser } = useAuth()
  const router = useRouter()

  const handleLogout = () => {
    logout()
    router.push("/builder/login")
  }

  useEffect(() => {
    if (messages.length === 0) {
      addMessage({
        role: "assistant",
        content:
          "Willkommen bei AgentForge! Beschreibe mir, welche App du bauen möchtest, und ich werde die Agenten koordinieren, um sie für dich zu erstellen.\n\nDu kannst auch zuerst ein neues Projekt erstellen oder die Agenten in der Sidebar konfigurieren.",
        agent: "system",
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSendMessage = async (content: string) => {
    // Wenn ein Workflow ausgewählt ist, starte diesen mit dem Chat-Auftrag
    if (selectedWorkflow) {
      // Erst Prompt auf null setzen, dann neu setzen um useEffect zu triggern
      setWorkflowPrompt(null)
      addMessage({
        role: "user",
        content,
      })
      // Kurze Verzögerung damit State-Update durchläuft
      setTimeout(() => {
        setWorkflowPrompt(content)
      }, 50)
      return
    }
    
    // Prüfe ob bereits Dateien existieren - dann ist es eine Iteration
    const existingFiles = getFiles()
    const isIteration = existingFiles.length > 0
    
    // Prüfe ob die Nachricht eine Fehlermeldung ist
    const errorPatterns = [
      /error/i,
      /fehler/i,
      /cannot read/i,
      /is not defined/i,
      /unexpected token/i,
      /syntax error/i,
      /type assertion/i,
      /module not found/i,
      /can't find variable/i,
      /'\)' expected/i,
      /typeerror/i,
      /referenceerror/i,
    ]
    
    const isErrorMessage = existingFiles.length > 0 && errorPatterns.some(pattern => pattern.test(content))
    
    if (isErrorMessage) {
      // Bei Fehlermeldungen: Rufe fixErrors direkt auf
      await fixErrors(content, 3)
    } else {
      // Prompt Enhancement für neue Projekte (kurze Prompts < 100 Zeichen)
      let finalPrompt = content
      
      if (!isIteration && content.length < 100 && globalConfig.enablePromptEnhancement !== false) {
        // Bestimme API-Key und Provider
        const apiKey = globalConfig.openrouterApiKey || globalConfig.openaiApiKey || globalConfig.anthropicApiKey
        if (apiKey) {
          const provider = globalConfig.openrouterApiKey ? "openrouter" : 
                          globalConfig.openaiApiKey ? "openai" : "anthropic"
          try {
            toast.info("✨ Prompt wird optimiert...")
            const enhanced = await enhancePrompt(content, apiKey, provider)
            if (enhanced !== content && enhanced.length > content.length) {
              finalPrompt = enhanced
              toast.success("Prompt wurde verbessert")
              // Zeige dem User den verbesserten Prompt
              addMessage({
                role: "assistant",
                content: `✨ **Prompt optimiert:**\n\n${enhanced}`,
                agent: "system",
              })
            }
          } catch (error) {
            console.warn("Prompt Enhancement fehlgeschlagen:", error)
          }
        }
      }
      
      // Normaler Workflow mit (optional verbessertem) Prompt
      await executeWorkflow(finalPrompt, isIteration)
    }
  }

  const handleCreateProject = () => {
    if (projectName.trim()) {
      createProject(projectName, projectDescription)
      setNewProjectOpen(false)
      setProjectName("")
      setProjectDescription("")
    }
  }

  const handleExport = () => {
    const files = getFiles()
    if (files.length === 0) return

    // Erstelle ein vollständiges Projekt-Bundle als einzelne Datei
    // mit Anweisungen zum Setup
    const setupInstructions = `# ${currentProject?.name || "AgentForge Project"}

## Quick Start

1. Erstelle einen neuen Ordner und kopiere alle Dateien hinein
2. Führe aus: \`npm install\`
3. Starte mit: \`npm run dev\`
4. Öffne http://localhost:3000

## Deployment

### Vercel (empfohlen)
1. Pushe zu GitHub
2. Verbinde mit vercel.com
3. Deploy!

### Netlify
1. \`npm run build\`
2. Deploye den \`out\` oder \`.next\` Ordner

---

## Dateien:

`

    const content = setupInstructions + files.map((f) => `
### ${f.path}
\`\`\`${f.language}
${f.content}
\`\`\`
`).join("\n")

    const blob = new Blob([content], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${currentProject?.name || "project"}-bundle.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleOpenDeployDialog = () => {
    setRepoName(currentProject?.name?.toLowerCase().replace(/\s+/g, "-") || "agentforge-project")
    setDeployStep("idle")
    setDeployResult(null)
    setDeployLogs([])
    setGeneratedBlueprint(null)
    setDeployDialogOpen(true)
  }

  const handleDeploy = async () => {
    const files = getFiles()
    if (files.length === 0) {
      toast.error("Keine Dateien zum Deployen vorhanden")
      return
    }

    setIsDeploying(true)
    setDeployResult(null)
    setDeployLogs([])

    try {
      let repoUrl = ""
      
      // BTP Deployment - kein GitHub Repository nötig, direkt via CF CLI
      if (deployTarget === "btp") {
        setDeployStep("btp")
        setDeployLogs(prev => [...prev, "🚀 SAP BTP Deployment wird gestartet..."])
        
        // Validiere BTP Credentials
        if (!globalConfig.btpApiEndpoint || !globalConfig.btpOrg || !globalConfig.btpSpace) {
          setDeployLogs(prev => [...prev, "⚠️ BTP Credentials nicht konfiguriert"])
          setDeployLogs(prev => [...prev, "Bitte unter Settings → API Keys → SAP BTP Credentials konfigurieren"])
          setDeployStep("error")
          setDeployResult({ error: "BTP Credentials fehlen. Bitte in Settings konfigurieren." })
          setIsDeploying(false)
          return
        }
        
        const appName = repoName.toLowerCase().replace(/\s+/g, "-")
        
        // Generiere MTA Konfiguration
        setDeployLogs(prev => [...prev, "", "📦 Generiere MTA Konfiguration..."])
        const mtaRes = await fetch("/api/btp/deploy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "generate-mta",
            config: {
              appName,
              projectType: "fiori",
              useHANA: false,
            },
          }),
        })
        const mtaData = await mtaRes.json()
        
        if (mtaData.success && mtaData.files) {
          setGeneratedBlueprint(mtaData.files["mta.yaml"])
          setDeployLogs(prev => [...prev, "✓ mta.yaml generiert"])
          setDeployLogs(prev => [...prev, "✓ xs-security.json generiert"])
        }
        
        // Deploy zu BTP via API
        setDeployLogs(prev => [...prev, "", "☁️ Verbinde mit SAP BTP Cloud Foundry..."])
        setDeployLogs(prev => [...prev, `   API: ${globalConfig.btpApiEndpoint}`])
        setDeployLogs(prev => [...prev, `   Org: ${globalConfig.btpOrg}`])
        setDeployLogs(prev => [...prev, `   Space: ${globalConfig.btpSpace}`])
        
        const btpDeployRes = await fetch("/api/btp/deploy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "deploy",
            config: {
              appName,
              projectType: "fiori",
              credentials: {
                apiEndpoint: globalConfig.btpApiEndpoint,
                org: globalConfig.btpOrg,
                space: globalConfig.btpSpace,
                username: globalConfig.btpUsername,
                password: globalConfig.btpPassword,
              },
              // Sende generierte Dateien mit
              files: files.map(f => ({ path: f.path, content: f.content })),
            },
          }),
        })
        const btpData = await btpDeployRes.json()
        
        if (btpData.logs) {
          btpData.logs.forEach((log: string) => setDeployLogs(prev => [...prev, log]))
        }
        
        if (btpData.success) {
          setDeployResult({ btpUrl: btpData.appUrl })
          setDeployStep("done")
          toast.success("BTP Deployment erfolgreich!")
          
          addMessage({
            role: "assistant",
            content: `🚀 **SAP BTP Deployment erfolgreich!**\n\n**BTP App:** ${btpData.appUrl || "Wird bereitgestellt..."}\n\nDeine SAP Fiori App ist jetzt live auf der SAP Business Technology Platform!`,
            agent: "system",
          })
        } else {
          setDeployResult({ error: btpData.error || "BTP Deployment fehlgeschlagen" })
          setDeployStep("error")
          toast.error("BTP Deployment fehlgeschlagen")
        }
        
        setIsDeploying(false)
        return
      }
      
      // Für andere Targets: GitHub Repository erstellen
      setDeployStep("github")
      
      // 1. GitHub Repository erstellen oder vorhandenes nutzen
      if (globalConfig.githubToken) {
        const normalizedRepoName = repoName.toLowerCase().replace(/\s+/g, "-")
        
        // Hole GitHub Username
        const userRes = await fetch("https://api.github.com/user", {
          headers: {
            "Authorization": `Bearer ${globalConfig.githubToken}`,
            "Accept": "application/vnd.github.v3+json"
          }
        })
        if (!userRes.ok) throw new Error("GitHub User konnte nicht ermittelt werden")
        const userData = await userRes.json()
        const githubUsername = userData.login
        
        // Prüfe ob Repo bereits existiert
        setDeployLogs(prev => [...prev, `Prüfe ob Repository ${normalizedRepoName} existiert...`])
        const existingRepoRes = await fetch(`https://api.github.com/repos/${githubUsername}/${normalizedRepoName}`, {
          headers: {
            "Authorization": `Bearer ${globalConfig.githubToken}`,
            "Accept": "application/vnd.github.v3+json"
          }
        })
        
        let repo: { full_name: string; html_url: string }
        
        if (existingRepoRes.ok) {
          // Repo existiert bereits - nutze es
          repo = await existingRepoRes.json()
          setDeployLogs(prev => [...prev, `✓ Vorhandenes Repository gefunden: ${repo.html_url}`])
        } else {
          // Erstelle neues Repo
          setDeployLogs(prev => [...prev, "Erstelle neues GitHub Repository..."])
          const repoResponse = await fetch("https://api.github.com/user/repos", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${globalConfig.githubToken}`,
              "Content-Type": "application/json",
              "Accept": "application/vnd.github.v3+json"
            },
            body: JSON.stringify({
              name: normalizedRepoName,
              description: "Generated by AgentForge",
              private: false,
              auto_init: true
            })
          })

          if (!repoResponse.ok) {
            const error = await repoResponse.json()
            throw new Error(error.message || "GitHub Repository konnte nicht erstellt werden")
          }

          repo = await repoResponse.json()
          setDeployLogs(prev => [...prev, `✓ Repository erstellt: ${repo.html_url}`])
          
          // Warte kurz damit GitHub das Repo initialisiert
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
        
        repoUrl = repo.html_url
        
        // Hole den aktuellen HEAD commit
        const refRes = await fetch(`https://api.github.com/repos/${repo.full_name}/git/ref/heads/main`, {
          headers: {
            "Authorization": `Bearer ${globalConfig.githubToken}`,
            "Accept": "application/vnd.github.v3+json"
          }
        })
        if (!refRes.ok) {
          const refErr = await refRes.json()
          throw new Error(`Konnte HEAD nicht lesen: ${refErr.message || 'Unknown error'}`)
        }
        const refData = await refRes.json()
        const parentSha = refData.object.sha
        
        // Erstelle Projekt-Dateien (package.json, config, etc.)
        const projectFiles = [
          {
            path: "package.json",
            content: JSON.stringify({
              name: repoName.toLowerCase().replace(/\s+/g, "-"),
              version: "0.1.0",
              private: true,
              scripts: {
                dev: "next dev",
                build: "next build",
                start: "next start",
                lint: "next lint"
              },
              dependencies: {
                "next": "14.0.4",
                "react": "^18.2.0",
                "react-dom": "^18.2.0",
                "lucide-react": "^0.294.0",
                "date-fns": "^2.30.0"
              },
              devDependencies: {
                "@types/node": "^20",
                "@types/react": "^18",
                "@types/react-dom": "^18",
                "typescript": "^5"
              }
            }, null, 2)
          },
          {
            path: "next.config.js",
            content: `/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
}

module.exports = nextConfig`
          },
          {
            path: "tsconfig.json",
            content: JSON.stringify({
              compilerOptions: {
                target: "es5",
                lib: ["dom", "dom.iterable", "esnext"],
                allowJs: true,
                skipLibCheck: true,
                strict: false,
                noEmit: true,
                esModuleInterop: true,
                module: "esnext",
                moduleResolution: "bundler",
                resolveJsonModule: true,
                isolatedModules: true,
                jsx: "preserve",
                incremental: true,
                paths: { "@/*": ["./*"] }
              },
              include: ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
              exclude: ["node_modules"]
            }, null, 2)
          },
          {
            path: "next-env.d.ts",
            content: `/// <reference types="next" />
/// <reference types="next/image-types/global" />`
          },
          {
            path: "app/layout.tsx",
            content: `export const metadata = {
  title: '${repoName}',
  description: 'Generated by AgentForge',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  )
}`
          }
        ]
        
        // Filtere und transformiere generierte Dateien für Next.js
        const EXCLUDED_FILES = ['main.tsx', 'main.ts', 'index.tsx', 'index.ts', 'index.css', 'index.html', 'vite.config.ts', 'vite-env.d.ts']
        
        console.log("[Deploy] Verarbeite Dateien:", files.map(f => f.path))
        
        const filteredFiles = files
          .filter(f => {
            const fileName = f.path.split('/').pop() || ''
            return !EXCLUDED_FILES.includes(fileName)
          })
          .map(f => {
            let path = f.path.startsWith("/") ? f.path.slice(1) : f.path
            // Entferne src/ Prefix falls vorhanden
            if (path.startsWith("src/")) {
              path = path.slice(4)
            }
            // Bereinige Next.js inkompatiblen Code
            let content = f.content
            content = content.replace(/^["']use client["'];?\s*/gm, '')
            content = content.replace(/import\s+.*\s+from\s+["']react-dom\/client["'];?\s*/g, '')
            content = content.replace(/createRoot\(.*\)\.render\([\s\S]*?\);?/g, '')
            // Entferne metadata export (nicht erlaubt in "use client" Komponenten)
            content = content.replace(/export\s+const\s+metadata\s*:\s*Metadata\s*=\s*\{[\s\S]*?\};\s*/g, '')
            content = content.replace(/export\s+const\s+metadata\s*=\s*\{[\s\S]*?\};\s*/g, '')
            // Entferne Metadata type import
            content = content.replace(/import\s+type\s*\{\s*Metadata\s*\}\s*from\s+["']next["'];?\s*/g, '')
            content = content.replace(/import\s*\{\s*Metadata\s*\}\s*from\s+["']next["'];?\s*/g, '')
            // Entferne CSS imports (globals.css etc.)
            content = content.replace(/import\s+["'][^"']*\.css["'];?\s*/g, '')
            return { path, content }
          })
        
        console.log("[Deploy] Gefilterte Dateien:", filteredFiles.map(f => f.path))
        
        // Finde die Haupt-App-Komponente (verschiedene Möglichkeiten prüfen)
        let appFile = filteredFiles.find(f => {
          const fileName = f.path.split('/').pop() || ''
          return fileName === 'App.tsx' || fileName === 'App.jsx'
        })
        
        // Fallback: Suche nach page.tsx
        if (!appFile) {
          appFile = filteredFiles.find(f => {
            const fileName = f.path.split('/').pop() || ''
            return fileName === 'page.tsx' || fileName === 'page.jsx'
          })
        }
        
        // Fallback: Suche nach erster Datei mit export default
        if (!appFile) {
          appFile = filteredFiles.find(f => 
            (f.path.endsWith('.tsx') || f.path.endsWith('.jsx')) &&
            f.content.includes('export default')
          )
        }
        
        // Letzter Fallback: Erste tsx/jsx Datei
        if (!appFile) {
          appFile = filteredFiles.find(f => f.path.endsWith('.tsx') || f.path.endsWith('.jsx'))
        }
        
        console.log("[Deploy] Haupt-Komponente gefunden:", appFile?.path || "KEINE")
        
        // Erstelle app/page.tsx mit der Hauptkomponente
        let mainComponent: string
        if (appFile) {
          // Stelle sicher, dass export default vorhanden ist
          let content = appFile.content
          // Ersetze "export default function App" mit "export default function Page"
          content = content.replace(/export\s+default\s+function\s+App\s*\(/g, 'export default function Page(')
          // Falls kein default export, füge Wrapper hinzu
          if (!content.includes('export default')) {
            // Extrahiere Komponentenname aus dem Dateinamen
            const componentName = appFile.path.split('/').pop()?.replace(/\.(tsx|jsx)$/, '') || 'Component'
            content = `${content}

export default ${componentName};`
          }
          mainComponent = `"use client";

${content}`
        } else {
          mainComponent = `"use client";

export default function Page() {
  return (
    <div style={{ padding: 20, background: '#f5f5f5', minHeight: '100vh' }}>
      <h1>Keine Komponente gefunden</h1>
      <p>Bitte generiere eine React-Komponente mit export default.</p>
    </div>
  );
}`
        }
        
        // Transformiere restliche Dateien für components/
        const componentFiles = filteredFiles
          .filter(f => f !== appFile)
          .map(f => {
            let path = f.path
            // Komponenten kommen unter components/ wenn sie nicht schon dort sind
            if (!path.startsWith('components/') && !path.startsWith('app/') && !path.startsWith('lib/')) {
              if (path.endsWith('.tsx') || path.endsWith('.jsx')) {
                path = `components/${path}`
              }
            }
            return { path, content: f.content }
          })

        // Aktualisiere projectFiles um app/page.tsx einzufügen
        const pageFile = {
          path: "app/page.tsx",
          content: mainComponent
        }
        
        // Kombiniere Projekt-Dateien mit generierten Dateien
        const allFiles = [
          ...projectFiles,
          pageFile,
          ...componentFiles
        ]
        
        console.log("[Deploy] Finale Dateien für GitHub:", allFiles.map(f => f.path))
        
        // Erstelle Blobs für alle Dateien
        const blobs = await Promise.all(allFiles.map(async (file) => {
          // Verwende utf-8 Encoding statt base64 für bessere Kompatibilität
          const blobResponse = await fetch(`https://api.github.com/repos/${repo.full_name}/git/blobs`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${globalConfig.githubToken}`,
              "Content-Type": "application/json",
              "Accept": "application/vnd.github.v3+json"
            },
            body: JSON.stringify({
              content: file.content,
              encoding: "utf-8"
            })
          })
          if (!blobResponse.ok) {
            const blobError = await blobResponse.json()
            throw new Error(`Blob für ${file.path} konnte nicht erstellt werden: ${blobError.message || 'Unknown error'}`)
          }
          const blob = await blobResponse.json()
          return {
            path: file.path,
            mode: "100644",
            type: "blob",
            sha: blob.sha
          }
        }))

        // Erstelle Tree
        const treeResponse = await fetch(`https://api.github.com/repos/${repo.full_name}/git/trees`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${globalConfig.githubToken}`,
            "Content-Type": "application/json",
            "Accept": "application/vnd.github.v3+json"
          },
          body: JSON.stringify({ tree: blobs })
        })
        if (!treeResponse.ok) {
          const treeError = await treeResponse.json()
          throw new Error(`Git Tree konnte nicht erstellt werden: ${treeError.message || 'Unknown error'}`)
        }
        const tree = await treeResponse.json()

        // Erstelle Commit
        const commitResponse = await fetch(`https://api.github.com/repos/${repo.full_name}/git/commits`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${globalConfig.githubToken}`,
            "Content-Type": "application/json",
            "Accept": "application/vnd.github.v3+json"
          },
          body: JSON.stringify({
            message: "Initial commit from AgentForge",
            tree: tree.sha,
            parents: [parentSha]
          })
        })
        if (!commitResponse.ok) {
          const commitError = await commitResponse.json()
          throw new Error(`Commit konnte nicht erstellt werden: ${commitError.message || 'Unknown error'}`)
        }
        const commit = await commitResponse.json()

        // Update main branch reference
        const refResponse = await fetch(`https://api.github.com/repos/${repo.full_name}/git/refs/heads/main`, {
          method: "PATCH",
          headers: {
            "Authorization": `Bearer ${globalConfig.githubToken}`,
            "Content-Type": "application/json",
            "Accept": "application/vnd.github.v3+json"
          },
          body: JSON.stringify({
            sha: commit.sha,
            force: true
          })
        })
        
        if (!refResponse.ok) {
          const refError = await refResponse.json()
          console.error("Failed to create main branch:", refError)
          throw new Error(`Branch konnte nicht erstellt werden: ${refError.message || "Unknown error"}`)
        }

        setDeployResult({ repoUrl: repo.html_url })
        setDeployLogs(prev => [...prev, `✓ GitHub Repository erstellt: ${repo.html_url}`])
      }
      
      // 2. Deploy basierend auf Target
      if (deployTarget === "vercel") {
        setDeployStep("vercel")
        setDeployLogs(prev => [...prev, "", "Deploye zu Vercel..."])
        
        // Deploy zu Vercel
        const deployRes = await fetch("/api/vercel/deploy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "deploy",
            config: {
              projectName: repoName.toLowerCase().replace(/\s+/g, "-"),
              framework: "nextjs",
              files: files.map(f => ({ path: f.path, content: f.content })),
              repoUrl: repoUrl,
            },
            apiKey: globalConfig.vercelToken,
          }),
        })
        const deployData = await deployRes.json()
        
        if (deployData.logs) {
          deployData.logs.forEach((log: string) => setDeployLogs(prev => [...prev, log]))
        }
        
        if (deployData.success) {
          setDeployResult(prev => ({ ...prev, vercelUrl: deployData.url }))
          setDeployStep("done")
          toast.success("Vercel Deployment erfolgreich!")
          
          addMessage({
            role: "assistant",
            content: `🚀 **Deployment erfolgreich!**\n\n${repoUrl ? `**GitHub:** ${repoUrl}\n` : ""}**Vercel:** ${deployData.url}\n\nDein Projekt ist jetzt live!`,
            agent: "system",
          })
        } else {
          setDeployResult(prev => ({ ...prev, error: deployData.error }))
          setDeployStep("done")
          toast.error(`Vercel Fehler: ${deployData.error}`)
        }
        
      } else if (deployTarget === "render") {
        setDeployStep("render")
        setDeployLogs(prev => [...prev, "", "Generiere Render Blueprint..."])
        
        // Generiere Blueprint
        const blueprintRes = await fetch("/api/render/deploy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "generate-blueprint",
            config: {
              projectName: repoName.toLowerCase().replace(/\s+/g, "-"),
              projectType: "nextjs",
              region: "frankfurt",
              plan: "free",
              autoDeploy: true,
              healthCheckPath: "/",
            },
          }),
        })
        const blueprintData = await blueprintRes.json()
        
        if (blueprintData.success) {
          setGeneratedBlueprint(blueprintData.blueprint)
          setDeployLogs(prev => [...prev, "✓ render.yaml Blueprint generiert"])
        }
        
        // Deploy zu Render
        setDeployLogs(prev => [...prev, "", "Deploye zu Render.com..."])
        const deployRes = await fetch("/api/render/deploy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "deploy",
            config: {
              projectName: repoName.toLowerCase().replace(/\s+/g, "-"),
              projectType: "nextjs",
              region: "frankfurt",
              plan: "starter", // Render API unterstützt kein "free" via API
              repoUrl: repoUrl,
            },
            apiKey: globalConfig.renderApiKey,
          }),
        })
        const deployData = await deployRes.json()
        
        if (deployData.logs) {
          deployData.logs.forEach((log: string) => setDeployLogs(prev => [...prev, log]))
        }
        
        if (deployData.success) {
          setDeployResult(prev => ({ ...prev, renderUrl: deployData.serviceUrl }))
          setDeployStep("done")
          toast.success("Render Deployment erfolgreich!")
          
          addMessage({
            role: "assistant",
            content: `🚀 **Deployment erfolgreich!**\n\n${repoUrl ? `**GitHub:** ${repoUrl}\n` : ""}**Render:** ${deployData.serviceUrl || "Wird erstellt..."}\n\nDein Projekt ist jetzt live!`,
            agent: "system",
          })
        } else {
          setDeployResult(prev => ({ ...prev, error: deployData.error }))
          setDeployStep("done")
          toast.warning("Render Deployment mit Hinweisen abgeschlossen")
        }
        
      } else {
        // github-only
        setDeployStep("done")
        toast.success("GitHub Repository erstellt!")
        
        addMessage({
          role: "assistant",
          content: `✅ **GitHub Repository erstellt:** ${repoUrl}\n\n💡 **Tipp:** Wähle Render oder BTP als Deployment-Ziel für automatisches Deployment.`,
          agent: "system",
        })
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unbekannter Fehler"
      setDeployResult({ error: errorMessage })
      setDeployStep("error")
      setDeployLogs(prev => [...prev, `❌ Fehler: ${errorMessage}`])
      toast.error(errorMessage)
    } finally {
      setIsDeploying(false)
    }
  }

  const files = getFiles()

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      {sidebarOpen && <BuilderSidebar onClose={() => setSidebarOpen(false)} />}

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-14 items-center gap-4 border-b border-border px-4">
          {!sidebarOpen && (
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
              <PanelLeft className="h-5 w-5" />
            </Button>
          )}
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <Bot className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold">AgentForge Builder</span>
          </Link>

          {/* Project indicator with stats */}
          {currentProject && (
            <div className="flex items-center gap-2 rounded-md bg-secondary px-3 py-1">
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{currentProject.name}</span>
              {isSyncing && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
            </div>
          )}
          
          {/* Project Statistics */}
          {files.length > 0 && (
            <div className="hidden md:flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1" title="Anzahl Dateien">
                <FileText className="h-3 w-3" />
                <span>{files.length} {files.length === 1 ? 'Datei' : 'Dateien'}</span>
              </div>
              <div className="flex items-center gap-1" title="Zeilen Code">
                <Code2 className="h-3 w-3" />
                <span>{files.reduce((acc, f) => acc + (f.content?.split('\n').length || 0), 0).toLocaleString('de-DE')} Zeilen</span>
              </div>
              <div className="flex items-center gap-1" title="Zeichen gesamt">
                <span>{(files.reduce((acc, f) => acc + (f.content?.length || 0), 0) / 1000).toFixed(1)}k</span>
              </div>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            
            {/* Undo/Redo Buttons */}
            <div className="flex items-center border rounded-md">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => { undo(); toast.info("Änderung rückgängig gemacht") }}
                disabled={!canUndo()}
                title="Rückgängig (Ctrl+Z)"
                className="rounded-r-none border-r"
              >
                <Undo className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => { redo(); toast.info("Änderung wiederhergestellt") }}
                disabled={!canRedo()}
                title="Wiederholen (Ctrl+Y)"
                className="rounded-l-none"
              >
                <Redo className="h-4 w-4" />
              </Button>
            </div>
            
            <Button variant="outline" size="sm" onClick={() => setNewProjectOpen(true)} title="Neues Projekt (Ctrl+N)">
              <Plus className="mr-2 h-4 w-4" />
              Neues Projekt
            </Button>
            <Button variant="outline" size="sm" onClick={saveProject} disabled={!currentProject}>
              Speichern
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={files.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <WorkflowSelectorDialog
              trigger={
                <Button 
                  variant={selectedWorkflow ? "default" : "outline"} 
                  size="sm" 
                  title="Workflow auswählen"
                  className={selectedWorkflow ? "bg-purple-600 hover:bg-purple-700" : ""}
                >
                  <GitBranch className="mr-2 h-4 w-4" />
                  {selectedWorkflow ? selectedWorkflow.name : "Workflow"}
                </Button>
              }
              onSelectWorkflow={handleSelectWorkflow}
            />
            <Link href="/builder/workflow">
              <Button variant="outline" size="sm" title="Workflow Designer öffnen">
                <Settings className="mr-2 h-4 w-4" />
                Designer
              </Button>
            </Link>
            <KnowledgeBaseDialog
              trigger={
                <Button variant="outline" size="sm" title="Knowledge Base verwalten">
                  <Database className="mr-2 h-4 w-4" />
                  Wissen
                </Button>
              }
            />
            <Button 
              size="sm" 
              onClick={handleOpenDeployDialog} 
              disabled={files.length === 0}
              className="bg-green-600 hover:bg-green-700"
            >
              <Rocket className="mr-2 h-4 w-4" />
              Deployen
            </Button>
            <div className="ml-2 pl-2 border-l border-border flex items-center gap-2">
              <Link href="/mcp">
                <Button variant="ghost" size="sm" title="MCP Server Konfiguration">
                  <Server className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/sap">
                <Button variant="ghost" size="sm" title="SAP Integration">
                  <Building2 className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/history">
                <Button variant="ghost" size="sm" title="Verlauf">
                  <History className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/logs">
                <Button variant="ghost" size="sm" title="Logs">
                  <FileText className="h-4 w-4" />
                </Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={() => setShortcutsDialogOpen(true)} title="Tastenkürzel (Shift+?)">
                <Keyboard className="h-4 w-4" />
              </Button>
              <Link href="/admin">
                <Button variant="ghost" size="sm" title="Admin - Agent Marketplace">
                  <Settings className="h-4 w-4" />
                </Button>
              </Link>
              <span className="text-xs text-muted-foreground">{currentUser?.username}</span>
              <Button variant="ghost" size="sm" onClick={handleLogout} title="Abmelden">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Chat Panel */}
          <div className="flex w-full flex-col border-r border-border lg:w-[400px] min-h-0 overflow-hidden">
            <BuilderChat 
              messages={messages} 
              onSendMessage={handleSendMessage} 
              isProcessing={isProcessing}
              onImplementSuggestion={(suggestion) => {
                // Starte den Coder-Agent mit dem Vorschlag
                handleSendMessage(`Bitte setze folgenden Verbesserungsvorschlag um: ${suggestion}`)
              }}
            />
          </div>

          {/* Workflow & Output Panel with Resizable Panels */}
          <div className="hidden flex-1 flex-col lg:flex min-h-0 overflow-hidden">
            <PanelGroup direction="vertical" className="flex-1">
              <Panel defaultSize={40} minSize={20}>
                <div className="h-full overflow-auto p-4">
                  {/* Zeige Workflow-Execution wenn ein Workflow ausgewählt ist */}
                  {selectedWorkflow ? (
                    <WorkflowExecutionView
                      workflow={selectedWorkflow}
                      initialPrompt={workflowPrompt || undefined}
                      autoStart={!!workflowPrompt}
                      onComplete={() => {
                        // Workflow abgeschlossen - Prompt zurücksetzen
                        setWorkflowPrompt(null)
                      }}
                      onClose={() => {
                        handleSelectWorkflow(null) // Reset workflow und workflowOrder
                        setWorkflowPrompt(null)
                      }}
                      onStart={() => {
                        // Workflow gestartet
                      }}
                    />
                  ) : (
                    <BuilderWorkflow steps={workflowSteps} />
                  )}
                </div>
              </Panel>
              
              {files.length > 0 && (
                <>
                  <PanelResizeHandle className="relative h-3 bg-border/50 hover:bg-primary/30 transition-colors cursor-row-resize flex items-center justify-center group border-y border-border">
                    <div className="absolute inset-x-0 flex items-center justify-center">
                      <div className="w-12 h-1 rounded-full bg-muted-foreground/50 group-hover:bg-primary transition-colors" />
                    </div>
                  </PanelResizeHandle>
                  <Panel defaultSize={60} minSize={20}>
                    <div className="h-full overflow-hidden">
                      <BuilderOutput files={files} />
                    </div>
                  </Panel>
                </>
              )}
            </PanelGroup>
          </div>
        </div>
      </div>

      {/* New Project Dialog */}
      <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neues Projekt erstellen</DialogTitle>
            <DialogDescription>Gib deinem Projekt einen Namen und eine optionale Beschreibung.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Projektname</Label>
              <Input
                id="project-name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Meine App"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-description">Beschreibung (optional)</Label>
              <Textarea
                id="project-description"
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                placeholder="Eine kurze Beschreibung..."
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewProjectOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleCreateProject} disabled={!projectName.trim()}>
              Erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deploy Dialog */}
      <Dialog open={deployDialogOpen} onOpenChange={setDeployDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5" />
              Projekt deployen
            </DialogTitle>
            <DialogDescription>
              Wähle ein Deployment-Ziel und deploye dein Projekt
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Repository Name */}
            <div className="space-y-2">
              <Label htmlFor="repo-name">Projekt Name</Label>
              <Input
                id="repo-name"
                value={repoName}
                onChange={(e) => setRepoName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                placeholder="mein-projekt"
                disabled={isDeploying}
              />
            </div>

            {/* Deployment Target Selection */}
            <div className="space-y-2">
              <Label>Deployment-Ziel</Label>
              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={() => setDeployTarget("vercel")}
                  disabled={isDeploying}
                  className={`flex flex-col items-center p-3 rounded-lg border-2 transition-all ${
                    deployTarget === "vercel" 
                      ? "border-black bg-black/10 dark:border-white dark:bg-white/10" 
                      : "border-border hover:border-black/50 dark:hover:border-white/50"
                  }`}
                >
                  <svg className={`h-5 w-5 mb-1 ${deployTarget === "vercel" ? "text-black dark:text-white" : "text-muted-foreground"}`} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M24 22.525H0l12-21.05 12 21.05z" />
                  </svg>
                  <span className="text-xs font-medium">Vercel</span>
                  <span className="text-xs text-muted-foreground">Kostenlos</span>
                </button>
                
                <button
                  onClick={() => setDeployTarget("render")}
                  disabled={isDeploying}
                  className={`flex flex-col items-center p-3 rounded-lg border-2 transition-all ${
                    deployTarget === "render" 
                      ? "border-purple-500 bg-purple-500/10" 
                      : "border-border hover:border-purple-500/50"
                  }`}
                >
                  <Rocket className={`h-5 w-5 mb-1 ${deployTarget === "render" ? "text-purple-500" : "text-muted-foreground"}`} />
                  <span className="text-xs font-medium">Render</span>
                  <span className="text-xs text-muted-foreground">$7/mo</span>
                </button>
                
                <button
                  onClick={() => setDeployTarget("btp")}
                  disabled={isDeploying}
                  className={`flex flex-col items-center p-3 rounded-lg border-2 transition-all ${
                    deployTarget === "btp" 
                      ? "border-blue-500 bg-blue-500/10" 
                      : "border-border hover:border-blue-500/50"
                  }`}
                >
                  <Building2 className={`h-5 w-5 mb-1 ${deployTarget === "btp" ? "text-blue-500" : "text-muted-foreground"}`} />
                  <span className="text-xs font-medium">SAP BTP</span>
                  <span className="text-xs text-muted-foreground">Enterprise</span>
                </button>
                
                <button
                  onClick={() => setDeployTarget("github-only")}
                  disabled={isDeploying}
                  className={`flex flex-col items-center p-3 rounded-lg border-2 transition-all ${
                    deployTarget === "github-only" 
                      ? "border-gray-500 bg-gray-500/10" 
                      : "border-border hover:border-gray-500/50"
                  }`}
                >
                  <Github className={`h-5 w-5 mb-1 ${deployTarget === "github-only" ? "text-gray-400" : "text-muted-foreground"}`} />
                  <span className="text-xs font-medium">GitHub</span>
                  <span className="text-xs text-muted-foreground">nur Repo</span>
                </button>
              </div>
            </div>

            {/* Deployment Logs */}
            {deployLogs.length > 0 && (
              <div className="bg-black/90 rounded-lg p-3 font-mono text-xs max-h-40 overflow-y-auto">
                {deployLogs.map((log, index) => (
                  <div 
                    key={index} 
                    className={`${
                      log.startsWith("✓") ? "text-green-400" :
                      log.startsWith("❌") || log.startsWith("⚠️") ? "text-red-400" :
                      log.startsWith("[Demo]") ? "text-yellow-400" :
                      "text-gray-300"
                    }`}
                  >
                    {log || "\u00A0"}
                  </div>
                ))}
              </div>
            )}

            {/* Generated Blueprint */}
            {generatedBlueprint && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">{deployTarget === "btp" ? "mta.yaml" : "render.yaml"}</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedBlueprint)
                      toast.success("Blueprint kopiert!")
                    }}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Kopieren
                  </Button>
                </div>
                <pre className="bg-muted rounded-lg p-2 text-xs max-h-24 overflow-y-auto">
                  {generatedBlueprint.split("\n").slice(0, 8).join("\n")}
                  {generatedBlueprint.split("\n").length > 8 && "\n..."}
                </pre>
              </div>
            )}

            {/* Ergebnis Links */}
            {deployResult && (deployResult.repoUrl || deployResult.renderUrl || deployResult.btpUrl) && (
              <div className="space-y-2 rounded-lg border border-green-500/50 bg-green-500/10 p-3">
                {deployResult.repoUrl && (
                  <a 
                    href={deployResult.repoUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <Github className="h-4 w-4" />
                    GitHub Repository
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {deployResult.renderUrl && (
                  <a 
                    href={deployResult.renderUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <Rocket className="h-4 w-4" />
                    Render App
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {deployResult.btpUrl && (
                  <a 
                    href={deployResult.btpUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <Building2 className="h-4 w-4" />
                    SAP BTP App
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}

            {/* Fehler Anzeige */}
            {deployResult?.error && (
              <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-500">
                {deployResult.error}
              </div>
            )}

            {/* Hinweise */}
            {deployStep === "idle" && (
              <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground space-y-1">
                {deployTarget === "vercel" && (
                  <>
                    <p>▲ Direktes Deployment zu Vercel (kostenlos)</p>
                    <p>⚡ Edge Network, HTTPS, automatische Skalierung</p>
                    {!globalConfig.vercelToken && (
                      <p className="text-yellow-500">⚠️ Vercel Token in Settings konfigurieren</p>
                    )}
                  </>
                )}
                {deployTarget === "render" && (
                  <>
                    <p>🚀 Erstellt GitHub Repo + render.yaml Blueprint</p>
                    <p>📦 Automatisches Deployment zu Render.com ($7/mo)</p>
                  </>
                )}
                {deployTarget === "btp" && (
                  <>
                    <p>☁️ Erstellt GitHub Repo + mta.yaml</p>
                    <p>🏢 Deployment zu SAP Business Technology Platform</p>
                    {(!globalConfig.btpApiEndpoint || !globalConfig.btpOrg) && (
                      <p className="text-yellow-500">⚠️ BTP Credentials in Settings konfigurieren</p>
                    )}
                  </>
                )}
                {deployTarget === "github-only" && (
                  <p>📁 Erstellt nur ein GitHub Repository ohne Deployment</p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeployDialogOpen(false)}>
              {deployStep === "done" ? "Schließen" : "Abbrechen"}
            </Button>
            {deployStep !== "done" && (
              <Button 
                onClick={handleDeploy} 
                disabled={isDeploying || !repoName.trim()}
                className={
                  deployTarget === "vercel" ? "bg-black hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200" :
                  deployTarget === "render" ? "bg-purple-600 hover:bg-purple-700" :
                  deployTarget === "btp" ? "bg-blue-600 hover:bg-blue-700" :
                  "bg-gray-600 hover:bg-gray-700"
                }
              >
                {isDeploying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deploying...
                  </>
                ) : (
                  <>
                    {deployTarget === "vercel" && (
                      <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M24 22.525H0l12-21.05 12 21.05z" />
                      </svg>
                    )}
                    {deployTarget === "render" && <Rocket className="mr-2 h-4 w-4" />}
                    {deployTarget === "btp" && <Building2 className="mr-2 h-4 w-4" />}
                    {deployTarget === "github-only" && <Github className="mr-2 h-4 w-4" />}
                    {deployTarget === "vercel" ? "Deploy zu Vercel" :
                     deployTarget === "render" ? "Deploy zu Render" : 
                     deployTarget === "btp" ? "Deploy zu BTP" : 
                     "GitHub Repo erstellen"}
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Keyboard Shortcuts Dialog */}
      <Dialog open={shortcutsDialogOpen} onOpenChange={setShortcutsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="h-5 w-5" />
              Tastenkürzel
            </DialogTitle>
            <DialogDescription>
              Nutze diese Tastenkürzel für schnelleres Arbeiten
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <div className="flex items-center justify-between text-sm">
              <span>Neues Projekt</span>
              <kbd className="px-2 py-1 bg-secondary rounded text-xs font-mono">Ctrl+N</kbd>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Projekt speichern</span>
              <kbd className="px-2 py-1 bg-secondary rounded text-xs font-mono">Ctrl+S</kbd>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Sidebar umschalten</span>
              <kbd className="px-2 py-1 bg-secondary rounded text-xs font-mono">Ctrl+B</kbd>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Tastenkürzel anzeigen</span>
              <kbd className="px-2 py-1 bg-secondary rounded text-xs font-mono">Shift+?</kbd>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Suche öffnen</span>
              <kbd className="px-2 py-1 bg-secondary rounded text-xs font-mono">Ctrl+K</kbd>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Einstellungen</span>
              <kbd className="px-2 py-1 bg-secondary rounded text-xs font-mono">Ctrl+,</kbd>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShortcutsDialogOpen(false)}>
              Schließen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
