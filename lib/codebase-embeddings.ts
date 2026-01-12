// ============================================
// CODEBASE EMBEDDINGS: Semantische Suche über den Code
// ============================================

export interface CodeChunk {
  id: string
  filePath: string
  content: string
  startLine: number
  endLine: number
  type: 'function' | 'component' | 'hook' | 'type' | 'import' | 'class' | 'other'
  name?: string
  embedding?: number[]
}

export interface SearchResult {
  chunk: CodeChunk
  score: number
  matchType: 'semantic' | 'keyword' | 'exact'
}

export interface CodebaseIndex {
  chunks: CodeChunk[]
  lastUpdated: Date
  fileCount: number
  totalLines: number
}

// Extrahiere Code-Chunks aus Dateien
export function extractCodeChunks(files: { path: string; content: string }[]): CodeChunk[] {
  const chunks: CodeChunk[] = []
  let chunkId = 0
  
  for (const file of files) {
    if (!file.path.endsWith('.tsx') && !file.path.endsWith('.ts') && !file.path.endsWith('.jsx') && !file.path.endsWith('.js')) {
      continue
    }
    
    const lines = file.content.split('\n')
    
    // Extrahiere Funktionen und Komponenten
    const functionPattern = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/
    const arrowFunctionPattern = /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/
    const componentPattern = /^(?:export\s+)?(?:default\s+)?function\s+([A-Z]\w+)/
    const hookPattern = /^(?:export\s+)?(?:const|function)\s+(use[A-Z]\w+)/
    const typePattern = /^(?:export\s+)?(?:type|interface)\s+(\w+)/
    const classPattern = /^(?:export\s+)?class\s+(\w+)/
    
    let currentChunk: Partial<CodeChunk> | null = null
    let braceCount = 0
    let inChunk = false
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmedLine = line.trim()
      
      // Prüfe auf neue Definitionen
      let match: RegExpMatchArray | null = null
      let type: CodeChunk['type'] = 'other'
      
      if ((match = trimmedLine.match(hookPattern))) {
        type = 'hook'
      } else if ((match = trimmedLine.match(componentPattern))) {
        type = 'component'
      } else if ((match = trimmedLine.match(functionPattern)) || (match = trimmedLine.match(arrowFunctionPattern))) {
        type = 'function'
      } else if ((match = trimmedLine.match(typePattern))) {
        type = 'type'
      } else if ((match = trimmedLine.match(classPattern))) {
        type = 'class'
      }
      
      if (match && !inChunk) {
        // Starte neuen Chunk
        currentChunk = {
          id: `chunk-${chunkId++}`,
          filePath: file.path,
          startLine: i + 1,
          type,
          name: match[1],
          content: ''
        }
        inChunk = true
        braceCount = 0
      }
      
      if (inChunk && currentChunk) {
        currentChunk.content += line + '\n'
        
        // Zähle Klammern
        braceCount += (line.match(/{/g) || []).length
        braceCount -= (line.match(/}/g) || []).length
        
        // Chunk beenden wenn Klammern ausgeglichen
        if (braceCount <= 0 && currentChunk.content && currentChunk.content.includes('{')) {
          currentChunk.endLine = i + 1
          chunks.push(currentChunk as CodeChunk)
          currentChunk = null
          inChunk = false
        }
        
        // Oder bei Type/Interface nach Semikolon oder }
        if (currentChunk && type === 'type' && (trimmedLine.endsWith(';') || trimmedLine.endsWith('}'))) {
          currentChunk.endLine = i + 1
          chunks.push(currentChunk as CodeChunk)
          currentChunk = null
          inChunk = false
        }
      }
    }
    
    // Füge Import-Blocks hinzu
    const importLines: string[] = []
    let importStart = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('import ')) {
        if (importStart === -1) importStart = i
        importLines.push(lines[i])
      } else if (importLines.length > 0 && !lines[i].trim().startsWith('import ')) {
        chunks.push({
          id: `chunk-${chunkId++}`,
          filePath: file.path,
          content: importLines.join('\n'),
          startLine: importStart + 1,
          endLine: i,
          type: 'import',
          name: 'imports'
        })
        break
      }
    }
  }
  
  return chunks
}

