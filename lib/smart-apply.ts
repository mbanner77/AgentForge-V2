// ============================================
// SMART APPLY: Nur geänderte Code-Teile anwenden
// ============================================

export interface CodeChange {
  file: string
  type: 'add' | 'modify' | 'delete'
  oldContent?: string
  newContent: string
  hunks?: Hunk[]
}

export interface Hunk {
  startLine: number
  endLine: number
  oldLines: string[]
  newLines: string[]
}

export interface ApplyResult {
  success: boolean
  appliedChanges: CodeChange[]
  errors: string[]
  mergedContent?: string
}

// Berechne den Diff zwischen zwei Strings (Zeilen-basiert)
export function computeLineDiff(oldContent: string, newContent: string): Hunk[] {
  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')
  const hunks: Hunk[] = []
  
  let oldIdx = 0
  let newIdx = 0
  let currentHunk: Hunk | null = null
  
  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    const oldLine = oldLines[oldIdx]
    const newLine = newLines[newIdx]
    
    if (oldLine === newLine) {
      // Gleiche Zeile - schließe aktuellen Hunk ab
      if (currentHunk) {
        hunks.push(currentHunk)
        currentHunk = null
      }
      oldIdx++
      newIdx++
    } else {
      // Unterschied gefunden
      if (!currentHunk) {
        currentHunk = {
          startLine: oldIdx + 1,
          endLine: oldIdx + 1,
          oldLines: [],
          newLines: []
        }
      }
      
      // Finde welche Zeilen geändert wurden
      if (oldIdx < oldLines.length && !newLines.slice(newIdx).includes(oldLine)) {
        // Zeile entfernt
        currentHunk.oldLines.push(oldLine)
        currentHunk.endLine = oldIdx + 1
        oldIdx++
      } else if (newIdx < newLines.length) {
        // Zeile hinzugefügt
        currentHunk.newLines.push(newLine)
        newIdx++
      } else {
        oldIdx++
        newIdx++
      }
    }
  }
  
  if (currentHunk) {
    hunks.push(currentHunk)
  }
  
  return hunks
}

// Erkenne welche Dateien geändert wurden
export function detectChangedFiles(
  oldFiles: { path: string; content: string }[],
  newFiles: { path: string; content: string }[]
): CodeChange[] {
  const changes: CodeChange[] = []
  
  // Map für schnellen Zugriff
  const oldMap = new Map(oldFiles.map(f => [f.path, f.content]))
  const newMap = new Map(newFiles.map(f => [f.path, f.content]))
  
  // Neue und geänderte Dateien
  for (const newFile of newFiles) {
    const oldContent = oldMap.get(newFile.path)
    
    if (!oldContent) {
      // Neue Datei
      changes.push({
        file: newFile.path,
        type: 'add',
        newContent: newFile.content
      })
    } else if (oldContent !== newFile.content) {
      // Geänderte Datei
      const hunks = computeLineDiff(oldContent, newFile.content)
      changes.push({
        file: newFile.path,
        type: 'modify',
        oldContent,
        newContent: newFile.content,
        hunks
      })
    }
  }
  
  // Gelöschte Dateien
  for (const oldFile of oldFiles) {
    if (!newMap.has(oldFile.path)) {
      changes.push({
        file: oldFile.path,
        type: 'delete',
        oldContent: oldFile.content,
        newContent: ''
      })
    }
  }
  
  return changes
}

// Smart Merge: Wendet nur die Änderungen an
export function smartMerge(
  originalContent: string,
  generatedContent: string,
  existingContent: string
): ApplyResult {
  // Wenn Datei nicht existierte, übernehme generiert
  if (!existingContent || existingContent.trim() === '') {
    return {
      success: true,
      appliedChanges: [],
      errors: [],
      mergedContent: generatedContent
    }
  }
  
  // Wenn nichts geändert wurde
  if (originalContent === generatedContent) {
    return {
      success: true,
      appliedChanges: [],
      errors: [],
      mergedContent: existingContent
    }
  }
  
  // Berechne Hunks zwischen Original und Generiert
  const hunks = computeLineDiff(originalContent, generatedContent)
  
  if (hunks.length === 0) {
    return {
      success: true,
      appliedChanges: [],
      errors: [],
      mergedContent: existingContent
    }
  }
  
  // Wende Hunks auf existierenden Content an
  const existingLines = existingContent.split('\n')
  const result: string[] = [...existingLines]
  const errors: string[] = []
  let offset = 0
  
  for (const hunk of hunks) {
    const adjustedStart = hunk.startLine - 1 + offset
    
    // Prüfe ob die alten Zeilen noch stimmen
    const currentLines = result.slice(adjustedStart, adjustedStart + hunk.oldLines.length)
    const matches = hunk.oldLines.every((line, i) => 
      currentLines[i]?.trim() === line.trim()
    )
    
    if (matches || hunk.oldLines.length === 0) {
      // Wende Änderung an
      result.splice(adjustedStart, hunk.oldLines.length, ...hunk.newLines)
      offset += hunk.newLines.length - hunk.oldLines.length
    } else {
      errors.push(`Konflikt bei Zeile ${hunk.startLine}: Erwarteter Code wurde geändert`)
    }
  }
  
  return {
    success: errors.length === 0,
    appliedChanges: [],
    errors,
    mergedContent: result.join('\n')
  }
}

// Analysiere ob Smart Apply möglich ist
export function canSmartApply(
  oldFiles: { path: string; content: string }[],
  newFiles: { path: string; content: string }[]
): { canApply: boolean; reason?: string; changedFiles: string[] } {
  const changes = detectChangedFiles(oldFiles, newFiles)
  const changedFiles = changes.map(c => c.file)
  
  // Zu viele Änderungen = lieber komplett ersetzen
  if (changes.length > 10) {
    return {
      canApply: false,
      reason: 'Zu viele geänderte Dateien für Smart Apply',
      changedFiles
    }
  }
  
  // Prüfe ob kritische Dateien geändert wurden
  const criticalChanges = changes.filter(c => 
    c.file.includes('package.json') ||
    c.file.includes('tsconfig') ||
    c.file.includes('.config.')
  )
  
  if (criticalChanges.length > 0) {
    return {
      canApply: false,
      reason: 'Konfigurationsdateien geändert - vollständiger Replace empfohlen',
      changedFiles
    }
  }
  
  return {
    canApply: true,
    changedFiles
  }
}

// Generiere Smart Apply Prompt für den Agent
export function generateSmartApplyPrompt(
  changedFiles: string[],
  existingFiles: { path: string; content: string }[]
): string {
  const fileContexts = changedFiles
    .map(path => {
      const file = existingFiles.find(f => f.path === path)
      if (!file) return `### ${path} (NEU)`
      return `### ${path}
\`\`\`typescript
${file.content.substring(0, 500)}${file.content.length > 500 ? '\n// ... (gekürzt)' : ''}
\`\`\``
    })
    .join('\n\n')

  return `
## 🎯 SMART APPLY MODUS

Du änderst NUR diese ${changedFiles.length} Datei(en):
${changedFiles.map(f => `- ${f}`).join('\n')}

## WICHTIG:
1. Gib NUR die geänderten Dateien aus
2. Gib VOLLSTÄNDIGEN Code für jede Datei aus
3. Behalte nicht-geänderte Teile bei
4. Keine anderen Dateien anfassen!

## Betroffene Dateien:
${fileContexts}
`
}
