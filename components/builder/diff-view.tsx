"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ChevronDown, ChevronRight, Plus, Minus, FileCode, Check, X } from "lucide-react"

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged'
  content: string
  lineNumber: number
}

interface FileDiff {
  path: string
  oldContent: string
  newContent: string
  changes: DiffLine[]
}

interface DiffViewProps {
  diffs: FileDiff[]
  onApply?: (path: string) => void
  onReject?: (path: string) => void
}

// Einfacher Diff-Algorithmus
function computeDiff(oldContent: string, newContent: string): DiffLine[] {
  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')
  const result: DiffLine[] = []
  
  let oldIndex = 0
  let newIndex = 0
  let lineNumber = 1
  
  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    const oldLine = oldLines[oldIndex]
    const newLine = newLines[newIndex]
    
    if (oldLine === newLine) {
      // Unverändert
      result.push({ type: 'unchanged', content: oldLine || '', lineNumber: lineNumber++ })
      oldIndex++
      newIndex++
    } else if (oldIndex < oldLines.length && !newLines.includes(oldLine)) {
      // Entfernt
      result.push({ type: 'removed', content: oldLine, lineNumber: lineNumber++ })
      oldIndex++
    } else if (newIndex < newLines.length) {
      // Hinzugefügt
      result.push({ type: 'added', content: newLine, lineNumber: lineNumber++ })
      newIndex++
    } else {
      oldIndex++
      newIndex++
    }
  }
  
  return result
}

export function DiffView({ diffs, onApply, onReject }: DiffViewProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set(diffs.map(d => d.path)))

  const toggleFile = (path: string) => {
    const newExpanded = new Set(expandedFiles)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    setExpandedFiles(newExpanded)
  }

  if (diffs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Keine Änderungen
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {diffs.map((diff) => {
        const isExpanded = expandedFiles.has(diff.path)
        const changes = computeDiff(diff.oldContent, diff.newContent)
        const addedCount = changes.filter(c => c.type === 'added').length
        const removedCount = changes.filter(c => c.type === 'removed').length

        return (
          <div key={diff.path} className="border border-border rounded-lg overflow-hidden">
            {/* Header */}
            <div 
              className="flex items-center justify-between px-3 py-2 bg-secondary/50 cursor-pointer hover:bg-secondary/70 transition-colors"
              onClick={() => toggleFile(diff.path)}
            >
              <div className="flex items-center gap-2">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <FileCode className="h-4 w-4 text-blue-400" />
                <span className="font-mono text-sm">{diff.path}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-green-400 flex items-center gap-1">
                  <Plus className="h-3 w-3" />
                  {addedCount}
                </span>
                <span className="text-xs text-red-400 flex items-center gap-1">
                  <Minus className="h-3 w-3" />
                  {removedCount}
                </span>
                {onApply && onReject && (
                  <div className="flex gap-1 ml-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-green-400 hover:bg-green-500/20"
                      onClick={(e) => { e.stopPropagation(); onApply(diff.path) }}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-red-400 hover:bg-red-500/20"
                      onClick={(e) => { e.stopPropagation(); onReject(diff.path) }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Diff Content */}
            {isExpanded && (
              <ScrollArea className="max-h-[400px]">
                <div className="font-mono text-xs">
                  {changes.map((line, idx) => (
                    <div
                      key={idx}
                      className={`px-3 py-0.5 flex ${
                        line.type === 'added' 
                          ? 'bg-green-500/10 text-green-300' 
                          : line.type === 'removed'
                            ? 'bg-red-500/10 text-red-300'
                            : 'text-muted-foreground'
                      }`}
                    >
                      <span className="w-8 text-right pr-2 select-none opacity-50">
                        {line.lineNumber}
                      </span>
                      <span className="w-4 select-none">
                        {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                      </span>
                      <span className="flex-1 whitespace-pre">{line.content}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Hilfsfunktion zum Erstellen von Diffs aus alten und neuen Dateien
export function createFileDiffs(
  oldFiles: { path: string; content: string }[],
  newFiles: { path: string; content: string }[]
): FileDiff[] {
  const diffs: FileDiff[] = []
  
  // Geänderte und neue Dateien
  for (const newFile of newFiles) {
    const oldFile = oldFiles.find(f => f.path === newFile.path)
    if (!oldFile) {
      // Neue Datei
      diffs.push({
        path: newFile.path,
        oldContent: '',
        newContent: newFile.content,
        changes: []
      })
    } else if (oldFile.content !== newFile.content) {
      // Geänderte Datei
      diffs.push({
        path: newFile.path,
        oldContent: oldFile.content,
        newContent: newFile.content,
        changes: []
      })
    }
  }
  
  // Gelöschte Dateien
  for (const oldFile of oldFiles) {
    if (!newFiles.find(f => f.path === oldFile.path)) {
      diffs.push({
        path: oldFile.path,
        oldContent: oldFile.content,
        newContent: '',
        changes: []
      })
    }
  }
  
  return diffs
}
