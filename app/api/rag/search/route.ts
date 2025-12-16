import { NextRequest, NextResponse } from "next/server"
import { searchRelevantChunks, buildRagContext } from "@/lib/rag-service"

export async function POST(request: NextRequest) {
  try {
    const { query, apiKey, topK = 5, category, buildContext = false, maxTokens = 2000, agentId } = await request.json()
    
    if (!query) {
      return NextResponse.json(
        { error: "Suchbegriff fehlt" },
        { status: 400 }
      )
    }
    
    if (!apiKey) {
      return NextResponse.json(
        { error: "API Key fehlt. Bitte in den Einstellungen konfigurieren." },
        { status: 400 }
      )
    }
    
    if (buildContext) {
      // Kontext für Agenten-Prompts erstellen (mit Agent-spezifischer Filterung)
      const context = await buildRagContext(query, apiKey, maxTokens, agentId)
      return NextResponse.json({
        success: true,
        context,
      })
    }
    
    // Normale Suche (mit Agent-spezifischer Filterung)
    const results = await searchRelevantChunks(query, apiKey, topK, category, agentId)
    
    return NextResponse.json({
      success: true,
      results: results.map(r => ({
        score: r.score,
        content: r.chunk.content,
        documentId: r.document.id,
        documentName: r.document.originalName,
        documentTitle: r.document.title,
        category: r.document.category,
      })),
    })
  } catch (error) {
    console.error("RAG Search Error:", error)
    return NextResponse.json(
      { error: "Fehler bei der Suche" },
      { status: 500 }
    )
  }
}
