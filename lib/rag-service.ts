// RAG Service für Dokument-Embedding und Retrieval
import { prisma } from "./db"

export interface RagDocument {
  id: string
  filename: string
  originalName: string
  mimeType: string
  size: number
  content: string
  title?: string
  description?: string
  tags: string[]
  category: string
  status: string
  errorMessage?: string
  createdAt: Date
  updatedAt: Date
}

export interface RagChunk {
  id: string
  documentId: string
  content: string
  chunkIndex: number
  embedding?: number[]
  tokenCount: number
}

export interface SearchResult {
  chunk: RagChunk
  document: RagDocument
  score: number
}

// Chunk-Größe für Text-Splitting
const CHUNK_SIZE = 1000 // Zeichen
const CHUNK_OVERLAP = 200 // Überlappung zwischen Chunks

// Text in Chunks aufteilen
export function splitTextIntoChunks(text: string): string[] {
  const chunks: string[] = []
  let start = 0
  
  while (start < text.length) {
    let end = start + CHUNK_SIZE
    
    // Versuche an Satzgrenzen zu trennen
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf(".", end)
      const lastNewline = text.lastIndexOf("\n", end)
      const breakPoint = Math.max(lastPeriod, lastNewline)
      
      if (breakPoint > start + CHUNK_SIZE / 2) {
        end = breakPoint + 1
      }
    }
    
    chunks.push(text.slice(start, end).trim())
    start = end - CHUNK_OVERLAP
  }
  
  return chunks.filter(chunk => chunk.length > 50) // Filtere zu kleine Chunks
}

// Embedding über OpenAI oder OpenRouter API erstellen
export async function createEmbedding(
  text: string, 
  apiKey: string, 
  provider: "openai" | "openrouter" = "openai"
): Promise<number[]> {
  // OpenRouter verwendet das gleiche Embedding-Format wie OpenAI
  const baseUrl = provider === "openrouter" 
    ? "https://openrouter.ai/api/v1/embeddings"
    : "https://api.openai.com/v1/embeddings"
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`,
  }
  
  // OpenRouter benötigt zusätzliche Header
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "https://agentforge.app"
    headers["X-Title"] = "AgentForge RAG"
  }
  
  const response = await fetch(baseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: provider === "openrouter" ? "openai/text-embedding-ada-002" : "text-embedding-ada-002",
      input: text,
    }),
  })
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Embedding API Fehler (${provider}): ${error}`)
  }
  
  const data = await response.json()
  return data.data[0].embedding
}

// Kosinus-Ähnlichkeit zwischen zwei Vektoren berechnen
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  
  let dotProduct = 0
  let normA = 0
  let normB = 0
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

// Dokument verarbeiten und embedden
export async function processDocument(
  documentId: string,
  apiKey: string,
  provider: "openai" | "openrouter" = "openai"
): Promise<void> {
  const document = await prisma.ragDocument.findUnique({
    where: { id: documentId },
  })
  
  if (!document) {
    throw new Error("Dokument nicht gefunden")
  }
  
  try {
    // Text in Chunks aufteilen
    const chunks = splitTextIntoChunks(document.content)
    
    // Embeddings für jeden Chunk erstellen
    for (let i = 0; i < chunks.length; i++) {
      const chunkContent = chunks[i]
      const embedding = await createEmbedding(chunkContent, apiKey, provider)
      
      await prisma.ragChunk.create({
        data: {
          documentId: document.id,
          content: chunkContent,
          chunkIndex: i,
          embedding: embedding,
          tokenCount: Math.ceil(chunkContent.length / 4), // Grobe Schätzung
        },
      })
    }
    
    // Dokument als fertig markieren
    await prisma.ragDocument.update({
      where: { id: documentId },
      data: { status: "ready" },
    })
  } catch (error) {
    // Fehler speichern
    await prisma.ragDocument.update({
      where: { id: documentId },
      data: {
        status: "error",
        errorMessage: error instanceof Error ? error.message : "Unbekannter Fehler",
      },
    })
    throw error
  }
}

