"use client"

import { useState, useEffect, useCallback } from "react"
import { useAgentStore } from "@/lib/agent-store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { 
  Upload, 
  FileText, 
  Trash2, 
  Search, 
  Database,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  FolderOpen,
  Tag,
  Settings,
  Users,
  Brain,
  Code2,
  Eye,
  Shield,
  Play,
  Edit,
  Save,
  X
} from "lucide-react"
import { marketplaceAgents } from "@/lib/marketplace-agents"

interface RagDocument {
  id: string
  filename: string
  originalName: string
  mimeType: string
  size: number
  title: string | null
  description: string | null
  tags: string[]
  category: string
  allowedAgents: string[]
  status: string
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  chunksCount: number
}

interface KnowledgeBaseStats {
  totalDocuments: number
  readyDocuments: number
  processingDocuments: number
  errorDocuments: number
  totalChunks: number
  categories: { name: string; count: number }[]
}

const CATEGORIES = [
  { value: "general", label: "Allgemein" },
  { value: "documentation", label: "Dokumentation" },
  { value: "code", label: "Code-Beispiele" },
  { value: "guidelines", label: "Richtlinien" },
  { value: "templates", label: "Templates" },
  { value: "reference", label: "Referenz" },
]

const CORE_AGENTS = [
  { id: "planner", name: "Planner Agent", icon: Brain, color: "text-purple-500" },
  { id: "coder", name: "Coder Agent", icon: Code2, color: "text-blue-500" },
  { id: "reviewer", name: "Reviewer Agent", icon: Eye, color: "text-green-500" },
  { id: "security", name: "Security Agent", icon: Shield, color: "text-red-500" },
  { id: "executor", name: "Executor Agent", icon: Play, color: "text-orange-500" },
]

