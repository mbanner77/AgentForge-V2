import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File
    const title = formData.get("title") as string
    const description = formData.get("description") as string
    const category = formData.get("category") as string || "general"
    const tags = formData.get("tags") as string
    const allowedAgentsStr = formData.get("allowedAgents") as string
    
    if (!file) {
      return NextResponse.json(
        { error: "Keine Datei hochgeladen" },
        { status: 400 }
      )
    }
    
    // Datei-Inhalt lesen
    const content = await file.text()
    
    // Unterstützte Dateitypen prüfen
    const supportedTypes = [
      "text/plain",
      "text/markdown",
      "text/x-markdown",
      "application/json",
      "text/csv",
      "text/html",
      "text/css",
      "text/javascript",
      "application/javascript",
      "text/typescript",
      "application/typescript",
    ]
    
    const isSupported = supportedTypes.includes(file.type) || 
                       file.name.endsWith(".md") ||
                       file.name.endsWith(".txt") ||
                       file.name.endsWith(".json") ||
                       file.name.endsWith(".ts") ||
                       file.name.endsWith(".tsx") ||
                       file.name.endsWith(".js") ||
                       file.name.endsWith(".jsx")
    
    if (!isSupported) {
      return NextResponse.json(
        { error: `Dateityp nicht unterstützt: ${file.type}. Unterstützt werden: TXT, MD, JSON, JS, TS, HTML, CSS` },
        { status: 400 }
      )
    }
    
    // Parse allowedAgents
    let allowedAgents: string[] = []
    if (allowedAgentsStr) {
      try {
        allowedAgents = JSON.parse(allowedAgentsStr)
      } catch {
        // Falls kein JSON, behandle als kommagetrennte Liste
        allowedAgents = allowedAgentsStr.split(",").map(a => a.trim()).filter(Boolean)
      }
    }

    // Dokument in DB speichern
    const document = await prisma.ragDocument.create({
      data: {
        filename: `${Date.now()}-${file.name}`,
        originalName: file.name,
        mimeType: file.type || "text/plain",
        size: file.size,
        content: content,
        title: title || file.name,
        description: description || null,
        category: category,
        tags: tags ? tags.split(",").map(t => t.trim()) : [],
        allowedAgents: allowedAgents,
        status: "processing",
      },
    })
    
    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        filename: document.filename,
        originalName: document.originalName,
        status: document.status,
      },
    })
  } catch (error) {
    console.error("RAG Upload Error:", error)
    return NextResponse.json(
      { error: "Fehler beim Hochladen der Datei" },
      { status: 500 }
    )
  }
}
