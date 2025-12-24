"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { WebContainer } from "@webcontainer/api"
import type { ProjectFile } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, Play, Square, RefreshCw, Terminal, ExternalLink } from "lucide-react"

// Globale Singleton-Instanz für WebContainer
let globalWebContainer: WebContainer | null = null
let bootPromise: Promise<WebContainer> | null = null

interface WebContainerPreviewProps {
  files: ProjectFile[]
}

// Bereinige Code für Vite-Kompatibilität
function cleanCodeForVite(content: string): string {
  let cleaned = content
  // Entferne "use client" Direktiven
  cleaned = cleaned.replace(/^["']use client["'];?\s*/gm, "")
  // Entferne Next.js spezifische Imports
  cleaned = cleaned.replace(/import\s+.*\s+from\s+["']next\/[^"']+["'];?\s*/g, "")
  // Konvertiere @/ Imports zu relativen Imports (./components statt @/components)
  cleaned = cleaned.replace(/from\s+["']@\/([^"']+)["']/g, 'from "./$1"')
  // Entferne CSS Imports (werden nicht unterstützt)
  cleaned = cleaned.replace(/import\s+["'][^"']*\.css["'];?\s*/g, "")
  return cleaned
}

// Extrahiere Imports aus Code
function extractImports(content: string): string[] {
  const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s*,?\s*)*\s*from\s+["']([^"']+)["']/g
  const imports: string[] = []
  let match
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1]
    // Nur relative Imports (keine node_modules)
    if (importPath.startsWith('./') || importPath.startsWith('../') || importPath.startsWith('@/')) {
      imports.push(importPath)
    }
  }
  return imports
}

// Typ für WebContainer Dateibaum
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FileTree = Record<string, any>

// Erstelle WebContainer-Dateistruktur aus ProjectFiles
function buildFileTree(files: ProjectFile[]): FileTree {
  const tree: FileTree = {}
  
  for (const file of files) {
    // Normalisiere Pfad (entferne führenden /)
    let filePath = file.path.startsWith('/') ? file.path.slice(1) : file.path
    
    // Stelle sicher, dass alle Dateien unter src/ liegen
    if (!filePath.startsWith('src/')) {
      filePath = `src/${filePath}`
    }
    
    const parts = filePath.split('/')
    const fileName = parts.pop()!
    
    // Navigiere/erstelle Verzeichnisse
    let current = tree
    for (const part of parts) {
      if (!current[part]) {
        current[part] = { directory: {} }
      }
      current = current[part].directory
    }
    
    // Füge Datei hinzu mit bereinigtem Code
    current[fileName] = {
      file: {
        contents: cleanCodeForVite(file.content)
      }
    }
  }
  
  return tree
}

