"use client"

import type { ProjectFile } from "@/lib/types"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Copy, Check, ExternalLink, File, Github, Download, Bug, Loader2, Box } from "lucide-react"
import { SandpackProvider, SandpackLayout, SandpackCodeEditor, SandpackPreview, useSandpack, SandpackConsole } from "@codesandbox/sandpack-react"
import { useAgentStore } from "@/lib/agent-store"
import { useAgentExecutor } from "@/lib/agent-executor-real"
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

// Sandpack Error Listener Komponente
function SandpackErrorListener({ onError }: { onError: (error: string | null) => void }) {
  const { sandpack } = useSandpack()
  
  useEffect(() => {
    if (sandpack.error) {
      onError(sandpack.error.message)
    } else {
      onError(null)
    }
  }, [sandpack.error, onError])
  
  return null
}

interface LivePreviewProps {
  files: ProjectFile[]
}

export function LivePreview({ files: propFiles }: LivePreviewProps) {
  // Hole Dateien direkt aus dem Store für aktuelle Daten nach Fehlerkorrektur
  const { globalConfig, isProcessing, generatedFiles } = useAgentStore()
  const { fixErrors } = useAgentExecutor()
  
  // Verwende Store-Dateien (generatedFiles) für aktuelle Daten
  const files = generatedFiles.length > 0 ? generatedFiles : propFiles
  
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(files[0] || null)
  const [copied, setCopied] = useState(false)
  const [githubDialogOpen, setGithubDialogOpen] = useState(false)
  const [repoName, setRepoName] = useState("agentforge-project")
  const [isCreatingRepo, setIsCreatingRepo] = useState(false)
  const [githubResult, setGithubResult] = useState<{ success: boolean; url?: string; error?: string } | null>(null)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorDescription, setErrorDescription] = useState("")
  const [isFixing, setIsFixing] = useState(false)
  const [previewMode, setPreviewMode] = useState<"code" | "sandpack">("code")
  const [sandpackError, setSandpackError] = useState<string | null>(null)
  const [isAutoFixing, setIsAutoFixing] = useState(false)

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Bereite Dateien für Sandpack vor
  const getSandpackFiles = (): Record<string, string> => {
    // Finde die Hauptdatei
    const mainFile = files.find(f => 
      f.path.includes("page.tsx") || 
      f.path.includes("App.tsx") || 
      f.path.includes("index.tsx") ||
      f.path.includes("App.jsx") ||
      f.path.includes("page.jsx")
    ) || files.find(f => f.path.endsWith(".tsx") || f.path.endsWith(".jsx"))
    
    if (!mainFile) {
      return {
        "/App.tsx": `export default function App() {
  return (
    <div style={{ padding: 20, background: '#1a1a2e', color: '#eee', minHeight: '100vh' }}>
      <h1>Keine React-Komponente gefunden</h1>
      <p>Bitte generiere eine React-Komponente.</p>
    </div>
  );
}`
      }
    }
    
    // Bereite den Code vor
    let content = mainFile.content
    
    // Entferne "use client" Direktiven
    content = content.replace(/^["']use client["'];?\s*/gm, "")
    
    // Ersetze @/ Pfade
    content = content.replace(/@\//g, "./")
    
    // Entferne problematische Imports (Next.js spezifisch)
    content = content.replace(/import\s+.*\s+from\s+["']next\/[^"']+["'];?\s*/g, "")
    
    // Finde CSS-Dateien
    const cssFile = files.find(f => f.path.endsWith(".css"))
    const cssContent = cssFile?.content || `* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, sans-serif; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #eee; min-height: 100vh; padding: 20px; }
button { background: #6366f1; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; }
button:hover { background: #4f46e5; }
input { padding: 10px; border: 1px solid #333; border-radius: 8px; background: #2a2a3e; color: white; }`
    
    return {
      "/App.tsx": content,
      "/styles.css": cssContent
    }
  }

  // Automatische Fehlerkorrektur für Sandpack
  const handleAutoFix = async (errorMessage: string) => {
    if (isAutoFixing || isProcessing || isFixing) return
    
    setIsAutoFixing(true)
    setSandpackError(errorMessage)
    
    try {
      await fixErrors(errorMessage, 3)
      setSandpackError(null)
    } catch (err) {
      console.error("Auto-Fix fehlgeschlagen:", err)
    } finally {
      setIsAutoFixing(false)
    }
  }

  const handleFixErrors = async () => {
    if (!errorDescription.trim()) return
    
    setIsFixing(true)
    try {
      await fixErrors(errorDescription, 3)
      setErrorDialogOpen(false)
      setErrorDescription("")
    } finally {
      setIsFixing(false)
    }
  }

  const handleDownloadAll = () => {
    const content = files.map(f => `## ${f.path}\n\`\`\`${f.language}\n${f.content}\n\`\`\``).join("\n\n")
    const blob = new Blob([content], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "agentforge-project.md"
    a.click()
    URL.revokeObjectURL(url)
  }

  const createGitHubRepo = async () => {
    if (!globalConfig.githubToken) {
      setGithubResult({ success: false, error: "GitHub Token fehlt." })
      return
    }

    setIsCreatingRepo(true)
    setGithubResult(null)

    try {
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
          auto_init: true
        })
      })

      if (!repoResponse.ok) {
        const error = await repoResponse.json()
        throw new Error(error.message || "Repository konnte nicht erstellt werden")
      }

      const repo = await repoResponse.json()
      await new Promise(resolve => setTimeout(resolve, 2000))

      for (const file of files) {
        const filePath = file.path.startsWith("/") ? file.path.slice(1) : file.path
        await fetch(`https://api.github.com/repos/${repo.full_name}/contents/${filePath}`, {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${globalConfig.githubToken}`,
            "Content-Type": "application/json",
            "Accept": "application/vnd.github.v3+json"
          },
          body: JSON.stringify({
            message: `Add ${filePath}`,
            content: btoa(unescape(encodeURIComponent(file.content)))
          })
        })
      }

      setGithubResult({ success: true, url: repo.html_url })
    } catch (error) {
      setGithubResult({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unbekannter Fehler" 
      })
    } finally {
      setIsCreatingRepo(false)
    }
  }

  if (files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Keine Dateien für Preview vorhanden
      </div>
    )
  }

  return (
    <>
      <div className="flex h-full">
        {/* Dateiliste */}
        <div className="w-56 border-r border-border bg-secondary/30 flex flex-col">
          <div className="border-b border-border p-2 space-y-2">
            {/* Preview-Modus Toggle */}
            <div className="flex flex-wrap gap-1 p-1 bg-secondary/50 rounded-md">
              <Button 
                size="sm" 
                variant={previewMode === "code" ? "default" : "ghost"}
                className="flex-1 text-xs h-7 min-w-[60px]"
                onClick={() => setPreviewMode("code")}
              >
                <File className="mr-1 h-3 w-3" />
                Code
              </Button>
              <Button 
                size="sm" 
                variant={previewMode === "sandpack" ? "default" : "ghost"}
                className="flex-1 text-xs h-7 min-w-[60px]"
                onClick={() => setPreviewMode("sandpack")}
              >
                <Box className="mr-1 h-3 w-3" />
                Sandbox
              </Button>
            </div>
            <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => setGithubDialogOpen(true)}>
              <Github className="mr-1 h-3 w-3" />
              Zu GitHub pushen
            </Button>
            <Button size="sm" variant="outline" className="w-full text-xs" onClick={handleDownloadAll}>
              <Download className="mr-1 h-3 w-3" />
              Download
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              className="w-full text-xs border-orange-500/50 text-orange-500 hover:bg-orange-500/10" 
              onClick={() => setErrorDialogOpen(true)}
              disabled={isProcessing || isFixing}
            >
              <Bug className="mr-1 h-3 w-3" />
              Fehler korrigieren
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {files.map((file) => (
                <button
                  key={file.id}
                  onClick={() => setSelectedFile(file)}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-left transition-colors ${
                    selectedFile?.id === file.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-secondary"
                  }`}
                >
                  <File className="h-3 w-3 shrink-0" />
                  <span className="truncate">{file.path.split("/").pop()}</span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Code-Ansicht oder Iframe-Preview */}
        <div className="flex-1 flex flex-col">
          {previewMode === "code" && selectedFile && (
            <>
              <div className="flex items-center justify-between border-b border-border bg-secondary/50 px-4 py-2">
                <span className="font-mono text-sm text-muted-foreground">{selectedFile.path}</span>
                <Button variant="ghost" size="sm" onClick={() => handleCopy(selectedFile.content)}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <pre className="p-4 text-sm">
                  <code className="font-mono text-xs leading-relaxed">{selectedFile.content}</code>
                </pre>
              </ScrollArea>
            </>
          )}
          
          {previewMode === "sandpack" && (
            <div className="flex-1 flex flex-col">
              <div className="flex items-center justify-between border-b border-border bg-secondary/50 px-4 py-2">
                <span className="text-sm text-muted-foreground">
                  <Box className="inline h-4 w-4 mr-2" />
                  CodeSandbox Sandpack (vollständige IDE)
                </span>
                {sandpackError && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs border-orange-500/50 text-orange-500 hover:bg-orange-500/10"
                    onClick={() => handleAutoFix(sandpackError)}
                    disabled={isAutoFixing || isProcessing}
                  >
                    {isAutoFixing ? (
                      <>
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        Korrigiere...
                      </>
                    ) : (
                      <>
                        <Bug className="mr-1 h-3 w-3" />
                        Auto-Fix
                      </>
                    )}
                  </Button>
                )}
              </div>
              <div className="flex-1 overflow-hidden h-full">
                <SandpackProvider
                  template="react-ts"
                  theme="dark"
                  files={getSandpackFiles()}
                  customSetup={{
                    dependencies: {
                      // Icons
                      "react-icons": "^5.0.0",
                      "lucide-react": "^0.400.0",
                      "@heroicons/react": "^2.1.0",
                      "@phosphor-icons/react": "^2.1.0",
                      
                      // Animation
                      "framer-motion": "^11.0.0",
                      "react-spring": "^9.7.0",
                      "@react-spring/web": "^9.7.0",
                      "animejs": "^3.2.0",
                      "gsap": "^3.12.0",
                      
                      // Styling & CSS
                      "clsx": "^2.1.0",
                      "tailwind-merge": "^2.2.0",
                      "class-variance-authority": "^0.7.0",
                      "styled-components": "^6.1.0",
                      "@emotion/react": "^11.11.0",
                      "@emotion/styled": "^11.11.0",
                      "sass": "^1.70.0",
                      
                      // UI Components & Libraries
                      "@radix-ui/react-slot": "^1.0.0",
                      "@radix-ui/react-dialog": "^1.0.0",
                      "@radix-ui/react-dropdown-menu": "^2.0.0",
                      "@radix-ui/react-tabs": "^1.0.0",
                      "@radix-ui/react-tooltip": "^1.0.0",
                      "@radix-ui/react-popover": "^1.0.0",
                      "@radix-ui/react-select": "^2.0.0",
                      "@radix-ui/react-checkbox": "^1.0.0",
                      "@radix-ui/react-switch": "^1.0.0",
                      "@radix-ui/react-slider": "^1.0.0",
                      "@radix-ui/react-accordion": "^1.0.0",
                      "@radix-ui/react-avatar": "^1.0.0",
                      "@radix-ui/react-progress": "^1.0.0",
                      "@headlessui/react": "^1.7.0",
                      "@mui/material": "^5.15.0",
                      "@mui/icons-material": "^5.15.0",
                      "antd": "^5.12.0",
                      "react-bootstrap": "^2.10.0",
                      "bootstrap": "^5.3.0",
                      "@chakra-ui/react": "^2.8.0",
                      
                      // Forms
                      "react-hook-form": "^7.49.0",
                      "formik": "^2.4.0",
                      "yup": "^1.3.0",
                      "zod": "^3.22.0",
                      "@hookform/resolvers": "^3.3.0",
                      
                      // State Management
                      "zustand": "^4.4.0",
                      "jotai": "^2.6.0",
                      "recoil": "^0.7.0",
                      "redux": "^5.0.0",
                      "react-redux": "^9.0.0",
                      "@reduxjs/toolkit": "^2.0.0",
                      "mobx": "^6.12.0",
                      "mobx-react-lite": "^4.0.0",
                      
                      // Data Fetching
                      "axios": "^1.6.0",
                      "swr": "^2.2.0",
                      "@tanstack/react-query": "^5.17.0",
                      "ky": "^1.2.0",
                      
                      // Routing
                      "react-router-dom": "^6.21.0",
                      "wouter": "^3.0.0",
                      
                      // Date & Time
                      "date-fns": "^3.0.0",
                      "dayjs": "^1.11.0",
                      "moment": "^2.30.0",
                      "luxon": "^3.4.0",
                      
                      // Charts & Visualization
                      "recharts": "^2.10.0",
                      "chart.js": "^4.4.0",
                      "react-chartjs-2": "^5.2.0",
                      "d3": "^7.8.0",
                      "victory": "^36.9.0",
                      "nivo": "^0.84.0",
                      "@visx/visx": "^3.5.0",
                      "apexcharts": "^3.45.0",
                      "react-apexcharts": "^1.4.0",
                      
                      // Tables
                      "@tanstack/react-table": "^8.11.0",
                      "react-data-grid": "^7.0.0",
                      
                      // Drag & Drop
                      "react-beautiful-dnd": "^13.1.0",
                      "@dnd-kit/core": "^6.1.0",
                      "@dnd-kit/sortable": "^8.0.0",
                      "react-dnd": "^16.0.0",
                      "react-dnd-html5-backend": "^16.0.0",
                      
                      // Carousel & Slider
                      "swiper": "^11.0.0",
                      "embla-carousel-react": "^8.0.0",
                      "react-slick": "^0.29.0",
                      "slick-carousel": "^1.8.0",
                      
                      // Maps
                      "leaflet": "^1.9.0",
                      "react-leaflet": "^4.2.0",
                      "@react-google-maps/api": "^2.19.0",
                      "mapbox-gl": "^3.0.0",
                      "react-map-gl": "^7.1.0",
                      
                      // Media
                      "react-player": "^2.14.0",
                      "react-dropzone": "^14.2.0",
                      "react-image-crop": "^11.0.0",
                      "react-webcam": "^7.2.0",
                      
                      // Rich Text & Markdown
                      "react-markdown": "^9.0.0",
                      "remark-gfm": "^4.0.0",
                      "@tiptap/react": "^2.1.0",
                      "@tiptap/starter-kit": "^2.1.0",
                      "slate": "^0.100.0",
                      "slate-react": "^0.100.0",
                      "draft-js": "^0.11.0",
                      "react-quill": "^2.0.0",
                      
                      // Syntax Highlighting
                      "prismjs": "^1.29.0",
                      "react-syntax-highlighter": "^15.5.0",
                      "highlight.js": "^11.9.0",
                      
                      // Notifications & Toasts
                      "react-hot-toast": "^2.4.0",
                      "react-toastify": "^9.1.0",
                      "sonner": "^1.3.0",
                      "notistack": "^3.0.0",
                      
                      // Modals & Dialogs
                      "react-modal": "^3.16.0",
                      "sweetalert2": "^11.10.0",
                      "sweetalert2-react-content": "^5.0.0",
                      
                      // Utilities
                      "lodash": "^4.17.0",
                      "lodash-es": "^4.17.0",
                      "ramda": "^0.29.0",
                      "uuid": "^9.0.0",
                      "nanoid": "^5.0.0",
                      "immer": "^10.0.0",
                      "classnames": "^2.5.0",
                      
                      // Validation
                      "validator": "^13.11.0",
                      "joi": "^17.11.0",
                      
                      // Internationalization
                      "i18next": "^23.7.0",
                      "react-i18next": "^14.0.0",
                      "react-intl": "^6.6.0",
                      
                      // PDF
                      "@react-pdf/renderer": "^3.1.0",
                      "react-pdf": "^7.6.0",
                      "jspdf": "^2.5.0",
                      
                      // QR Code & Barcode
                      "qrcode.react": "^3.1.0",
                      "react-qr-code": "^2.0.0",
                      "jsbarcode": "^3.11.0",
                      
                      // Virtualization
                      "react-window": "^1.8.0",
                      "react-virtualized": "^9.22.0",
                      "@tanstack/react-virtual": "^3.0.0",
                      
                      // Misc UI
                      "react-loading-skeleton": "^3.3.0",
                      "react-spinners": "^0.13.0",
                      "react-countup": "^6.5.0",
                      "react-confetti": "^6.1.0",
                      "lottie-react": "^2.4.0",
                      "react-lottie": "^1.2.0",
                      "react-type-animation": "^3.2.0",
                      "typewriter-effect": "^2.21.0",
                      "react-copy-to-clipboard": "^5.1.0",
                      "react-use": "^17.4.0",
                      "usehooks-ts": "^2.9.0",
                      "ahooks": "^3.7.0",
                    }
                  }}
                >
                  <SandpackErrorListener onError={setSandpackError} />
                  <SandpackLayout>
                    <SandpackCodeEditor 
                      showLineNumbers 
                      showInlineErrors 
                      wrapContent
                      style={{ height: "100%" }}
                    />
                    <SandpackPreview 
                      showNavigator
                      style={{ height: "100%" }}
                    />
                  </SandpackLayout>
                </SandpackProvider>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* GitHub Dialog */}
      <Dialog open={githubDialogOpen} onOpenChange={setGithubDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Zu GitHub pushen</DialogTitle>
            <DialogDescription>
              Erstelle ein neues GitHub Repository mit allen generierten Dateien.
            </DialogDescription>
          </DialogHeader>
          
          {!globalConfig.githubToken ? (
            <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4 text-sm">
              <p className="font-medium text-yellow-500">GitHub Token fehlt</p>
              <p className="mt-1 text-muted-foreground">
                Bitte konfiguriere deinen GitHub Personal Access Token in den Einstellungen.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="repo-name">Repository Name</Label>
                <Input
                  id="repo-name"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  placeholder="mein-projekt"
                />
              </div>
              
              {githubResult && (
                <div className={`rounded-lg border p-3 text-sm ${
                  githubResult.success 
                    ? "border-green-500/50 bg-green-500/10" 
                    : "border-red-500/50 bg-red-500/10"
                }`}>
                  {githubResult.success ? (
                    <div>
                      <p className="font-medium text-green-500">Repository erstellt!</p>
                      <a 
                        href={githubResult.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="mt-1 flex items-center gap-1 text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {githubResult.url}
                      </a>
                    </div>
                  ) : (
                    <p className="text-red-500">{githubResult.error}</p>
                  )}
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setGithubDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button 
              onClick={createGitHubRepo} 
              disabled={!globalConfig.githubToken || isCreatingRepo || !repoName.trim()}
            >
              {isCreatingRepo ? "Erstelle..." : "Repository erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fehlerkorrektur Dialog */}
      <Dialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bug className="h-5 w-5 text-orange-500" />
              Fehler korrigieren
            </DialogTitle>
            <DialogDescription>
              Beschreibe den Fehler aus StackBlitz und der Code wird automatisch korrigiert.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="error-description">Fehlerbeschreibung</Label>
              <textarea
                id="error-description"
                value={errorDescription}
                onChange={(e) => setErrorDescription(e.target.value)}
                placeholder="Kopiere die Fehlermeldung aus StackBlitz hier ein...

Beispiel:
- TypeError: Cannot read property 'map' of undefined
- Module not found: Can't resolve './Component'
- Unexpected token '<'"
                className="w-full h-32 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={isFixing}
              />
            </div>
            
            <div className="rounded-lg border border-blue-500/50 bg-blue-500/10 p-3 text-sm">
              <p className="text-blue-400">
                💡 Der Coder-Agent wird den Fehler analysieren und bis zu 3 Korrekturversuche durchführen.
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setErrorDialogOpen(false)} disabled={isFixing}>
              Abbrechen
            </Button>
            <Button 
              onClick={handleFixErrors} 
              disabled={!errorDescription.trim() || isFixing}
              className="bg-orange-500 hover:bg-orange-600"
            >
              {isFixing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Korrigiere...
                </>
              ) : (
                <>
                  <Bug className="mr-2 h-4 w-4" />
                  Fehler korrigieren
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
