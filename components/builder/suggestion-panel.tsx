"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Check,
  X,
  AlertTriangle,
  Shield,
  Zap,
  RefreshCw,
  Bug,
  ChevronDown,
  ChevronRight,
  FileText,
  Eye,
} from "lucide-react"
import { useAgentStore } from "@/lib/agent-store"
import type { AgentSuggestion } from "@/lib/types"
import { toast } from "sonner"

const typeIcons: Record<AgentSuggestion["type"], typeof Bug> = {
  improvement: Zap,
  fix: Bug,
  refactor: RefreshCw,
  security: Shield,
  performance: Zap,
}

const typeLabels: Record<AgentSuggestion["type"], string> = {
  improvement: "Verbesserung",
  fix: "Bugfix",
  refactor: "Refactoring",
  security: "Sicherheit",
  performance: "Performance",
}

const priorityColors: Record<AgentSuggestion["priority"], string> = {
  low: "bg-gray-500",
  medium: "bg-yellow-500",
  high: "bg-orange-500",
  critical: "bg-red-500",
}

const priorityLabels: Record<AgentSuggestion["priority"], string> = {
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
  critical: "Kritisch",
}

interface SuggestionCardProps {
  suggestion: AgentSuggestion
  onApprove: () => void
  onReject: () => void
  onViewDiff: () => void
}

function SuggestionCard({ suggestion, onApprove, onReject, onViewDiff }: SuggestionCardProps) {
  const [expanded, setExpanded] = useState(false)
  const Icon = typeIcons[suggestion.type]

  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={`rounded-lg p-2 ${priorityColors[suggestion.priority]}/20`}>
            <Icon className={`h-5 w-5 ${priorityColors[suggestion.priority].replace("bg-", "text-")}`} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-medium">{suggestion.title}</h4>
              <Badge variant="outline" className="text-xs">
                {typeLabels[suggestion.type]}
              </Badge>
              <Badge className={`text-xs ${priorityColors[suggestion.priority]} text-white`}>
                {priorityLabels[suggestion.priority]}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{suggestion.description}</p>
            
            {/* Betroffene Dateien */}
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Dateien:</span>
              {suggestion.affectedFiles.map((file) => (
                <Badge key={file} variant="secondary" className="text-xs font-mono">
                  {file}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {suggestion.status === "pending" && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onViewDiff}
              title="Änderungen anzeigen"
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onReject}
              className="text-destructive hover:text-destructive"
              title="Ablehnen"
            >
              <X className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              onClick={onApprove}
              className="bg-green-600 hover:bg-green-700"
              title="Genehmigen & Anwenden"
            >
              <Check className="h-4 w-4 mr-1" />
              Anwenden
            </Button>
          </div>
        )}

        {suggestion.status === "approved" && (
          <Badge className="bg-blue-500">Genehmigt</Badge>
        )}

        {suggestion.status === "applied" && (
          <Badge className="bg-green-500">Angewendet</Badge>
        )}

        {suggestion.status === "rejected" && (
          <Badge variant="destructive">Abgelehnt</Badge>
        )}
      </div>

      {/* Expandable Details */}
      <button
        className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {expanded ? "Details ausblenden" : "Details anzeigen"}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {suggestion.suggestedChanges.map((change, index) => (
            <div key={index} className="rounded border border-border bg-background p-3">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono text-sm">{change.filePath}</span>
              </div>
              <pre className="text-xs bg-secondary/50 p-2 rounded overflow-x-auto max-h-40">
                <code>{change.newContent.slice(0, 500)}{change.newContent.length > 500 ? "..." : ""}</code>
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function SuggestionPanel() {
  const { pendingSuggestions, approveSuggestion, rejectSuggestion, applySuggestion, clearSuggestions } = useAgentStore()
  const [diffDialogOpen, setDiffDialogOpen] = useState(false)
  const [selectedSuggestion, setSelectedSuggestion] = useState<AgentSuggestion | null>(null)

  const pendingCount = pendingSuggestions.filter((s) => s.status === "pending").length

  const handleApprove = (suggestion: AgentSuggestion) => {
    approveSuggestion(suggestion.id)
    applySuggestion(suggestion.id)
    toast.success(`Vorschlag "${suggestion.title}" wurde angewendet`)
  }

  const handleReject = (suggestion: AgentSuggestion) => {
    rejectSuggestion(suggestion.id)
    toast.info(`Vorschlag "${suggestion.title}" wurde abgelehnt`)
  }

  const handleViewDiff = (suggestion: AgentSuggestion) => {
    setSelectedSuggestion(suggestion)
    setDiffDialogOpen(true)
  }

  if (pendingSuggestions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Keine Vorschläge vorhanden</p>
          <p className="text-sm mt-2">Agenten werden Verbesserungsvorschläge hier anzeigen</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">Agenten-Vorschläge</h3>
          {pendingCount > 0 && (
            <Badge variant="secondary" className="bg-orange-500/20 text-orange-500">
              {pendingCount} ausstehend
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={clearSuggestions}>
          Alle löschen
        </Button>
      </div>

      {/* Suggestions List */}
      <ScrollArea className="flex-1">
        <div className="space-y-3 p-4">
          {pendingSuggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              onApprove={() => handleApprove(suggestion)}
              onReject={() => handleReject(suggestion)}
              onViewDiff={() => handleViewDiff(suggestion)}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Diff Dialog */}
      <Dialog open={diffDialogOpen} onOpenChange={setDiffDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Änderungen: {selectedSuggestion?.title}</DialogTitle>
            <DialogDescription>
              Überprüfe die vorgeschlagenen Änderungen bevor du sie anwendest.
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 mt-4">
            <div className="space-y-4">
              {selectedSuggestion?.suggestedChanges.map((change, index) => (
                <div key={index} className="rounded-lg border border-border">
                  <div className="flex items-center gap-2 px-4 py-2 bg-secondary/50 border-b border-border">
                    <FileText className="h-4 w-4" />
                    <span className="font-mono text-sm">{change.filePath}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-0">
                    <div className="border-r border-border">
                      <div className="px-3 py-1 bg-red-500/10 text-xs font-medium text-red-500">
                        Original
                      </div>
                      <pre className="p-3 text-xs overflow-x-auto max-h-60 bg-red-500/5">
                        <code>{change.originalContent || "(Neue Datei)"}</code>
                      </pre>
                    </div>
                    <div>
                      <div className="px-3 py-1 bg-green-500/10 text-xs font-medium text-green-500">
                        Neu
                      </div>
                      <pre className="p-3 text-xs overflow-x-auto max-h-60 bg-green-500/5">
                        <code>{change.newContent}</code>
                      </pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDiffDialogOpen(false)}>
              Schließen
            </Button>
            {selectedSuggestion?.status === "pending" && (
              <>
                <Button
                  variant="destructive"
                  onClick={() => {
                    handleReject(selectedSuggestion)
                    setDiffDialogOpen(false)
                  }}
                >
                  <X className="h-4 w-4 mr-1" />
                  Ablehnen
                </Button>
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => {
                    handleApprove(selectedSuggestion)
                    setDiffDialogOpen(false)
                  }}
                >
                  <Check className="h-4 w-4 mr-1" />
                  Genehmigen & Anwenden
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