// Relevante Chunks für eine Query finden
export async function searchRelevantChunks(
  query: string,
  apiKey: string,
  topK: number = 5,
  category?: string,
  agentId?: string,
  provider: "openai" | "openrouter" = "openai"
): Promise<SearchResult[]> {
  // Query embedding erstellen
  const queryEmbedding = await createEmbedding(query, apiKey, provider)
  
  // Alle fertigen Dokumente und ihre Chunks laden
  const whereClause: { status: string; category?: string } = { status: "ready" }
  if (category) {
    whereClause.category = category
  }
  
  const documents = await prisma.ragDocument.findMany({
    where: whereClause,
    include: {
      chunks: true,
    },
  })
  
  // Filtere Dokumente basierend auf Agent-Zugriff
  const accessibleDocuments = documents.filter(doc => {
    // Wenn keine Agent-Einschränkungen, hat jeder Zugriff
    if (!doc.allowedAgents || doc.allowedAgents.length === 0) {
      return true
    }
    // Wenn kein Agent angegeben, zeige alle ohne Einschränkung
    if (!agentId) {
      return doc.allowedAgents.length === 0
    }
    // Prüfe ob Agent Zugriff hat
    return doc.allowedAgents.includes(agentId)
  })
  
  // Ähnlichkeiten berechnen
  const results: SearchResult[] = []
  
  for (const doc of accessibleDocuments) {
    for (const chunk of doc.chunks) {
      if (chunk.embedding) {
        const embedding = chunk.embedding as number[]
        const score = cosineSimilarity(queryEmbedding, embedding)
        
        results.push({
          chunk: {
            id: chunk.id,
            documentId: chunk.documentId,
            content: chunk.content,
            chunkIndex: chunk.chunkIndex,
            embedding: undefined, // Nicht zurückgeben um Daten zu sparen
            tokenCount: chunk.tokenCount,
          },
          document: {
            id: doc.id,
            filename: doc.filename,
            originalName: doc.originalName,
            mimeType: doc.mimeType,
            size: doc.size,
            content: "", // Nicht zurückgeben um Daten zu sparen
            title: doc.title || undefined,
            description: doc.description || undefined,
            tags: doc.tags,
            category: doc.category,
            status: doc.status,
            errorMessage: doc.errorMessage || undefined,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
          },
          score,
        })
      }
    }
  }
  
  // Nach Ähnlichkeit sortieren und Top-K zurückgeben
  results.sort((a, b) => b.score - a.score)
  return results.slice(0, topK)
}

// RAG-Kontext für Agenten-Prompts erstellen
export async function buildRagContext(
  query: string,
  apiKey: string,
  maxTokens: number = 2000,
  agentId?: string,
  provider: "openai" | "openrouter" = "openai"
): Promise<string> {
  const results = await searchRelevantChunks(query, apiKey, 10, undefined, agentId, provider)
  
  if (results.length === 0) {
    return ""
  }
  
  let context = "## Relevante Informationen aus der Knowledge Base:\n\n"
  let currentTokens = 0
  const avgCharsPerToken = 4
  
  for (const result of results) {
    const chunkText = `### Aus "${result.document.originalName}" (Relevanz: ${(result.score * 100).toFixed(1)}%):\n${result.chunk.content}\n\n`
    const estimatedTokens = Math.ceil(chunkText.length / avgCharsPerToken)
    
    if (currentTokens + estimatedTokens > maxTokens) {
      break
    }
    
    context += chunkText
    currentTokens += estimatedTokens
  }
  
  return context
}

// Alle Dokumente auflisten
export async function listDocuments(): Promise<RagDocument[]> {
  const documents = await prisma.ragDocument.findMany({
    orderBy: { createdAt: "desc" },
  })
  
  return documents.map(doc => ({
    id: doc.id,
    filename: doc.filename,
    originalName: doc.originalName,
    mimeType: doc.mimeType,
    size: doc.size,
    content: "", // Content nicht mit zurückgeben
    title: doc.title || undefined,
    description: doc.description || undefined,
    tags: doc.tags,
    category: doc.category,
    status: doc.status,
    errorMessage: doc.errorMessage || undefined,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }))
}

// Dokument löschen
export async function deleteDocument(documentId: string): Promise<void> {
  await prisma.ragDocument.delete({
    where: { id: documentId },
  })
}

// Text aus verschiedenen Dateitypen extrahieren
export function extractTextFromFile(content: string, mimeType: string): string {
  // Für jetzt nur einfache Text-Dateien
  // Kann später für PDF, DOCX etc. erweitert werden
  if (mimeType.startsWith("text/") || mimeType === "application/json") {
    return content
  }
  
  // Markdown
  if (mimeType === "text/markdown" || mimeType === "text/x-markdown") {
    return content
  }
  
  // Fallback: Als Text behandeln
  return content
}

// Statistiken zur Knowledge Base
export async function getKnowledgeBaseStats(): Promise<{
  totalDocuments: number
  readyDocuments: number
  processingDocuments: number
  errorDocuments: number
  totalChunks: number
  categories: { name: string; count: number }[]
}> {
  const [total, ready, processing, error, chunks, categories] = await Promise.all([
    prisma.ragDocument.count(),
    prisma.ragDocument.count({ where: { status: "ready" } }),
    prisma.ragDocument.count({ where: { status: "processing" } }),
    prisma.ragDocument.count({ where: { status: "error" } }),
    prisma.ragChunk.count(),
    prisma.ragDocument.groupBy({
      by: ["category"],
      _count: { category: true },
    }),
  ])
  
  return {
    totalDocuments: total,
    readyDocuments: ready,
    processingDocuments: processing,
    errorDocuments: error,
    totalChunks: chunks,
    categories: categories.map(c => ({
      name: c.category,
      count: c._count.category,
    })),
  }
}