// Einfache Keyword-basierte Suche (ohne ML)
export function searchByKeyword(
  chunks: CodeChunk[],
  query: string,
  limit: number = 10
): SearchResult[] {
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  const results: SearchResult[] = []
  
  for (const chunk of chunks) {
    const content = chunk.content.toLowerCase()
    const name = (chunk.name || '').toLowerCase()
    
    // Exakte Übereinstimmung im Namen
    if (name && queryWords.some(w => name.includes(w))) {
      results.push({ chunk, score: 1.0, matchType: 'exact' })
      continue
    }
    
    // Keyword-Matching im Content
    let matchCount = 0
    for (const word of queryWords) {
      if (content.includes(word)) {
        matchCount++
      }
    }
    
    if (matchCount > 0) {
      const score = matchCount / queryWords.length
      results.push({ chunk, score, matchType: 'keyword' })
    }
  }
  
  // Sortiere nach Score
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

// Semantische Ähnlichkeit (vereinfacht ohne echte Embeddings)
export function computeSemanticSimilarity(text1: string, text2: string): number {
  // TF-IDF ähnlicher Ansatz
  const words1 = new Set(text1.toLowerCase().split(/\W+/).filter(w => w.length > 2))
  const words2 = new Set(text2.toLowerCase().split(/\W+/).filter(w => w.length > 2))
  
  let intersection = 0
  for (const word of words1) {
    if (words2.has(word)) intersection++
  }
  
  const union = words1.size + words2.size - intersection
  return union > 0 ? intersection / union : 0
}

// Intelligente Suche kombiniert Keyword + Semantik
export function intelligentSearch(
  chunks: CodeChunk[],
  query: string,
  options: {
    limit?: number
    typeFilter?: CodeChunk['type'][]
    fileFilter?: string
  } = {}
): SearchResult[] {
  const { limit = 10, typeFilter, fileFilter } = options
  
  let filteredChunks = chunks
  
  // Filter nach Typ
  if (typeFilter && typeFilter.length > 0) {
    filteredChunks = filteredChunks.filter(c => typeFilter.includes(c.type))
  }
  
  // Filter nach Datei
  if (fileFilter) {
    filteredChunks = filteredChunks.filter(c => c.filePath.includes(fileFilter))
  }
  
  const results: SearchResult[] = []
  
  for (const chunk of filteredChunks) {
    // Kombiniere verschiedene Scoring-Methoden
    let score = 0
    let matchType: SearchResult['matchType'] = 'keyword'
    
    // 1. Name-Match (höchste Priorität)
    if (chunk.name) {
      const nameScore = computeSemanticSimilarity(query, chunk.name)
      if (nameScore > 0.5) {
        score = nameScore * 1.5
        matchType = 'exact'
      }
    }
    
    // 2. Content-Match
    const contentScore = computeSemanticSimilarity(query, chunk.content)
    if (contentScore > score) {
      score = contentScore
      matchType = 'semantic'
    }
    
    // 3. Keyword-Boost
    const queryLower = query.toLowerCase()
    if (chunk.content.toLowerCase().includes(queryLower)) {
      score += 0.3
      matchType = 'keyword'
    }
    
    if (score > 0.1) {
      results.push({ chunk, score, matchType })
    }
  }
  
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

// Erstelle Index für Codebase
export function createCodebaseIndex(files: { path: string; content: string }[]): CodebaseIndex {
  const chunks = extractCodeChunks(files)
  const totalLines = files.reduce((sum, f) => sum + f.content.split('\n').length, 0)
  
  return {
    chunks,
    lastUpdated: new Date(),
    fileCount: files.length,
    totalLines
  }
}

// Finde verwandte Code-Chunks
export function findRelatedChunks(
  index: CodebaseIndex,
  chunk: CodeChunk,
  limit: number = 5
): CodeChunk[] {
  const results = intelligentSearch(
    index.chunks.filter(c => c.id !== chunk.id),
    chunk.content,
    { limit }
  )
  
  return results.map(r => r.chunk)
}

// Generiere Kontext für eine Anfrage
export function generateContextForQuery(
  index: CodebaseIndex,
  query: string,
  maxChunks: number = 5
): string {
  const results = intelligentSearch(index.chunks, query, { limit: maxChunks })
  
  if (results.length === 0) {
    return ''
  }
  
  let context = '## 🔍 RELEVANTER CODE (automatisch gefunden):\n\n'
  
  for (const result of results) {
    context += `### ${result.chunk.filePath} (${result.chunk.type}: ${result.chunk.name || 'unnamed'})\n`
    context += `Zeilen ${result.chunk.startLine}-${result.chunk.endLine} | Relevanz: ${(result.score * 100).toFixed(0)}%\n`
    context += '```typescript\n'
    context += result.chunk.content.trim()
    context += '\n```\n\n'
  }
  
  return context
}
