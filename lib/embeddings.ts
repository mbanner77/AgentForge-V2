// Embedding generation for RAG system

export interface EmbeddingResult {
  embedding: number[]
  tokenCount: number
}

export interface SimilarityResult {
  id: string
  content: string
  similarity: number
  metadata?: Record<string, unknown>
}

// Generate embedding using OpenAI API
export async function generateEmbedding(
  text: string,
  apiKey: string,
  model: string = "text-embedding-ada-002"
): Promise<EmbeddingResult> {
  if (!apiKey) {
    throw new Error("OpenAI API Key erforderlich für Embeddings")
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: text,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Embedding-Fehler: ${response.status} - ${error}`)
  }

  const data = await response.json()
  
  return {
    embedding: data.data[0].embedding,
    tokenCount: data.usage?.total_tokens || 0,
  }
}

// Generate embeddings for multiple texts in batch
export async function generateEmbeddingsBatch(
  texts: string[],
  apiKey: string,
  model: string = "text-embedding-ada-002"
): Promise<EmbeddingResult[]> {
  if (!apiKey) {
    throw new Error("OpenAI API Key erforderlich für Embeddings")
  }

  // OpenAI allows up to 2048 inputs per request
  const batchSize = 100
  const results: EmbeddingResult[] = []

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: batch,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Embedding-Fehler: ${response.status} - ${error}`)
    }

    const data = await response.json()
    
    for (const item of data.data) {
      results.push({
        embedding: item.embedding,
        tokenCount: data.usage?.total_tokens || 0,
      })
    }
  }

  return results
}

// Calculate cosine similarity between two vectors
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same length")
  }

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

// Find most similar documents
export function findSimilarDocuments(
  queryEmbedding: number[],
  documents: Array<{ id: string; embedding: number[]; content: string; metadata?: Record<string, unknown> }>,
  topK: number = 5,
  minSimilarity: number = 0.7
): SimilarityResult[] {
  const results: SimilarityResult[] = []

  for (const doc of documents) {
    const similarity = cosineSimilarity(queryEmbedding, doc.embedding)
    
    if (similarity >= minSimilarity) {
      results.push({
        id: doc.id,
        content: doc.content,
        similarity,
        metadata: doc.metadata,
      })
    }
  }

  // Sort by similarity (descending) and take top K
  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
}

// Chunk text for embedding
export function chunkText(
  text: string,
  chunkSize: number = 1000,
  overlap: number = 200
): string[] {
  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    let end = start + chunkSize
    
    // Try to break at sentence boundary
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf(".", end)
      const lastNewline = text.lastIndexOf("\n", end)
      const breakPoint = Math.max(lastPeriod, lastNewline)
      
      if (breakPoint > start + chunkSize / 2) {
        end = breakPoint + 1
      }
    }

    chunks.push(text.slice(start, end).trim())
    start = end - overlap
  }

  return chunks.filter(chunk => chunk.length > 0)
}

// Estimate token count (rough approximation)
export function estimateTokenCount(text: string): number {
  // Rough estimate: ~4 characters per token for English
  // Slightly higher for German due to compound words
  return Math.ceil(text.length / 3.5)
}