// Vite Projekt-Template mit allen Projektdateien
const createViteProject = (files: ProjectFile[]) => {
  // Baue Dateibaum aus allen Projektdateien
  const projectTree = buildFileTree(files) as FileTree
  
  // Extrahiere src-Verzeichnis oder erstelle leeres
  const srcDir: FileTree = (projectTree['src'] as FileTree)?.directory || {}
  
  // Prüfe ob App.tsx existiert, sonst erstelle Standard-App
  if (!srcDir['App.tsx']) {
    // Suche nach einer Hauptdatei
    const mainFile = files.find(f => 
      f.path.includes('App.tsx') || 
      f.path.includes('App.jsx') ||
      f.path.includes('page.tsx') ||
      f.path.includes('index.tsx')
    ) || files.find(f => f.path.endsWith('.tsx') || f.path.endsWith('.jsx'))
    
    if (mainFile) {
      srcDir['App.tsx'] = {
        file: {
          contents: cleanCodeForVite(mainFile.content)
        }
      }
    } else {
      srcDir['App.tsx'] = {
        file: {
          contents: `export default function App() {
  return (
    <div style={{ padding: 20, background: '#1a1a2e', color: '#eee', minHeight: '100vh' }}>
      <h1>Keine React-Komponente gefunden</h1>
    </div>
  );
}`
        }
      }
    }
  }
  
  // Stelle sicher, dass main.tsx existiert
  if (!srcDir['main.tsx']) {
    srcDir['main.tsx'] = {
      file: {
        contents: `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`
      }
    }
  }
  
  return {
    "package.json": {
      file: {
        contents: JSON.stringify({
          name: "vite-react-app",
          private: true,
          version: "0.0.0",
          type: "module",
          scripts: {
            dev: "vite",
            build: "vite build",
            preview: "vite preview"
          },
          dependencies: {
            "react": "^18.2.0",
            "react-dom": "^18.2.0",
            "lucide-react": "^0.294.0",
            "date-fns": "^2.30.0"
          },
          devDependencies: {
            "@types/react": "^18.2.0",
            "@types/react-dom": "^18.2.0",
            "@vitejs/plugin-react": "^4.2.0",
            "typescript": "^5.2.0",
            "vite": "^5.0.0"
          }
        }, null, 2)
      }
    },
    "vite.config.ts": {
      file: {
        contents: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173
  }
})`
      }
    },
    "index.html": {
      file: {
        contents: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Generated App</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: system-ui, -apple-system, sans-serif; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`
      }
    },
    "src": {
      directory: srcDir
    },
    "tsconfig.json": {
      file: {
        contents: JSON.stringify({
          compilerOptions: {
            target: "ES2020",
            useDefineForClassFields: true,
            lib: ["ES2020", "DOM", "DOM.Iterable"],
            module: "ESNext",
            skipLibCheck: true,
            moduleResolution: "bundler",
            allowImportingTsExtensions: true,
            resolveJsonModule: true,
            isolatedModules: true,
            noEmit: true,
            jsx: "react-jsx",
            strict: false,
            noUnusedLocals: false,
            noUnusedParameters: false,
            noFallthroughCasesInSwitch: true,
            baseUrl: ".",
            paths: {
              "@/*": ["src/*"]
            }
          },
          include: ["src"],
          references: [{ path: "./tsconfig.node.json" }]
        }, null, 2)
      }
    },
    "tsconfig.node.json": {
      file: {
        contents: JSON.stringify({
          compilerOptions: {
            composite: true,
            skipLibCheck: true,
            module: "ESNext",
            moduleResolution: "bundler",
            allowSyntheticDefaultImports: true
          },
          include: ["vite.config.ts"]
        }, null, 2)
      }
    }
  }
}

