import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { splitTextIntoChunks, createEmbedding } from "@/lib/rag-service"

export async function POST(request: NextRequest) {
  try {
    const { documentId, apiKey } = await request.json()
    
    if (!documentId) {
      return NextResponse.json(
        { error: "Document ID fehlt" },
        { status: 400 }
      )
    }
    
    if (!apiKey) {
      return NextResponse.json(
        { error: "API Key fehlt. Bitte in den Einstellungen konfigurieren." },
        { status: 400 }
      )
    }
    
    const document = await prisma.ragDocument.findUnique({
      where: { id: documentId },
    })
    
    if (!document) {
      return NextResponse.json(
        { error: "Dokument nicht gefunden" },
        { status: 404 }
      )
    }
    
    // Bereits verarbeitete Chunks löschen (für Re-Processing)
    await prisma.ragChunk.deleteMany({
      where: { documentId: document.id },
    })
    
    // Text in Chunks aufteilen
    const chunks = splitTextIntoChunks(document.content)
    
    if (chunks.length === 0) {
      await prisma.ragDocument.update({
        where: { id: documentId },
        data: {
          status: "error",
          errorMessage: "Dokument enthält keinen verarbeitbaren Text",
        },
      })
      return NextResponse.json(
        { error: "Dokument enthält keinen verarbeitbaren Text" },
        { status: 400 }
      )
    }
    
    // Embeddings für jeden Chunk erstellen
    const createdChunks = []
    for (let i = 0; i < chunks.length; i++) {
      const chunkContent = chunks[i]
      
      try {
        const embedding = await createEmbedding(chunkContent, apiKey)
        
        const chunk = await prisma.ragChunk.create({
          data: {
            documentId: document.id,
            content: chunkContent,
            chunkIndex: i,
            embedding: embedding,
            tokenCount: Math.ceil(chunkContent.length / 4),
          },
        })
        createdChunks.push(chunk.id)
      } catch (embeddingError) {
        console.error(`Fehler bei Chunk ${i}:`, embeddingError)
        // Bei Embedding-Fehler abbrechen
        await prisma.ragDocument.update({
          where: { id: documentId },
          data: {
            status: "error",
            errorMessage: `Embedding-Fehler bei Chunk ${i}: ${embeddingError instanceof Error ? embeddingError.message : "Unbekannt"}`,
          },
        })
        return NextResponse.json(
          { error: `Embedding-Fehler: ${embeddingError instanceof Error ? embeddingError.message : "Unbekannt"}` },
          { status: 500 }
        )
      }
    }
    
    // Dokument als fertig markieren
    await prisma.ragDocument.update({
      where: { id: documentId },
      data: { status: "ready" },
    })
    
    return NextResponse.json({
      success: true,
      chunksCreated: createdChunks.length,
      documentId: document.id,
    })
  } catch (error) {
    console.error("RAG Process Error:", error)
    return NextResponse.json(
      { error: "Fehler bei der Verarbeitung des Dokuments" },
      { status: 500 }
    )
  }
}