interface KnowledgeBaseDialogProps {
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function KnowledgeBaseDialog({ trigger, open, onOpenChange }: KnowledgeBaseDialogProps) {
  const { globalConfig, installedAgents } = useAgentStore()
  const [documents, setDocuments] = useState<RagDocument[]>([])
  const [stats, setStats] = useState<KnowledgeBaseStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [editingDocument, setEditingDocument] = useState<RagDocument | null>(null)
  
  // Upload form state
  const [uploadTitle, setUploadTitle] = useState("")
  const [uploadDescription, setUploadDescription] = useState("")
  const [uploadCategory, setUploadCategory] = useState("general")
  const [uploadTags, setUploadTags] = useState("")
  const [uploadAllowedAgents, setUploadAllowedAgents] = useState<string[]>([])
  
  // Verwende OpenAI wenn verfügbar, sonst OpenRouter
  const apiKey = globalConfig.openaiApiKey || globalConfig.openrouterApiKey
  const provider = globalConfig.openaiApiKey ? "openai" : "openrouter"

  // Alle verfügbaren Agenten (Core + Marketplace)
  const allAgents = [
    ...CORE_AGENTS,
    ...marketplaceAgents
      .filter(a => !CORE_AGENTS.find(c => c.id === a.id))
      .map(a => ({ id: a.id, name: a.name, icon: Brain, color: a.color }))
  ]

  const loadDocuments = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/rag/documents")
      const data = await res.json()
      if (data.success) {
        setDocuments(data.documents)
      }
    } catch (error) {
      console.error("Fehler beim Laden der Dokumente:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/rag/stats")
      const data = await res.json()
      if (data.success) {
        setStats(data.stats)
      }
    } catch (error) {
      console.error("Fehler beim Laden der Statistiken:", error)
    }
  }, [])

  useEffect(() => {
    if (open) {
      loadDocuments()
      loadStats()
    }
  }, [open, loadDocuments, loadStats])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("title", uploadTitle || file.name)
      formData.append("description", uploadDescription)
      formData.append("category", uploadCategory)
      formData.append("tags", uploadTags)
      formData.append("allowedAgents", JSON.stringify(uploadAllowedAgents))

      const res = await fetch("/api/rag/upload", {
        method: "POST",
        body: formData,
      })
      const data = await res.json()

      if (data.success) {
        if (apiKey) {
          setProcessing(data.document.id)
          await processDocument(data.document.id)
        }
        
        // Reset form
        setUploadTitle("")
        setUploadDescription("")
        setUploadCategory("general")
        setUploadTags("")
        setUploadAllowedAgents([])
        
        await loadDocuments()
        await loadStats()
      } else {
        alert(`Fehler: ${data.error}`)
      }
    } catch (error) {
      console.error("Upload-Fehler:", error)
      alert("Fehler beim Hochladen der Datei")
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  const processDocument = async (documentId: string) => {
    if (!apiKey) {
      alert("Bitte OpenAI API Key in den Einstellungen konfigurieren")
      return
    }

    setProcessing(documentId)
    try {
      const res = await fetch("/api/rag/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, apiKey, provider }),
      })
      const data = await res.json()

      if (!data.success) {
        alert(`Fehler: ${data.error}`)
      }
      
      await loadDocuments()
      await loadStats()
    } catch (error) {
      console.error("Processing-Fehler:", error)
      alert("Fehler bei der Verarbeitung")
    } finally {
      setProcessing(null)
    }
  }

  const deleteDocument = async (documentId: string) => {
    if (!confirm("Dokument wirklich löschen?")) return

    try {
      const res = await fetch(`/api/rag/documents?id=${documentId}`, {
        method: "DELETE",
      })
      const data = await res.json()

      if (data.success) {
        await loadDocuments()
        await loadStats()
      } else {
        alert(`Fehler: ${data.error}`)
      }
    } catch (error) {
      console.error("Lösch-Fehler:", error)
      alert("Fehler beim Löschen")
    }
  }

  const updateDocument = async (doc: RagDocument) => {
    try {
      const res = await fetch("/api/rag/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: doc.id,
          title: doc.title,
          description: doc.description,
          category: doc.category,
          tags: doc.tags,
          allowedAgents: doc.allowedAgents,
        }),
      })
      const data = await res.json()

      if (data.success) {
        setEditingDocument(null)
        await loadDocuments()
      } else {
        alert(`Fehler: ${data.error}`)
      }
    } catch (error) {
      console.error("Update-Fehler:", error)
      alert("Fehler beim Aktualisieren")
    }
  }

  const toggleAgentAccess = (agentId: string, doc: RagDocument) => {
    const newAllowedAgents = doc.allowedAgents.includes(agentId)
      ? doc.allowedAgents.filter(id => id !== agentId)
      : [...doc.allowedAgents, agentId]
    
    setEditingDocument({ ...doc, allowedAgents: newAllowedAgents })
  }

  const toggleUploadAgentAccess = (agentId: string) => {
    setUploadAllowedAgents(prev => 
      prev.includes(agentId)
        ? prev.filter(id => id !== agentId)
        : [...prev, agentId]
    )
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "ready":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case "processing":
        return <Clock className="h-4 w-4 text-yellow-500 animate-spin" />
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <Clock className="h-4 w-4 text-gray-500" />
    }
  }

  const filteredDocuments = documents.filter(doc => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      doc.title?.toLowerCase().includes(query) ||
      doc.originalName.toLowerCase().includes(query) ||
      doc.description?.toLowerCase().includes(query) ||
      doc.tags.some(t => t.toLowerCase().includes(query))
    )
  })

  const dialogContent = (
    <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Knowledge Base Manager
        </DialogTitle>
        <DialogDescription>
          Verwalte Dokumente und kontrolliere den Zugriff für jeden Agenten
        </DialogDescription>
      </DialogHeader>

      {/* Statistiken */}
      {stats && (
        <div className="grid grid-cols-5 gap-2 p-3 bg-muted/50 rounded-lg">
          <div className="text-center">
            <div className="text-xl font-bold">{stats.totalDocuments}</div>
            <div className="text-xs text-muted-foreground">Dokumente</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-green-500">{stats.readyDocuments}</div>
            <div className="text-xs text-muted-foreground">Bereit</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-yellow-500">{stats.processingDocuments}</div>
            <div className="text-xs text-muted-foreground">Verarbeitung</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold">{stats.totalChunks}</div>
            <div className="text-xs text-muted-foreground">Chunks</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold">{stats.categories.length}</div>
            <div className="text-xs text-muted-foreground">Kategorien</div>
          </div>
        </div>
      )}

      <Tabs defaultValue="documents" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="documents" className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            Dokumente ({documents.length})
          </TabsTrigger>
          <TabsTrigger value="upload" className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Hochladen
          </TabsTrigger>
        </TabsList>

        {/* Dokumente Tab */}
        <TabsContent value="documents" className="flex-1 overflow-hidden flex flex-col mt-3">
          {/* Suchleiste */}
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Dokumente durchsuchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button variant="ghost" size="icon" onClick={() => { loadDocuments(); loadStats(); }}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          <ScrollArea className="flex-1">
            {filteredDocuments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                <Database className="h-10 w-10 mb-3" />
                <p className="text-sm">Keine Dokumente gefunden</p>
              </div>
            ) : (
              <div className="space-y-2 pr-4">
                {filteredDocuments.map((doc) => (
                  <Card key={doc.id} className="p-3">
                    {editingDocument?.id === doc.id ? (
                      // Edit Mode
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Input
                            value={editingDocument.title || ""}
                            onChange={(e) => setEditingDocument({ ...editingDocument, title: e.target.value })}
                            placeholder="Titel"
                            className="flex-1 mr-2"
                          />
                          <div className="flex gap-1">
                            <Button size="sm" onClick={() => updateDocument(editingDocument)}>
                              <Save className="h-4 w-4 mr-1" /> Speichern
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingDocument(null)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        
                        <Textarea
                          value={editingDocument.description || ""}
                          onChange={(e) => setEditingDocument({ ...editingDocument, description: e.target.value })}
                          placeholder="Beschreibung"
                          rows={2}
                        />
                        
                        <div className="flex gap-2">
                          <Select 
                            value={editingDocument.category} 
                            onValueChange={(v) => setEditingDocument({ ...editingDocument, category: v })}
                          >
                            <SelectTrigger className="w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CATEGORIES.map(cat => (
                                <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            value={editingDocument.tags.join(", ")}
                            onChange={(e) => setEditingDocument({ 
                              ...editingDocument, 
                              tags: e.target.value.split(",").map(t => t.trim()).filter(Boolean) 
                            })}
                            placeholder="Tags (kommagetrennt)"
                            className="flex-1"
                          />
                        </div>

                        {/* Agent-Zugriffskontrolle */}
                        <div className="space-y-2">
                          <Label className="text-sm font-medium flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            Agent-Zugriff {editingDocument.allowedAgents.length === 0 && "(Alle)"}
                          </Label>
                          <div className="grid grid-cols-3 gap-2">
                            {allAgents.map(agent => {
                              const isAllowed = editingDocument.allowedAgents.length === 0 || 
                                               editingDocument.allowedAgents.includes(agent.id)
                              return (
                                <div 
                                  key={agent.id}
                                  className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                                    isAllowed ? "bg-primary/10 border-primary" : "bg-muted/50 border-transparent"
                                  }`}
                                  onClick={() => toggleAgentAccess(agent.id, editingDocument)}
                                >
                                  <Checkbox checked={isAllowed} />
                                  <span className="text-xs">{agent.name}</span>
                                </div>
                              )
                            })}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Keine Auswahl = Alle Agenten haben Zugriff
                          </p>
                        </div>
                      </div>
                    ) : (
                      // View Mode
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="mt-0.5">{getStatusIcon(doc.status)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <span className="font-medium truncate">{doc.title || doc.originalName}</span>
                            </div>
                            {doc.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{doc.description}</p>
                            )}
                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                              <span>{formatFileSize(doc.size)}</span>
                              <span>•</span>
                              <span>{doc.chunksCount} Chunks</span>
                              <span>•</span>
                              <Badge variant="outline" className="text-xs">
                                {CATEGORIES.find(c => c.value === doc.category)?.label || doc.category}
                              </Badge>
                            </div>
                            {doc.tags.length > 0 && (
                              <div className="flex items-center gap-1 mt-1 flex-wrap">
                                <Tag className="h-3 w-3 text-muted-foreground" />
                                {doc.tags.slice(0, 3).map((tag, i) => (
                                  <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
                                ))}
                                {doc.tags.length > 3 && (
                                  <span className="text-xs text-muted-foreground">+{doc.tags.length - 3}</span>
                                )}
                              </div>
                            )}
                            {/* Agent-Zugriff Anzeige */}
                            <div className="flex items-center gap-1 mt-2">
                              <Users className="h-3 w-3 text-muted-foreground" />
                              {doc.allowedAgents.length === 0 ? (
                                <span className="text-xs text-muted-foreground">Alle Agenten</span>
                              ) : (
                                <div className="flex gap-1 flex-wrap">
                                  {doc.allowedAgents.slice(0, 3).map(agentId => {
                                    const agent = allAgents.find(a => a.id === agentId)
                                    return (
                                      <Badge key={agentId} variant="outline" className="text-xs">
                                        {agent?.name || agentId}
                                      </Badge>
                                    )
                                  })}
                                  {doc.allowedAgents.length > 3 && (
                                    <span className="text-xs text-muted-foreground">
                                      +{doc.allowedAgents.length - 3}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          {doc.status === "processing" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => processDocument(doc.id)}
                              disabled={!apiKey || processing === doc.id}
                            >
                              <RefreshCw className={`h-4 w-4 ${processing === doc.id ? "animate-spin" : ""}`} />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setEditingDocument(doc)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-600"
                            onClick={() => deleteDocument(doc.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* Upload Tab */}
        <TabsContent value="upload" className="mt-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Neues Dokument hochladen</CardTitle>
              <CardDescription>
                Lade Dokumente hoch und definiere welche Agenten darauf zugreifen können
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!apiKey && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm text-yellow-600">
                  ⚠️ Kein API Key konfiguriert. Bitte OpenAI oder OpenRouter API Key in den Einstellungen hinterlegen um Dokumente zu verarbeiten.
                </div>
              )}
              {apiKey && provider === "openrouter" && (
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm text-blue-600">
                  ℹ️ Verwende OpenRouter für Embeddings (OpenAI Key nicht konfiguriert)
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Titel</Label>
                  <Input
                    placeholder="Dokumenttitel"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Kategorie</Label>
                  <Select value={uploadCategory} onValueChange={setUploadCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(cat => (
                        <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Beschreibung</Label>
                <Textarea
                  placeholder="Kurze Beschreibung des Inhalts"
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Tags (kommagetrennt)</Label>
                <Input
                  placeholder="z.B. react, typescript, api"
                  value={uploadTags}
                  onChange={(e) => setUploadTags(e.target.value)}
                />
              </div>

              {/* Agent-Zugriffskontrolle */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Agent-Zugriff {uploadAllowedAgents.length === 0 && "(Alle Agenten)"}
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  {allAgents.map(agent => {
                    const isSelected = uploadAllowedAgents.includes(agent.id)
                    return (
                      <div 
                        key={agent.id}
                        className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                          isSelected ? "bg-primary/10 border-primary" : "bg-muted/50 border-transparent hover:border-muted-foreground/20"
                        }`}
                        onClick={() => toggleUploadAgentAccess(agent.id)}
                      >
                        <Checkbox checked={isSelected} />
                        <span className="text-xs">{agent.name}</span>
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Wähle spezifische Agenten aus, oder lasse leer für Zugriff durch alle Agenten
                </p>
              </div>

              <div className="space-y-2">
                <Label>Datei</Label>
                <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary transition-colors">
                  <input
                    type="file"
                    accept=".txt,.md,.json,.js,.jsx,.ts,.tsx,.html,.css,.csv"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="file-upload-dialog"
                    disabled={uploading}
                  />
                  <label htmlFor="file-upload-dialog" className="cursor-pointer">
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {uploading ? "Wird hochgeladen..." : "Klicken oder Datei hierher ziehen"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      TXT, MD, JSON, JS, TS, HTML, CSS
                    </p>
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DialogContent>
  )

  if (trigger) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        {dialogContent}
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {dialogContent}
    </Dialog>
  )
}
