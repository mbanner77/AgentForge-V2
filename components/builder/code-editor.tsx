"use client"

import { useState, useCallback, useEffect } from "react"
import Editor from "@monaco-editor/react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { 
  Save, 
  Undo, 
  Redo, 
  Copy, 
  Check, 
  FileText, 
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  RefreshCw,
  Play
} from "lucide-react"
import { useAgentStore } from "@/lib/agent-store"
import type { ProjectFile } from "@/lib/types"
import { toast } from "sonner"

interface CodeEditorProps {
  onOpenInStackBlitz?: () => void
}

// Sprache basierend auf Dateierweiterung ermitteln
function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  const languageMap: Record<string, string> = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'css': 'css',
    'scss': 'scss',
    'html': 'html',
    'json': 'json',
    'md': 'markdown',
    'py': 'python',
    'java': 'java',
    'go': 'go',
    'rs': 'rust',
    'sql': 'sql',
    'yaml': 'yaml',
    'yml': 'yaml',
    'xml': 'xml',
    'sh': 'shell',
    'bash': 'shell',
  }
  return languageMap[ext || ''] || 'plaintext'
}

// Dateibaum-Struktur
interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'folder'
  children?: FileTreeNode[]
  file?: ProjectFile
}

function buildFileTree(files: ProjectFile[]): FileTreeNode[] {
  const root: FileTreeNode[] = []
  
  for (const file of files) {
    const parts = file.path.split('/')
    let current = root
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isFile = i === parts.length - 1
      const existingNode = current.find(n => n.name === part)
      
      if (existingNode) {
        if (!isFile && existingNode.children) {
          current = existingNode.children
        }
      } else {
        const newNode: FileTreeNode = {
          name: part,
          path: parts.slice(0, i + 1).join('/'),
          type: isFile ? 'file' : 'folder',
          children: isFile ? undefined : [],
          file: isFile ? file : undefined,
        }
        current.push(newNode)
        if (!isFile && newNode.children) {
          current = newNode.children
        }
      }
    }
  }
  
  // Sortiere: Ordner zuerst, dann alphabetisch
  const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name)
    }).map(node => ({
      ...node,
      children: node.children ? sortNodes(node.children) : undefined
    }))
  }
  
  return sortNodes(root)
}

// Dateibaum-Komponente
function FileTreeItem({ 
  node, 
  selectedPath, 
  onSelect,
  expandedFolders,
  onToggleFolder
}: { 
  node: FileTreeNode
  selectedPath: string | null
  onSelect: (file: ProjectFile) => void
  expandedFolders: Set<string>
  onToggleFolder: (path: string) => void
}) {
  const isExpanded = expandedFolders.has(node.path)
  const isSelected = selectedPath === node.path
  
  if (node.type === 'folder') {
    return (
      <div>
        <button
          className={`flex w-full items-center gap-1 px-2 py-1 text-sm hover:bg-secondary/50 rounded ${
            isSelected ? 'bg-secondary' : ''
          }`}
          onClick={() => onToggleFolder(node.path)}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <FolderOpen className="h-4 w-4 text-yellow-500" />
          <span className="truncate">{node.name}</span>
        </button>
        {isExpanded && node.children && (
          <div className="ml-4">
            {node.children.map(child => (
              <FileTreeItem
                key={child.path}
                node={child}
                selectedPath={selectedPath}
                onSelect={onSelect}
                expandedFolders={expandedFolders}
                onToggleFolder={onToggleFolder}
              />
            ))}
          </div>
        )}
      </div>
    )
  }
  
  return (
    <button
      className={`flex w-full items-center gap-1 px-2 py-1 text-sm hover:bg-secondary/50 rounded ${
        isSelected ? 'bg-primary/20 text-primary' : ''
      }`}
      onClick={() => node.file && onSelect(node.file)}
    >
      <FileText className="h-4 w-4 text-muted-foreground ml-4" />
      <span className="truncate">{node.name}</span>
    </button>
  )
}

