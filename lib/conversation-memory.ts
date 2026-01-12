// ============================================
// CONVERSATION MEMORY: Erinnert sich an Entscheidungen
// ============================================

export interface ConversationEntry {
  id: string
  timestamp: Date
  type: 'user_request' | 'decision' | 'file_change' | 'error' | 'fix'
  content: string
  metadata?: Record<string, unknown>
}

export interface ProjectDecision {
  id: string
  topic: string
  decision: string
  reason: string
  timestamp: Date
  relatedFiles: string[]
}

export interface ConversationContext {
  projectId: string
  entries: ConversationEntry[]
  decisions: ProjectDecision[]
  fileHistory: { path: string; action: 'created' | 'modified' | 'deleted'; timestamp: Date }[]
  lastUpdated: Date
}

// In-Memory Store
const conversationStore: Map<string, ConversationContext> = new Map()

// Erstelle neuen Konversationskontext
export function createConversation(projectId: string): ConversationContext {
  const context: ConversationContext = {
    projectId,
    entries: [],
    decisions: [],
    fileHistory: [],
    lastUpdated: new Date()
  }
  conversationStore.set(projectId, context)
  return context
}

// Hole Konversationskontext
export function getConversation(projectId: string): ConversationContext | null {
  return conversationStore.get(projectId) || null
}

// Füge Eintrag hinzu
export function addEntry(
  projectId: string,
  type: ConversationEntry['type'],
  content: string,
  metadata?: Record<string, unknown>
): ConversationEntry {
  let context = conversationStore.get(projectId)
  if (!context) {
    context = createConversation(projectId)
  }
  
  const entry: ConversationEntry = {
    id: `entry-${Date.now()}`,
    timestamp: new Date(),
    type,
    content,
    metadata
  }
  
  context.entries.push(entry)
  context.lastUpdated = new Date()
  
  // Begrenze auf letzte 100 Einträge
  if (context.entries.length > 100) {
    context.entries = context.entries.slice(-100)
  }
  
  return entry
}

// Füge Entscheidung hinzu
export function addDecision(
  projectId: string,
  topic: string,
  decision: string,
  reason: string,
  relatedFiles: string[] = []
): ProjectDecision {
  let context = conversationStore.get(projectId)
  if (!context) {
    context = createConversation(projectId)
  }
  
  const decisionEntry: ProjectDecision = {
    id: `decision-${Date.now()}`,
    topic,
    decision,
    reason,
    timestamp: new Date(),
    relatedFiles
  }
  
  context.decisions.push(decisionEntry)
  context.lastUpdated = new Date()
  
  return decisionEntry
}

// Tracke Datei-Änderung
export function trackFileChange(
  projectId: string,
  path: string,
  action: 'created' | 'modified' | 'deleted'
): void {
  let context = conversationStore.get(projectId)
  if (!context) {
    context = createConversation(projectId)
  }
  
  context.fileHistory.push({
    path,
    action,
    timestamp: new Date()
  })
  
  // Begrenze auf letzte 50 Änderungen
  if (context.fileHistory.length > 50) {
    context.fileHistory = context.fileHistory.slice(-50)
  }
  
  context.lastUpdated = new Date()
}

// Generiere Kontext-Zusammenfassung für den Agent
export function generateConversationSummary(projectId: string): string {
  const context = conversationStore.get(projectId)
  if (!context) return ''
  
  let summary = '## 💬 KONVERSATIONS-KONTEXT\n\n'
  
  // Letzte Entscheidungen
  if (context.decisions.length > 0) {
    summary += '### Architektur-Entscheidungen:\n'
    const recentDecisions = context.decisions.slice(-5)
    for (const d of recentDecisions) {
      summary += `- **${d.topic}**: ${d.decision}\n`
      if (d.relatedFiles.length > 0) {
        summary += `  Dateien: ${d.relatedFiles.join(', ')}\n`
      }
    }
    summary += '\n'
  }
  
  // Letzte Anfragen
  const userRequests = context.entries
    .filter(e => e.type === 'user_request')
    .slice(-5)
  
  if (userRequests.length > 0) {
    summary += '### Letzte Anfragen:\n'
    for (const r of userRequests) {
      summary += `- ${r.content.substring(0, 100)}${r.content.length > 100 ? '...' : ''}\n`
    }
    summary += '\n'
  }
  
  // Letzte Fehler und Fixes
  const errors = context.entries
    .filter(e => e.type === 'error' || e.type === 'fix')
    .slice(-3)
  
  if (errors.length > 0) {
    summary += '### Letzte Fehler/Fixes:\n'
    for (const e of errors) {
      const icon = e.type === 'error' ? '❌' : '✅'
      summary += `${icon} ${e.content.substring(0, 80)}\n`
    }
    summary += '\n'
  }
  
  // Datei-Historie
  if (context.fileHistory.length > 0) {
    const recent = context.fileHistory.slice(-5)
    summary += '### Letzte Datei-Änderungen:\n'
    for (const f of recent) {
      const icon = f.action === 'created' ? '➕' : f.action === 'modified' ? '✏️' : '🗑️'
      summary += `${icon} ${f.path}\n`
    }
  }
  
  return summary
}

