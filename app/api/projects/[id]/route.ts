import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/db"

// GET: Einzelnes Projekt abrufen
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!prisma) {
    return NextResponse.json({ project: null, localMode: true })
  }

  try {
    const { id } = await params

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        files: true,
        messages: {
          orderBy: { createdAt: "asc" }
        },
        workflows: {
          orderBy: { startedAt: "desc" },
          take: 10
        }
      }
    })

    if (!project) {
      return NextResponse.json({ error: "Projekt nicht gefunden" }, { status: 404 })
    }

    return NextResponse.json({ project })
  } catch (error) {
    console.error("Error fetching project:", error)
    return NextResponse.json({ error: "Fehler beim Laden des Projekts" }, { status: 500 })
  }
}

// PUT: Projekt aktualisieren oder erstellen (upsert)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!prisma) {
    return NextResponse.json({ success: true, localMode: true })
  }

  try {
    const { id } = await params
    const body = await request.json()
    const { name, description, agentConfigs } = body

    // Verwende upsert um Projekt zu erstellen falls es nicht existiert
    const project = await prisma.project.upsert({
      where: { id },
      update: {
        name,
        description,
        agentConfigs,
        updatedAt: new Date()
      },
      create: {
        id,
        name: name || "Neues Projekt",
        description: description || "",
        agentConfigs: agentConfigs || {},
      },
      include: {
        files: true,
        messages: true
      }
    })

    return NextResponse.json({ project })
  } catch (error) {
    console.error("Error updating project:", error)
    return NextResponse.json({ error: "Fehler beim Aktualisieren des Projekts" }, { status: 500 })
  }
}

// DELETE: Projekt löschen
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!prisma) {
    return NextResponse.json({ success: true, localMode: true })
  }

  try {
    const { id } = await params

    await prisma.project.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting project:", error)
    return NextResponse.json({ error: "Fehler beim Löschen des Projekts" }, { status: 500 })
  }
}
