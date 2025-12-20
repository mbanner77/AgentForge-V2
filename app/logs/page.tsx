"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  ArrowLeft,
  FileText,
  Search,
  Info,
  AlertTriangle,
  XCircle,
  Bug,
  Filter,
  Download,
  Trash2,
  RefreshCw,
  Bot,
  Brain,
  Code2,
  Eye,
  Shield,
  Play,
} from "lucide-react"
import { useAgentStore } from "@/lib/agent-store"
import { useAuth } from "@/lib/auth"
import { useRouter } from "next/navigation"
import type { LogEntry, AgentType } from "@/lib/types"

const agentIcons: Record<string, any> = {
  planner: Brain,
  coder: Code2,
  reviewer: Eye,
  security: Shield,
  executor: Play,
  system: Bot,
}

const agentColors: Record<string, string> = {
  planner: "text-blue-500",
  coder: "text-green-500",
  reviewer: "text-purple-500",
  security: "text-orange-500",
  executor: "text-cyan-500",
  system: "text-gray-500",
}

const levelIcons: Record<string, any> = {
  info: Info,
  warn: AlertTriangle,
  error: XCircle,
  debug: Bug,
}

const levelColors: Record<string, string> = {
  info: "text-blue-500 bg-blue-500/10",
  warn: "text-yellow-500 bg-yellow-500/10",
  error: "text-red-500 bg-red-500/10",
  debug: "text-gray-500 bg-gray-500/10",
}

export default function LogsPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuth()
  const { logs, clearLogs } = useAgentStore()
  
  const [searchQuery, setSearchQuery] = useState("")
  const [levelFilter, setLevelFilter] = useState<string>("all")
  const [agentFilter, setAgentFilter] = useState<string>("all")
  const [autoRefresh, setAutoRefresh] = useState(false)

  if (!isAuthenticated) {
    router.push("/builder/login")
    return null
  }

  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.message.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesLevel = levelFilter === "all" || log.level === levelFilter
    const matchesAgent = agentFilter === "all" || log.agent === agentFilter
    return matchesSearch && matchesLevel && matchesAgent
  }).reverse() // Show newest first

  const formatTimestamp = (date: Date) => {
    return new Date(date).toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    })
  }

  const handleExport = () => {
    const content = filteredLogs.map(log => 
      `[${formatTimestamp(log.timestamp)}] [${log.level.toUpperCase()}] [${log.agent}] ${log.message}`
    ).join("\n")
    
    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `agentforge-logs-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Link href="/builder">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Zurück
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">System-Logs</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{filteredLogs.length} Einträge</Badge>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={clearLogs} className="text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              Löschen
            </Button>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="border-b border-border bg-card/50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex gap-4 items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Logs durchsuchen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Level</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="warn">Warning</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="debug">Debug</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Agenten</SelectItem>
              <SelectItem value="system">System</SelectItem>
              <SelectItem value="planner">Planner</SelectItem>
              <SelectItem value="coder">Coder</SelectItem>
              <SelectItem value="reviewer">Reviewer</SelectItem>
              <SelectItem value="security">Security</SelectItem>
              <SelectItem value="executor">Executor</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? "animate-spin" : ""}`} />
            Auto
          </Button>
        </div>
      </div>

      {/* Logs */}
      <main className="max-w-7xl mx-auto p-4">
        {filteredLogs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Keine Logs vorhanden</p>
              <p className="text-sm text-muted-foreground">Starte einen Workflow, um Logs zu generieren</p>
            </CardContent>
          </Card>
        ) : (
          <ScrollArea className="h-[calc(100vh-12rem)]">
            <div className="space-y-1 font-mono text-sm">
              {filteredLogs.map((log, index) => {
                const LevelIcon = levelIcons[log.level] || Info
                const AgentIcon = agentIcons[log.agent] || Bot
                const agentColor = agentColors[log.agent] || "text-gray-500"
                const levelColor = levelColors[log.level] || "text-gray-500"
                
                return (
                  <div 
                    key={log.id || index}
                    className={`flex items-start gap-2 p-2 rounded hover:bg-secondary/50 ${
                      log.level === "error" ? "bg-red-500/5" : 
                      log.level === "warn" ? "bg-yellow-500/5" : ""
                    }`}
                  >
                    <span className="text-muted-foreground shrink-0 w-24">
                      {formatTimestamp(log.timestamp)}
                    </span>
                    <Badge variant="outline" className={`${levelColor} shrink-0 w-16 justify-center`}>
                      <LevelIcon className="h-3 w-3 mr-1" />
                      {log.level}
                    </Badge>
                    <Badge variant="outline" className={`${agentColor} shrink-0 w-24 justify-center`}>
                      <AgentIcon className="h-3 w-3 mr-1" />
                      {log.agent}
                    </Badge>
                    <span className="flex-1 break-all">{log.message}</span>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        )}

        {/* Summary Stats */}
        <div className="mt-4 grid grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-xl font-bold">{logs.length}</div>
              <div className="text-xs text-muted-foreground">Gesamt</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-xl font-bold text-blue-500">
                {logs.filter(l => l.level === "info").length}
              </div>
              <div className="text-xs text-muted-foreground">Info</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-xl font-bold text-yellow-500">
                {logs.filter(l => l.level === "warn").length}
              </div>
              <div className="text-xs text-muted-foreground">Warnings</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-xl font-bold text-red-500">
                {logs.filter(l => l.level === "error").length}
              </div>
              <div className="text-xs text-muted-foreground">Errors</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-xl font-bold text-gray-500">
                {logs.filter(l => l.level === "debug").length}
              </div>
              <div className="text-xs text-muted-foreground">Debug</div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
