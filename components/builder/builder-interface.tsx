"use client"

import { useEffect } from "react"
import { BuilderChat } from "./builder-chat"
import { BuilderWorkflow } from "./builder-workflow"
import { BuilderOutput } from "./builder-output"
import { BuilderSidebar } from "./builder-sidebar"
import { Button } from "@/components/ui/button"
import { Bot, PanelLeft, Download, FolderOpen, Plus, Rocket, Github, Loader2, ExternalLink, LogOut, Settings, GripHorizontal, Database, GitBranch } from "lucide-react"
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"
import Link from "next/link"
import { useAgentStore } from "@/lib/agent-store"
import { useAgentExecutor } from "@/lib/agent-executor-real"
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
import type { WorkflowGraph } from "@/lib/types"

export function BuilderInterface() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowGraph | null>(null)
  const [workflowPrompt, setWorkflowPrompt] = useState<string | null>(null) // Chat-Auftrag für Workflow
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [projectName, setProjectName] = useState("")
  const [projectDescription, setProjectDescription] = useState("")
  const [deployDialogOpen, setDeployDialogOpen] = useState(false)
  const [repoName, setRepoName] = useState("")
  const [isDeploying, setIsDeploying] = useState(false)
  const [deployStep, setDeployStep] = useState<"idle" | "github" | "render" | "done" | "error">("idle")
  const [deployResult, setDeployResult] = useState<{ repoUrl?: string; renderUrl?: string; error?: string } | null>(null)

  const { messages, workflowSteps, isProcessing, currentProject, addMessage, createProject, saveProject, getFiles, globalConfig } =
    useAgentStore()

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
      // Normaler Workflow
      await executeWorkflow(content, isIteration)
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
    setDeployDialogOpen(true)
  }

  const handleDeploy = async () => {
    const files = getFiles()
    if (files.length === 0) {
      toast.error("Keine Dateien zum Deployen vorhanden")
      return
    }

    // Prüfe ob GitHub Token vorhanden
    if (!globalConfig.githubToken) {
      toast.error("GitHub Token fehlt. Bitte in den Einstellungen konfigurieren.")
      return
    }

    setIsDeploying(true)
    setDeployStep("github")
    setDeployResult(null)

    try {
      // 1. Erstelle GitHub Repository
      const repoResponse = await fetch("https://api.github.com/user/repos", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${globalConfig.githubToken}`,
          "Content-Type": "application/json",
          "Accept": "application/vnd.github.v3+json"
        },
        body: JSON.stringify({
          name: repoName.toLowerCase().replace(/\s+/g, "-"),
          description: "Generated by AgentForge",
          private: false,
          auto_init: false
        })
      })

      if (!repoResponse.ok) {
        const error = await repoResponse.json()
        throw new Error(error.message || "GitHub Repository konnte nicht erstellt werden")
      }

      const repo = await repoResponse.json()
      
      // 2. Erstelle initialen Commit mit allen Dateien
      // Zuerst: Erstelle Blobs für alle Dateien
      const blobs = await Promise.all(files.map(async (file) => {
        const blobResponse = await fetch(`https://api.github.com/repos/${repo.full_name}/git/blobs`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${globalConfig.githubToken}`,
            "Content-Type": "application/json",
            "Accept": "application/vnd.github.v3+json"
          },
          body: JSON.stringify({
            content: btoa(unescape(encodeURIComponent(file.content))),
            encoding: "base64"
          })
        })
        const blob = await blobResponse.json()
        return {
          path: file.path.startsWith("/") ? file.path.slice(1) : file.path,
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
          tree: tree.sha
        })
      })
      const commit = await commitResponse.json()

      // Update main branch reference
      await fetch(`https://api.github.com/repos/${repo.full_name}/git/refs`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${globalConfig.githubToken}`,
          "Content-Type": "application/json",
          "Accept": "application/vnd.github.v3+json"
        },
        body: JSON.stringify({
          ref: "refs/heads/main",
          sha: commit.sha
        })
      })

      setDeployResult({ repoUrl: repo.html_url })
      
      // 3. Deploy zu Render.com wenn API Key vorhanden
      if (globalConfig.renderApiKey) {
        setDeployStep("render")
        
        try {
          const renderResponse = await fetch("/api/deploy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectName: repoName,
              repoUrl: repo.clone_url,
              renderApiKey: globalConfig.renderApiKey
            })
          })

          const renderResult = await renderResponse.json()
          
          if (renderResult.success) {
            setDeployResult(prev => ({ ...prev, renderUrl: renderResult.url }))
            setDeployStep("done")
            toast.success("Deployment erfolgreich!")
            
            addMessage({
              role: "assistant",
              content: `🚀 **Deployment erfolgreich!**\n\n**GitHub:** ${repo.html_url}\n**Render:** ${renderResult.url || "Wird erstellt..."}\n\nDein Projekt ist jetzt live!`,
              agent: "system",
            })
          } else {
            // Render fehlgeschlagen, aber GitHub war erfolgreich
            setDeployResult(prev => ({ ...prev, error: renderResult.error }))
            setDeployStep("done")
            toast.warning("GitHub erfolgreich, Render.com fehlgeschlagen")
            
            addMessage({
              role: "assistant",
              content: `✅ **GitHub Repository erstellt:** ${repo.html_url}\n\n⚠️ **Render.com Deployment fehlgeschlagen:** ${renderResult.error}\n\nDu kannst das Repository manuell auf Render.com verbinden.`,
              agent: "system",
            })
          }
        } catch (renderError) {
          setDeployResult(prev => ({ ...prev, error: "Render.com nicht erreichbar" }))
          setDeployStep("done")
        }
      } else {
        // Kein Render API Key - nur GitHub
        setDeployStep("done")
        toast.success("GitHub Repository erstellt!")
        
        addMessage({
          role: "assistant",
          content: `✅ **GitHub Repository erstellt:** ${repo.html_url}\n\n💡 **Tipp:** Füge einen Render.com API Key hinzu, um automatisch zu deployen.`,
          agent: "system",
        })
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unbekannter Fehler"
      setDeployResult({ error: errorMessage })
      setDeployStep("error")
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

          {/* Project indicator */}
          {currentProject && (
            <div className="flex items-center gap-2 rounded-md bg-secondary px-3 py-1">
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{currentProject.name}</span>
              {isSyncing && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setNewProjectOpen(true)}>
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
                <Button variant="outline" size="sm" title="Workflow auswählen">
                  <GitBranch className="mr-2 h-4 w-4" />
                  Workflow
                </Button>
              }
              onSelectWorkflow={(workflow) => setSelectedWorkflow(workflow)}
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
                        setSelectedWorkflow(null)
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5" />
              Projekt deployen
            </DialogTitle>
            <DialogDescription>
              Erstelle ein GitHub Repository und deploye optional zu Render.com
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Repository Name */}
            <div className="space-y-2">
              <Label htmlFor="repo-name">Repository Name</Label>
              <Input
                id="repo-name"
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                placeholder="mein-projekt"
                disabled={isDeploying}
              />
            </div>

            {/* Status Anzeige */}
            {deployStep !== "idle" && (
              <div className="space-y-2 rounded-lg border border-border bg-secondary/30 p-3">
                <div className="flex items-center gap-2 text-sm">
                  {deployStep === "github" && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                  {(deployStep === "done" || deployStep === "render") && <Github className="h-4 w-4 text-green-500" />}
                  {deployStep === "error" && <Github className="h-4 w-4 text-red-500" />}
                  <span className={deployStep === "github" ? "text-blue-500" : deployStep === "error" ? "text-red-500" : "text-green-500"}>
                    GitHub Repository {deployStep === "github" ? "wird erstellt..." : deployStep === "error" ? "fehlgeschlagen" : "erstellt"}
                  </span>
                </div>
                
                {globalConfig.renderApiKey && deployStep !== "error" && (
                  <div className="flex items-center gap-2 text-sm">
                    {deployStep === "render" && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                    {deployStep === "done" && <Rocket className="h-4 w-4 text-green-500" />}
                    {deployStep === "github" && <Rocket className="h-4 w-4 text-muted-foreground" />}
                    <span className={
                      deployStep === "render" ? "text-blue-500" : 
                      deployStep === "done" ? (deployResult?.renderUrl ? "text-green-500" : "text-yellow-500") : 
                      "text-muted-foreground"
                    }>
                      Render.com {
                        deployStep === "render" ? "wird deployt..." : 
                        deployStep === "done" ? (deployResult?.renderUrl ? "deployt" : "fehlgeschlagen") : 
                        "wartet..."
                      }
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Ergebnis Links */}
            {deployResult && (deployResult.repoUrl || deployResult.renderUrl) && (
              <div className="space-y-2 rounded-lg border border-green-500/50 bg-green-500/10 p-3">
                {deployResult.repoUrl && (
                  <a 
                    href={deployResult.repoUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <Github className="h-4 w-4" />
                    {deployResult.repoUrl}
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
                    {deployResult.renderUrl}
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

            {/* API Key Hinweise */}
            {!globalConfig.githubToken && (
              <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm">
                <p className="font-medium text-yellow-500">GitHub Token fehlt</p>
                <p className="text-muted-foreground">
                  Konfiguriere deinen GitHub Token in der Sidebar unter Global → API-Schlüssel
                </p>
              </div>
            )}

            {globalConfig.githubToken && !globalConfig.renderApiKey && (
              <div className="rounded-lg border border-blue-500/50 bg-blue-500/10 p-3 text-sm">
                <p className="text-blue-400">
                  💡 Füge einen Render.com API Key hinzu für automatisches Deployment
                </p>
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
                disabled={!globalConfig.githubToken || isDeploying || !repoName.trim()}
                className="bg-green-600 hover:bg-green-700"
              >
                {isDeploying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deploying...
                  </>
                ) : (
                  <>
                    <Rocket className="mr-2 h-4 w-4" />
                    Jetzt deployen
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
