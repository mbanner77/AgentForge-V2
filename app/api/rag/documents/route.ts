import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

// GET: Alle Dokumente auflisten
export async function GET() {
  try {
    const documents = await prisma.ragDocument.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        filename: true,
        originalName: true,
        mimeType: true,
        size: true,
        title: true,
        description: true,
        tags: true,
        category: true,
        allowedAgents: true,
        status: true,
        errorMessage: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { chunks: true },
        },
      },
    })
    
    return NextResponse.json({
      success: true,
      documents: documents.map((doc: typeof documents[0]) => ({
        ...doc,
        chunksCount: doc._count.chunks,
        _count: undefined,
      })),
    })
  } catch (error) {
    console.error("RAG Documents List Error:", error)
    return NextResponse.json(
      { error: "Fehler beim Laden der Dokumente" },
      { status: 500 }
    )
  }
}

// DELETE: Dokument löschen
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get("id")
    
    if (!documentId) {
      return NextResponse.json(
        { error: "Document ID fehlt" },
        { status: 400 }
      )
    }
    
    await prisma.ragDocument.delete({
      where: { id: documentId },
    })
    
    return NextResponse.json({
      success: true,
      message: "Dokument gelöscht",
    })
  } catch (error) {
    console.error("RAG Document Delete Error:", error)
    return NextResponse.json(
      { error: "Fehler beim Löschen des Dokuments" },
      { status: 500 }
    )
  }
}

// PATCH: Dokument aktualisieren
export async function PATCH(request: NextRequest) {
  try {
    const { id, title, description, category, tags, allowedAgents } = await request.json()
    
    if (!id) {
      return NextResponse.json(
        { error: "Document ID fehlt" },
        { status: 400 }
      )
    }
    
    const updateData: {
      title?: string
      description?: string
      category?: string
      tags?: string[]
      allowedAgents?: string[]
    } = {}
    
    if (title !== undefined) updateData.title = title
    if (description !== undefined) updateData.description = description
    if (category !== undefined) updateData.category = category
    if (tags !== undefined) updateData.tags = tags
    if (allowedAgents !== undefined) updateData.allowedAgents = allowedAgents
    
    const document = await prisma.ragDocument.update({
      where: { id },
      data: updateData,
    })
    
    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        title: document.title,
        description: document.description,
        category: document.category,
        tags: document.tags,
      },
    })
  } catch (error) {
    console.error("RAG Document Update Error:", error)
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren des Dokuments" },
      { status: 500 }
    )
  }
}
