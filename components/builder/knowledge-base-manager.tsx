"use client"

import { useState, useEffect, useCallback } from "react"
import { useAgentStore } from "@/lib/agent-store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
  BarChart3
} from "lucide-react"

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

interface SearchResult {
  score: number
  content: string
  documentId: string
  documentName: string
  documentTitle: string | null
  category: string
}

const CATEGORIES = [
  { value: "general", label: "Allgemein" },
  { value: "documentation", label: "Dokumentation" },
  { value: "code", label: "Code-Beispiele" },
  { value: "guidelines", label: "Richtlinien" },
  { value: "templates", label: "Templates" },
  { value: "reference", label: "Referenz" },
]

export function KnowledgeBaseManager() {
  const { globalConfig } = useAgentStore()
  const [documents, setDocuments] = useState<RagDocument[]>([])
  const [stats, setStats] = useState<KnowledgeBaseStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  
  // Upload form state
  const [uploadTitle, setUploadTitle] = useState("")
  const [uploadDescription, setUploadDescription] = useState("")
  const [uploadCategory, setUploadCategory] = useState("general")
  const [uploadTags, setUploadTags] = useState("")
  
  // Verwende OpenAI wenn verfügbar, sonst OpenRouter als Fallback
  const apiKey = globalConfig.openaiApiKey || globalConfig.openrouterApiKey
  const provider = globalConfig.openaiApiKey ? "openai" : "openrouter"

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
    loadDocuments()
    loadStats()
  }, [loadDocuments, loadStats])

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

      const res = await fetch("/api/rag/upload", {
        method: "POST",
        body: formData,
      })
      const data = await res.json()

      if (data.success) {
        // Automatisch verarbeiten wenn API Key vorhanden
        if (apiKey) {
          setProcessing(data.document.id)
          await processDocument(data.document.id)
        }
        
        // Reset form
        setUploadTitle("")
        setUploadDescription("")
        setUploadCategory("general")
        setUploadTags("")
        
        // Reload documents
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
      // Reset file input
      e.target.value = ""
    }
  }

  const processDocument = async (documentId: string) => {
    if (!apiKey) {
      alert("Bitte OpenAI oder OpenRouter API Key in den Einstellungen konfigurieren")
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

  const handleSearch = async () => {
    if (!searchQuery.trim() || !apiKey) return

    setSearching(true)
    try {
      const res = await fetch("/api/rag/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, apiKey, topK: 5, provider }),
      })
      const data = await res.json()

      if (data.success) {
        setSearchResults(data.results)
      } else {
        alert(`Fehler: ${data.error}`)
      }
    } catch (error) {
      console.error("Such-Fehler:", error)
    } finally {
      setSearching(false)
    }
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ready":
        return <Badge variant="default" className="bg-green-600">Bereit</Badge>
      case "processing":
        return <Badge variant="secondary">Verarbeitung...</Badge>
      case "error":
        return <Badge variant="destructive">Fehler</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="flex flex-col h-full">
      <Tabs defaultValue="documents" className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="documents" className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            Dokumente
          </TabsTrigger>
          <TabsTrigger value="upload" className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Upload
          </TabsTrigger>
          <TabsTrigger value="search" className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Suche
          </TabsTrigger>
        </TabsList>

        {/* Statistiken Header */}
        {stats && (
          <div className="grid grid-cols-4 gap-2 p-3 bg-muted/50 rounded-lg mt-3">
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.totalDocuments}</div>
              <div className="text-xs text-muted-foreground">Dokumente</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-500">{stats.readyDocuments}</div>
              <div className="text-xs text-muted-foreground">Bereit</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.totalChunks}</div>
              <div className="text-xs text-muted-foreground">Chunks</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.categories.length}</div>
              <div className="text-xs text-muted-foreground">Kategorien</div>
            </div>
          </div>
        )}

        {/* Dokumente Tab */}
        <TabsContent value="documents" className="flex-1 mt-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">Knowledge Base Dokumente</h3>
            <Button variant="ghost" size="sm" onClick={() => { loadDocuments(); loadStats(); }}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
          
          <ScrollArea className="h-[400px]">
            {documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                <Database className="h-8 w-8 mb-2" />
                <p className="text-sm">Keine Dokumente vorhanden</p>
                <p className="text-xs">Lade Dokumente hoch um die Knowledge Base zu füllen</p>
              </div>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <Card key={doc.id} className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="mt-0.5">
                          {getStatusIcon(doc.status)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="font-medium truncate">{doc.title || doc.originalName}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span>{formatFileSize(doc.size)}</span>
                            <span>•</span>
                            <span>{doc.chunksCount} Chunks</span>
                            <span>•</span>
                            <Badge variant="outline" className="text-xs">
                              {CATEGORIES.find(c => c.value === doc.category)?.label || doc.category}
                            </Badge>
                          </div>
                          {doc.tags.length > 0 && (
                            <div className="flex items-center gap-1 mt-1">
                              <Tag className="h-3 w-3 text-muted-foreground" />
                              {doc.tags.map((tag, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {doc.errorMessage && (
                            <div className="text-xs text-red-500 mt-1">{doc.errorMessage}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        {getStatusBadge(doc.status)}
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
                          className="h-8 w-8 text-red-500 hover:text-red-600"
                          onClick={() => deleteDocument(doc.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
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
              <CardTitle className="text-base">Dokument hochladen</CardTitle>
              <CardDescription>
                Lade Dokumente hoch, die als Wissensquelle für die Agenten dienen
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!apiKey && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm text-yellow-600">
                  ⚠️ Kein API Key konfiguriert. Bitte OpenAI oder OpenRouter API Key in den Einstellungen hinterlegen.
                </div>
              )}
              
              <div className="space-y-2">
                <Label>Titel (optional)</Label>
                <Input
                  placeholder="Dokumenttitel"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Beschreibung (optional)</Label>
                <Input
                  placeholder="Kurze Beschreibung des Inhalts"
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Kategorie</Label>
                <Select value={uploadCategory} onValueChange={setUploadCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Tags (kommagetrennt)</Label>
                <Input
                  placeholder="z.B. react, typescript, api"
                  value={uploadTags}
                  onChange={(e) => setUploadTags(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Datei</Label>
                <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary transition-colors">
                  <input
                    type="file"
                    accept=".txt,.md,.json,.js,.jsx,.ts,.tsx,.html,.css,.csv"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="file-upload"
                    disabled={uploading}
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
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

        {/* Such Tab */}
        <TabsContent value="search" className="mt-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Search className="h-4 w-4" />
                Semantische Suche
              </CardTitle>
              <CardDescription>
                Durchsuche die Knowledge Base mit natürlicher Sprache
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!apiKey && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm text-yellow-600">
                  ⚠️ Kein API Key konfiguriert. Bitte OpenAI oder OpenRouter API Key in den Einstellungen hinterlegen.
                </div>
              )}
              
              <div className="flex gap-2">
                <Input
                  placeholder="Suchbegriff eingeben..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
                <Button onClick={handleSearch} disabled={!apiKey || searching || !searchQuery.trim()}>
                  {searching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>

              {searchResults.length > 0 && (
                <ScrollArea className="h-[300px]">
                  <div className="space-y-3">
                    {searchResults.map((result, i) => (
                      <Card key={i} className="p-3">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-sm">
                              {result.documentTitle || result.documentName}
                            </span>
                          </div>
                          <Badge variant="outline">
                            {(result.score * 100).toFixed(0)}% Match
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-3">
                          {result.content}
                        </p>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              )}

              {searchResults.length === 0 && searchQuery && !searching && (
                <div className="text-center text-muted-foreground text-sm py-8">
                  Keine Ergebnisse gefunden
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