// Finde relevante Entscheidungen für eine Anfrage
export function findRelevantDecisions(
  projectId: string,
  query: string
): ProjectDecision[] {
  const context = conversationStore.get(projectId)
  if (!context) return []
  
  const queryLower = query.toLowerCase()
  const keywords = queryLower.split(/\s+/).filter(w => w.length > 3)
  
  return context.decisions.filter(d => {
    const content = `${d.topic} ${d.decision} ${d.reason}`.toLowerCase()
    return keywords.some(k => content.includes(k))
  })
}

// Erkenne wiederkehrende Probleme
export function detectRecurringIssues(projectId: string): string[] {
  const context = conversationStore.get(projectId)
  if (!context) return []
  
  const errorMessages = context.entries
    .filter(e => e.type === 'error')
    .map(e => e.content.toLowerCase())
  
  // Zähle ähnliche Fehler
  const errorCounts: Map<string, number> = new Map()
  
  for (const error of errorMessages) {
    // Vereinfache Fehlermeldung
    const simplified = error
      .replace(/['"][^'"]+['"]/g, '""')
      .replace(/\d+/g, 'N')
      .substring(0, 100)
    
    errorCounts.set(simplified, (errorCounts.get(simplified) || 0) + 1)
  }
  
  // Finde wiederkehrende (>2 mal)
  const recurring: string[] = []
  for (const [error, count] of errorCounts) {
    if (count > 2) {
      recurring.push(error)
    }
  }
  
  return recurring
}

// Lösche alte Einträge
export function cleanupOldEntries(projectId: string, maxAgeHours: number = 24): void {
  const context = conversationStore.get(projectId)
  if (!context) return
  
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000)
  
  context.entries = context.entries.filter(e => e.timestamp > cutoff)
  context.fileHistory = context.fileHistory.filter(f => f.timestamp > cutoff)
  
  context.lastUpdated = new Date()
}

// Exportiere Konversation (für Persistenz)
export function exportConversation(projectId: string): string | null {
  const context = conversationStore.get(projectId)
  if (!context) return null
  
  return JSON.stringify(context, null, 2)
}

// Importiere Konversation
export function importConversation(projectId: string, data: string): boolean {
  try {
    const context = JSON.parse(data) as ConversationContext
    context.lastUpdated = new Date(context.lastUpdated)
    context.entries = context.entries.map(e => ({
      ...e,
      timestamp: new Date(e.timestamp)
    }))
    context.decisions = context.decisions.map(d => ({
      ...d,
      timestamp: new Date(d.timestamp)
    }))
    context.fileHistory = context.fileHistory.map(f => ({
      ...f,
      timestamp: new Date(f.timestamp)
    }))
    
    conversationStore.set(projectId, context)
    return true
  } catch {
    return false
  }
}

// Zusammenfassung für nächste Session
export function generateSessionHandoff(projectId: string): string {
  const context = conversationStore.get(projectId)
  if (!context) return 'Keine vorherige Session gefunden.'
  
  let handoff = '## 📋 SESSION HANDOFF\n\n'
  
  // Wichtigste Entscheidungen
  if (context.decisions.length > 0) {
    handoff += '### Getroffene Entscheidungen:\n'
    for (const d of context.decisions.slice(-3)) {
      handoff += `- ${d.topic}: ${d.decision}\n`
    }
    handoff += '\n'
  }
  
  // Letzte Arbeit
  const lastChanges = context.fileHistory.slice(-5)
  if (lastChanges.length > 0) {
    handoff += '### Zuletzt bearbeitet:\n'
    handoff += lastChanges.map(f => `- ${f.path}`).join('\n')
    handoff += '\n\n'
  }
  
  // Offene Probleme
  const recentErrors = context.entries
    .filter(e => e.type === 'error')
    .slice(-2)
  
  if (recentErrors.length > 0) {
    handoff += '### Bekannte Probleme:\n'
    for (const e of recentErrors) {
      handoff += `- ${e.content.substring(0, 100)}\n`
    }
  }
  
  return handoff
}
