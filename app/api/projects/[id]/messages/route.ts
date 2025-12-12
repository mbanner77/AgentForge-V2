import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/db"

// POST: Nachricht zu einem Projekt hinzufügen
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
