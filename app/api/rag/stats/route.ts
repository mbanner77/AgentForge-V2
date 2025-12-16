import { NextResponse } from "next/server"
import { getKnowledgeBaseStats } from "@/lib/rag-service"

export async function GET() {
  try {
    const stats = await getKnowledgeBaseStats()
    
    return NextResponse.json({
      success: true,
      stats,
    })
  } catch (error) {
    console.error("RAG Stats Error:", error)
    return NextResponse.json(
      { error: "Fehler beim Laden der Statistiken" },
      { status: 500 }
    )
  }
}
