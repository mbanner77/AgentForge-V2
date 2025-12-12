import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/db"

// POST: Nachrichten zu einem Projekt hinzufügen (Bulk oder einzeln)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!prisma) {
    return NextResponse.json({ success: true, localMode: true })
  }

  try {
    const { id: projectId } = await params
    const body = await request.json()
    
    // Unterstütze sowohl einzelne Nachricht als auch Array von Nachrichten
    if (body.messages && Array.isArray(body.messages)) {
      // Bulk-Speicherung: Lösche alte Nachrichten und erstelle neue
      await prisma.message.deleteMany({
        where: { projectId }
      })
      
      const messages = await prisma.message.createMany({
        data: body.messages.map((m: { role: string; content: string; agent?: string }) => ({
          projectId,
          role: m.role,
          content: m.content,
          agent: m.agent || null
        }))
      })
      
      return NextResponse.json({ success: true, count: messages.count })
    } else {
      // Einzelne Nachricht
      const { role, content, agent } = body
      const message = await prisma.message.create({
        data: {
          projectId,
          role,
          content,
          agent
        }
      })
      return NextResponse.json({ message })
    }
  } catch (error) {
    console.error("Error saving message:", error)
    return NextResponse.json({ error: "Fehler beim Speichern der Nachricht" }, { status: 500 })
  }
}

// DELETE: Alle Nachrichten eines Projekts löschen
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!prisma) {
    return NextResponse.json({ success: true, localMode: true })
  }

  try {
    const { id: projectId } = await params

    await prisma.message.deleteMany({
      where: { projectId }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting messages:", error)
    return NextResponse.json({ error: "Fehler beim Löschen der Nachrichten" }, { status: 500 })
  }
}
