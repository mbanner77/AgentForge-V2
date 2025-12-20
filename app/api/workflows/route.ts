import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/db"

// GET: Alle Workflows abrufen
export async function GET(request: NextRequest) {
  if (!prisma) {
    return NextResponse.json({ workflows: [], localMode: true })
  }

  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId") || "default"

    // For now, return empty since workflows are stored in localStorage
    // In production, add Workflow model to prisma schema
    return NextResponse.json({ workflows: [] })
  } catch (error) {
    console.error("Error fetching workflows:", error)
    return NextResponse.json({ workflows: [], error: "Fehler beim Laden" }, { status: 500 })
  }
}

// POST: Neuen Workflow erstellen
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, description, nodes, edges, userId = "default" } = body

    if (!prisma) {
      // Local mode - return the workflow with a generated ID
      return NextResponse.json({
        workflow: {
          id: crypto.randomUUID(),
          name,
          description,
          nodes,
          edges,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        localMode: true
      })
    }

    // In production with database
    // Would save to a Workflow table
    return NextResponse.json({
      workflow: {
        id: crypto.randomUUID(),
        name,
        description,
        nodes,
        edges,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    })
  } catch (error) {
    console.error("Error creating workflow:", error)
    return NextResponse.json({ error: "Fehler beim Erstellen" }, { status: 500 })
  }
}

// PUT: Workflow aktualisieren
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, name, description, nodes, edges } = body

    if (!id) {
      return NextResponse.json({ error: "Workflow ID fehlt" }, { status: 400 })
    }

    return NextResponse.json({
      workflow: {
        id,
        name,
        description,
        nodes,
        edges,
        version: 2,
        updatedAt: new Date(),
      }
    })
  } catch (error) {
    console.error("Error updating workflow:", error)
    return NextResponse.json({ error: "Fehler beim Aktualisieren" }, { status: 500 })
  }
}

// DELETE: Workflow löschen
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Workflow ID fehlt" }, { status: 400 })
    }

    return NextResponse.json({ success: true, deletedId: id })
  } catch (error) {
    console.error("Error deleting workflow:", error)
    return NextResponse.json({ error: "Fehler beim Löschen" }, { status: 500 })
  }
}
