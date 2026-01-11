"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Copy, Check, Code, FileText, Terminal, ChevronRight, File, Folder, Download, Trash2, Play, Edit3, Lightbulb, Box } from "lucide-react"
import type { ProjectFile } from "@/lib/types"
import { useAgentStore } from "@/lib/agent-store"
import { LivePreview } from "./live-preview"
import { CodeEditor } from "./code-editor"
import { SuggestionPanel } from "./suggestion-panel"
import { WebContainerPreview } from "./webcontainer-preview"

interface BuilderOutputProps {
  files: ProjectFile[]
  onPreviewError?: (error: string | null) => void
}

export function BuilderOutput({ files, onPreviewError }: BuilderOutputProps) {
  const [copied, setCopied] = useState(false)
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(files[0] || null)
  const { logs, deleteFile, pendingSuggestions } = useAgentStore()

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleCopyAll = () => {
    const allContent = files.map((f) => `// File: ${f.path}\n${f.content}`).join("\n\n---\n\n")
    handleCopy(allContent)
  }

  const handleDownloadFile = (file: ProjectFile) => {
    const blob = new Blob([file.content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = file.path.split("/").pop() || "file.txt"
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDeleteFile = (fileId: string) => {
    deleteFile(fileId)
    if (selectedFile?.id === fileId) {
      setSelectedFile(files.find(f => f.id !== fileId) || null)
    }
  }

  // Group files by directory
  const fileTree = files.reduce(
    (acc, file) => {
      const parts = file.path.split("/")
      const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : "root"
      if (!acc[dir]) acc[dir] = []
      acc[dir].push(file)
      return acc
    },
    {} as Record<string, ProjectFile[]>,
  )

  return (
    <div className="flex h-full flex-col">
      <Tabs defaultValue="preview" className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-4">
          <TabsList className="h-12 bg-transparent">
            <TabsTrigger value="preview" className="gap-2">
              <Play className="h-4 w-4" />
              Sandpack
            </TabsTrigger>
            <TabsTrigger value="webcontainer" className="gap-2">
              <Box className="h-4 w-4" />
              WebContainer
            </TabsTrigger>
            <TabsTrigger value="editor" className="gap-2">
              <Edit3 className="h-4 w-4" />
              Editor
            </TabsTrigger>
            <TabsTrigger value="code" className="gap-2">
              <Code className="h-4 w-4" />
              Code
            </TabsTrigger>
            <TabsTrigger value="files" className="gap-2">
              <FileText className="h-4 w-4" />
              Dateien ({files.length})
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-2">
              <Terminal className="h-4 w-4" />
              Logs
            </TabsTrigger>
            <TabsTrigger value="suggestions" className="gap-2 relative">
              <Lightbulb className="h-4 w-4" />
              Vorschläge
              {pendingSuggestions.length > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1.5 text-xs">
                  {pendingSuggestions.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          <Button variant="ghost" size="sm" onClick={handleCopyAll}>
            {copied ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Kopiert
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                Alle kopieren
              </>
            )}
          </Button>
        </div>

        {/* Sandpack Preview Tab */}
        <TabsContent value="preview" className="mt-0 flex-1 overflow-hidden">
          <LivePreview files={files} onError={onPreviewError} />
        </TabsContent>

        {/* WebContainer Preview Tab */}
        <TabsContent value="webcontainer" className="mt-0 flex-1 overflow-hidden">
          <WebContainerPreview files={files} />
        </TabsContent>

        {/* Monaco Editor Tab */}
        <TabsContent value="editor" className="mt-0 flex-1 overflow-hidden">
          <CodeEditor />
        </TabsContent>

        <TabsContent value="code" className="mt-0 flex flex-1 overflow-hidden">
          {/* File list sidebar */}
          <div className="w-48 shrink-0 border-r border-border bg-secondary/30">
            <ScrollArea className="h-full">
              <div className="p-2">
                {Object.entries(fileTree).map(([dir, dirFiles]) => (
                  <div key={dir} className="mb-2">
                    {dir !== "root" && (
                      <div className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground">
                        <Folder className="h-3 w-3" />
                        {dir}
                      </div>
                    )}
                    {dirFiles.map((file) => {
                      const fileName = file.path.split("/").pop()
                      const isSelected = selectedFile?.id === file.id

                      return (
                        <button
                          key={file.id}
                          onClick={() => setSelectedFile(file)}
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                            isSelected ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
                          }`}
                        >
                          <File className="h-3 w-3 shrink-0" />
                          <span className="truncate">{fileName}</span>
                          {file.status === "created" && (
                            <Badge variant="outline" className="ml-auto text-[10px] px-1 py-0">
                              Neu
                            </Badge>
                          )}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Code display */}
          <div className="relative flex-1 min-h-0">
            {selectedFile ? (
              <>
                <div className="absolute top-0 left-0 right-0 flex shrink-0 items-center justify-between border-b border-border bg-secondary/50 px-4 py-2 z-10">
                  <span className="font-mono text-sm">{selectedFile.path}</span>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleCopy(selectedFile.content)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDownloadFile(selectedFile)}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeleteFile(selectedFile.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="absolute top-[41px] bottom-0 left-0 right-0 overflow-y-auto">
                  <pre className="p-4 text-sm">
                    <code className="font-mono whitespace-pre-wrap break-words">{selectedFile.content}</code>
                  </pre>
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">Wähle eine Datei aus</div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="files" className="mt-0 flex-1 overflow-hidden p-4">
          <ScrollArea className="h-full">
            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-3"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <span className="text-sm font-medium">{file.path}</span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{file.language}</span>
                        <span>|</span>
                        <span>{file.content.split("\n").length} Zeilen</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={file.status === "created" ? "default" : "secondary"}>
                      {file.status === "created" ? "Erstellt" : file.status === "modified" ? "Geändert" : "Gelöscht"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedFile(file)
                        const tabs = document.querySelector('[value="code"]') as HTMLElement
                        tabs?.click()
                      }}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="logs" className="mt-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <pre className="p-4 font-mono text-xs">
              {logs.length === 0 ? (
                <span className="text-muted-foreground">Keine Logs vorhanden</span>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className={`${
                      log.level === "error"
                        ? "text-destructive"
                        : log.level === "warn"
                          ? "text-yellow-500"
                          : log.level === "debug"
                            ? "text-blue-500"
                            : "text-muted-foreground"
                    }`}
                  >
                    [{new Date(log.timestamp).toLocaleTimeString("de-DE")}] [{log.level.toUpperCase()}] [{log.agent}]{" "}
                    {log.message}
                  </div>
                ))
              )}
            </pre>
          </ScrollArea>
        </TabsContent>

        {/* Suggestions Tab */}
        <TabsContent value="suggestions" className="mt-0 flex-1 overflow-hidden">
          <SuggestionPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}
