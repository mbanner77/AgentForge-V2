import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/db"

// POST: Dateien zu einem Projekt hinzufügen/aktualisieren
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
    const { files, projectName } = body

    if (!files || !Array.isArray(files)) {
      return NextResponse.json({ error: "Keine Dateien angegeben" }, { status: 400 })
    }

    // Stelle sicher, dass das Projekt existiert (upsert)
    await prisma.project.upsert({
      where: { id: projectId },
      update: { updatedAt: new Date() },
      create: {
        id: projectId,
        name: projectName || "Neues Projekt",
        description: "",
      }
    })

    // Upsert für jede Datei
    const results = await Promise.all(
      files.map(async (file: { path: string; content: string; language: string; status?: string }) => {
        return prisma.projectFile.upsert({
          where: {
            projectId_path: {
              projectId,
              path: file.path
            }
          },
          update: {
            content: file.content,
            language: file.language,
            status: file.status || "modified",
            updatedAt: new Date()
          },
          create: {
            projectId,
            path: file.path,
            content: file.content,
            language: file.language,
            status: file.status || "created"
          }
        })
      })
    )

    return NextResponse.json({ files: results })
  } catch (error) {
    console.error("Error saving files:", error)
    return NextResponse.json({ error: "Fehler beim Speichern der Dateien" }, { status: 500 })
  }
}

// DELETE: Alle Dateien eines Projekts löschen
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!prisma) {
    return NextResponse.json({ success: true, localMode: true })
  }

  try {
    const { id: projectId } = await params

    await prisma.projectFile.deleteMany({
      where: { projectId }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting files:", error)
    return NextResponse.json({ error: "Fehler beim Löschen der Dateien" }, { status: 500 })
  }
}
