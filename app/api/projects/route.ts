import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/db"

// GET: Alle Projekte abrufen
// Auf Render: Datenbank, Lokal: localStorage
export async function GET(request: NextRequest) {
  // Ohne Datenbank (lokal): Leere Liste zurückgeben
  if (!prisma) {
    return NextResponse.json({ projects: [], localMode: true })
  }

  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId") || "default"

    const projects = await prisma.project.findMany({
      where: { userId },
      include: {
        files: true,
        messages: {
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: { updatedAt: "desc" }
    })

    return NextResponse.json({ projects })
  } catch (error) {
    console.error("Error fetching projects:", error)
    // Bei Datenbankfehler: Fallback auf lokalen Modus
    return NextResponse.json({ projects: [], localMode: true })
  }
}

// POST: Neues Projekt erstellen
// Auf Render: Datenbank, Lokal: localStorage
export async function POST(request: NextRequest) {
  const body = await request.json()
  
  // Ohne Datenbank (lokal): Erfolg simulieren
  if (!prisma) {
    return NextResponse.json({ 
      project: { 
        id: crypto.randomUUID(),
        ...body,
        createdAt: new Date(),
        updatedAt: new Date(),
        files: [],
        messages: []
      },
      localMode: true 
    })
  }

  try {
    const { name, description, userId = "default", agentConfigs } = body

    const project = await prisma.project.create({
      data: {
        name,
        description,
        userId,
        agentConfigs
      },
      include: {
        files: true,
        messages: true
      }
    })

    return NextResponse.json({ project })
  } catch (error) {
    console.error("Error creating project:", error)
    // Bei Datenbankfehler: Fallback auf lokalen Modus
    return NextResponse.json({ 
      project: { 
        id: crypto.randomUUID(),
        ...body,
        createdAt: new Date(),
        updatedAt: new Date(),
        files: [],
        messages: []
      },
      localMode: true 
    })
  }
}