export function CodeEditor({ onOpenInStackBlitz }: CodeEditorProps) {
  const { generatedFiles, updateFileByPath, deleteFile, addFile } = useAgentStore()
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null)
  const [editedContent, setEditedContent] = useState<string>("")
  const [hasChanges, setHasChanges] = useState(false)
  const [copied, setCopied] = useState(false)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['src', 'app', 'components']))
  
  // Wähle erste Datei wenn keine ausgewählt
  useEffect(() => {
    if (!selectedFile && generatedFiles.length > 0) {
      const appFile = generatedFiles.find(f => f.path.includes('App.')) || generatedFiles[0]
      setSelectedFile(appFile)
      setEditedContent(appFile.content)
    }
  }, [generatedFiles, selectedFile])
  
  // Update editedContent wenn selectedFile sich ändert
  useEffect(() => {
    if (selectedFile) {
      const currentFile = generatedFiles.find(f => f.id === selectedFile.id)
      if (currentFile && currentFile.content !== editedContent) {
        setEditedContent(currentFile.content)
        setHasChanges(false)
      }
    }
  }, [selectedFile?.id, generatedFiles])
  
  const handleFileSelect = useCallback((file: ProjectFile) => {
    if (hasChanges && selectedFile) {
      // Speichere Änderungen bevor Datei gewechselt wird
      updateFileByPath(selectedFile.path, editedContent, selectedFile.language)
    }
    setSelectedFile(file)
    setEditedContent(file.content)
    setHasChanges(false)
  }, [hasChanges, selectedFile, editedContent, updateFileByPath])
  
  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      setEditedContent(value)
      setHasChanges(value !== selectedFile?.content)
    }
  }, [selectedFile?.content])
  
  const handleSave = useCallback(() => {
    if (selectedFile && hasChanges) {
      updateFileByPath(selectedFile.path, editedContent, selectedFile.language)
      setHasChanges(false)
      toast.success(`${selectedFile.path} gespeichert`)
    }
  }, [selectedFile, editedContent, hasChanges, updateFileByPath])
  
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(editedContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [editedContent])
  
  const handleToggleFolder = useCallback((path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])
  
  const handleDeleteFile = useCallback(() => {
    if (selectedFile) {
      deleteFile(selectedFile.id)
      setSelectedFile(null)
      setEditedContent("")
      setHasChanges(false)
      toast.success(`${selectedFile.path} gelöscht`)
    }
  }, [selectedFile, deleteFile])
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])
  
  const fileTree = buildFileTree(generatedFiles)
  
  if (generatedFiles.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Keine Dateien vorhanden</p>
          <p className="text-sm mt-2">Generiere Code mit dem Chat</p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-3 py-2">
        <div className="flex items-center gap-2">
          {selectedFile && (
            <>
              <Badge variant="outline" className="font-mono text-xs">
                {selectedFile.path}
              </Badge>
              {hasChanges && (
                <Badge variant="secondary" className="text-xs bg-yellow-500/20 text-yellow-500">
                  Ungespeichert
                </Badge>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges}
            title="Speichern (Cmd/Ctrl+S)"
          >
            <Save className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            title="Kopieren"
          >
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDeleteFile}
            disabled={!selectedFile}
            className="text-destructive hover:text-destructive"
            title="Datei löschen"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          {onOpenInStackBlitz && (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenInStackBlitz}
              className="ml-2"
            >
              <Play className="h-4 w-4 mr-1" />
              StackBlitz
            </Button>
          )}
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex flex-1 min-h-0">
        {/* File Tree */}
        <div className="w-48 border-r border-border bg-secondary/20 flex flex-col">
          <div className="px-3 py-2 border-b border-border">
            <span className="text-xs font-medium text-muted-foreground uppercase">Dateien</span>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2">
              {fileTree.map(node => (
                <FileTreeItem
                  key={node.path}
                  node={node}
                  selectedPath={selectedFile?.path || null}
                  onSelect={handleFileSelect}
                  expandedFolders={expandedFolders}
                  onToggleFolder={handleToggleFolder}
                />
              ))}
            </div>
          </ScrollArea>
        </div>
        
        {/* Editor */}
        <div className="flex-1 min-h-0">
          {selectedFile ? (
            <Editor
              height="100%"
              language={getLanguageFromPath(selectedFile.path)}
              value={editedContent}
              onChange={handleEditorChange}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: "on",
                wordWrap: "on",
                automaticLayout: true,
                scrollBeyondLastLine: false,
                padding: { top: 10 },
                tabSize: 2,
                insertSpaces: true,
                formatOnPaste: true,
                formatOnType: true,
                bracketPairColorization: { enabled: true },
                guides: {
                  bracketPairs: true,
                  indentation: true,
                },
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Wähle eine Datei aus
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
