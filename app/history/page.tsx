"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import {
  ArrowLeft,
  History,
  Search,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Filter,
  Calendar,
  Bot,
  FileText,
  Trash2,
  Eye,
  RotateCcw,
} from "lucide-react"
import { useAgentStore } from "@/lib/agent-store"
import { useAuth } from "@/lib/auth"
import { useRouter } from "next/navigation"

interface WorkflowHistoryItem {
  id: string
  projectName: string
  workflowName: string
  status: "completed" | "failed" | "running"
  startedAt: Date
  completedAt?: Date
  duration?: number
  nodesExecuted: number
  totalNodes: number
  filesGenerated: number
  error?: string
}

// Mock history data - in production, this comes from the database
const mockHistory: WorkflowHistoryItem[] = [
  {
    id: "1",
    projectName: "Todo App",
    workflowName: "Standard Workflow",
    status: "completed",
    startedAt: new Date(Date.now() - 3600000),
    completedAt: new Date(Date.now() - 3500000),
    duration: 100,
    nodesExecuted: 5,
    totalNodes: 5,
    filesGenerated: 4,
  },
  {
    id: "2",
    projectName: "Dashboard",
    workflowName: "Security Review",
    status: "completed",
    startedAt: new Date(Date.now() - 86400000),
    completedAt: new Date(Date.now() - 86300000),
    duration: 100,
    nodesExecuted: 6,
    totalNodes: 6,
    filesGenerated: 8,
  },
  {
    id: "3",
    projectName: "API Server",
    workflowName: "Standard Workflow",
    status: "failed",
    startedAt: new Date(Date.now() - 172800000),
    nodesExecuted: 3,
    totalNodes: 5,
    filesGenerated: 2,
    error: "Coder Agent timeout",
  },
]

export default function HistoryPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuth()
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "failed" | "running">("all")

  if (!isAuthenticated) {
    router.push("/builder/login")
    return null
  }

  const filteredHistory = mockHistory.filter(item => {
    const matchesSearch = item.projectName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.workflowName.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === "all" || item.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${minutes}m ${secs}s`
  }

  const formatDate = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000)
      return `vor ${minutes} Minuten`
    }
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000)
      return `vor ${hours} Stunden`
    }
    return date.toLocaleDateString("de-DE", { 
      day: "2-digit", 
      month: "2-digit", 
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    })
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4 max-w-6xl mx-auto">
          <div className="flex items-center gap-4">
            <Link href="/builder">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Zurück
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">Workflow-Verlauf</h1>
            </div>
          </div>
          <Badge variant="outline">{filteredHistory.length} Einträge</Badge>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto p-6">
        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Suchen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={statusFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("all")}
            >
              Alle
            </Button>
            <Button
              variant={statusFilter === "completed" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("completed")}
              className="gap-2"
            >
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Erfolgreich
            </Button>
            <Button
              variant={statusFilter === "failed" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("failed")}
              className="gap-2"
            >
              <XCircle className="h-4 w-4 text-red-500" />
              Fehlgeschlagen
            </Button>
          </div>
        </div>

        {/* History List */}
        <div className="space-y-4">
          {filteredHistory.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <History className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Keine Einträge gefunden</p>
              </CardContent>
            </Card>
          ) : (
            filteredHistory.map((item) => (
              <Card key={item.id} className={`transition-all hover:border-primary/50 ${
                item.status === "failed" ? "border-red-500/30" : ""
              }`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {item.status === "completed" && (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        )}
                        {item.status === "failed" && (
                          <XCircle className="h-5 w-5 text-red-500" />
                        )}
                        {item.status === "running" && (
                          <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                        )}
                        <div>
                          <h3 className="font-semibold">{item.projectName}</h3>
                          <p className="text-sm text-muted-foreground">{item.workflowName}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {formatDate(item.startedAt)}
                        </span>
                        {item.duration && (
                          <span>Dauer: {formatDuration(item.duration)}</span>
                        )}
                        <span className="flex items-center gap-1">
                          <Bot className="h-4 w-4" />
                          {item.nodesExecuted}/{item.totalNodes} Nodes
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText className="h-4 w-4" />
                          {item.filesGenerated} Dateien
                        </span>
                      </div>

                      {item.error && (
                        <div className="mt-2 text-sm text-red-500 bg-red-500/10 rounded px-2 py-1">
                          Fehler: {item.error}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" title="Details anzeigen">
                        <Eye className="h-4 w-4" />
                      </Button>
                      {item.status === "failed" && (
                        <Button variant="ghost" size="sm" title="Erneut ausführen">
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" title="Löschen" className="text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Statistics */}
        <div className="mt-8 grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-primary">{mockHistory.length}</div>
              <div className="text-sm text-muted-foreground">Gesamt</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-green-500">
                {mockHistory.filter(h => h.status === "completed").length}
              </div>
              <div className="text-sm text-muted-foreground">Erfolgreich</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-red-500">
                {mockHistory.filter(h => h.status === "failed").length}
              </div>
              <div className="text-sm text-muted-foreground">Fehlgeschlagen</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-blue-500">
                {mockHistory.reduce((sum, h) => sum + h.filesGenerated, 0)}
              </div>
              <div className="text-sm text-muted-foreground">Dateien generiert</div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