export function WebContainerPreview({ files }: WebContainerPreviewProps) {
  const [webcontainer, setWebcontainer] = useState<WebContainer | null>(null)
  const [status, setStatus] = useState<"idle" | "booting" | "installing" | "starting" | "running" | "error">("idle")
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const processRef = useRef<{ kill: () => void } | null>(null)

  const addLog = useCallback((message: string) => {
    setLogs(prev => [...prev.slice(-100), `[${new Date().toLocaleTimeString()}] ${message}`])
  }, [])

  const bootContainer = useCallback(async () => {
    // Verwende existierende Instanz wenn vorhanden
    if (globalWebContainer) {
      setWebcontainer(globalWebContainer)
      addLog("WebContainer bereits gestartet (wiederverwendet)")
      return globalWebContainer
    }
    
    // Warte auf laufenden Boot-Prozess
    if (bootPromise) {
      addLog("Warte auf laufenden Boot-Prozess...")
      const container = await bootPromise
      setWebcontainer(container)
      return container
    }
    
    setStatus("booting")
    addLog("Starte WebContainer...")
    
    try {
      // Starte Boot-Prozess und speichere Promise
      bootPromise = WebContainer.boot()
      const container = await bootPromise
      
      // Speichere als globale Singleton-Instanz
      globalWebContainer = container
      setWebcontainer(container)
      addLog("WebContainer gestartet")
      
      // Server-Ready Event
      container.on("server-ready", (port, url) => {
        addLog(`Server bereit auf Port ${port}`)
        setPreviewUrl(url)
        setStatus("running")
      })
      
      // Error Event
      container.on("error", (err) => {
        addLog(`Fehler: ${err.message}`)
        setError(err.message)
        setStatus("error")
      })
      
      return container
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler"
      addLog(`Boot-Fehler: ${message}`)
      setError(message)
      setStatus("error")
      bootPromise = null
      return null
    }
  }, [addLog])

  const startDevServer = useCallback(async () => {
    setError(null)
    setPreviewUrl(null)
    
    const container = await bootContainer()
    if (!container) return
    
    // Stoppe vorherigen Prozess
    if (processRef.current) {
      processRef.current.kill()
      processRef.current = null
    }
    
    setStatus("installing")
    addLog("Mounte Dateien...")
    
    try {
      // Mounte Projekt-Dateien mit allen Dateien
      const projectFiles = createViteProject(files)
      await container.mount(projectFiles)
      addLog("Dateien gemountet")
      
      // npm install
      addLog("Installiere Dependencies (npm install)...")
      const installProcess = await container.spawn("npm", ["install"])
      
      installProcess.output.pipeTo(new WritableStream({
        write(data) {
          addLog(data)
        }
      }))
      
      const installExitCode = await installProcess.exit
      if (installExitCode !== 0) {
        throw new Error(`npm install fehlgeschlagen mit Code ${installExitCode}`)
      }
      addLog("Dependencies installiert")
      
      // npm run dev
      setStatus("starting")
      addLog("Starte Dev-Server (npm run dev)...")
      const devProcess = await container.spawn("npm", ["run", "dev"])
      processRef.current = devProcess
      
      devProcess.output.pipeTo(new WritableStream({
        write(data) {
          addLog(data)
        }
      }))
      
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler"
      addLog(`Fehler: ${message}`)
      setError(message)
      setStatus("error")
    }
  }, [bootContainer, addLog, files])

  const stopServer = useCallback(() => {
    if (processRef.current) {
      processRef.current.kill()
      processRef.current = null
    }
    setPreviewUrl(null)
    setStatus("idle")
    addLog("Server gestoppt")
  }, [addLog])

  const restartServer = useCallback(async () => {
    stopServer()
    await startDevServer()
  }, [stopServer, startDevServer])

  // Cleanup bei Unmount
  useEffect(() => {
    return () => {
      if (processRef.current) {
        processRef.current.kill()
      }
    }
  }, [])

  if (files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Keine Dateien für Preview vorhanden
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-secondary/50 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">WebContainer Runtime</span>
          <span className={`text-xs px-2 py-0.5 rounded ${
            status === "running" ? "bg-green-500/20 text-green-500" :
            status === "error" ? "bg-red-500/20 text-red-500" :
            status === "idle" ? "bg-gray-500/20 text-gray-500" :
            "bg-orange-500/20 text-orange-500"
          }`}>
            {status === "idle" && "Bereit"}
            {status === "booting" && "Startet..."}
            {status === "installing" && "Installiert..."}
            {status === "starting" && "Startet Server..."}
            {status === "running" && "Läuft"}
            {status === "error" && "Fehler"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {status === "idle" || status === "error" ? (
            <Button size="sm" onClick={startDevServer} className="gap-1">
              <Play className="h-3 w-3" />
              Starten
            </Button>
          ) : status === "running" ? (
            <>
              <Button size="sm" variant="outline" onClick={restartServer} className="gap-1">
                <RefreshCw className="h-3 w-3" />
                Neu starten
              </Button>
              <Button size="sm" variant="destructive" onClick={stopServer} className="gap-1">
                <Square className="h-3 w-3" />
                Stoppen
              </Button>
            </>
          ) : (
            <Button size="sm" disabled className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {status === "booting" && "Startet..."}
              {status === "installing" && "Installiert..."}
              {status === "starting" && "Startet..."}
            </Button>
          )}
          {previewUrl && (
            <Button size="sm" variant="ghost" asChild>
              <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 min-h-0">
        {/* Preview */}
        <div className="flex-1 bg-black">
          {previewUrl ? (
            <iframe
              ref={iframeRef}
              src={previewUrl}
              className="w-full h-full border-0"
              title="App Preview"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              {status === "idle" && "Klicke 'Starten' um die App auszuführen"}
              {status === "booting" && (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  WebContainer wird gestartet...
                </div>
              )}
              {status === "installing" && (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Dependencies werden installiert...
                </div>
              )}
              {status === "starting" && (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Dev-Server wird gestartet...
                </div>
              )}
              {status === "error" && (
                <div className="text-red-500 text-center p-4">
                  <p className="font-medium">Fehler aufgetreten</p>
                  <p className="text-sm mt-1">{error}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Terminal/Logs */}
        <div className="w-80 border-l border-border flex flex-col">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 bg-secondary/30">
            <Terminal className="h-4 w-4" />
            <span className="text-xs font-medium">Terminal</span>
          </div>
          <ScrollArea className="flex-1 bg-black">
            <div className="p-2 font-mono text-xs text-green-400 whitespace-pre-wrap">
              {logs.length === 0 ? (
                <span className="text-muted-foreground">Warte auf Ausgabe...</span>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="leading-relaxed">{log}</div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
