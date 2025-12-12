import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/db"

// GET: Benutzereinstellungen abrufen
// Auf Render: Datenbank, Lokal: localStorage
export async function GET(request: NextRequest) {
  // Ohne Datenbank (lokal): Einstellungen werden im Browser gespeichert
  if (!prisma) {
    return NextResponse.json({ settings: null, localMode: true })
  }

  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId") || "default"

    let user = await prisma.user.findUnique({
      where: { id: userId },
      include: { settings: true }
    })

    if (!user) {
      user = await prisma.user.create({
        data: {
          id: userId,
          settings: {
            create: {
              defaultModel: "gpt-4o",
              autoReview: true,
              streaming: true,
              theme: "dark",
              language: "de"
            }
          }
        },
        include: { settings: true }
      })
    }

    return NextResponse.json({ settings: user.settings })
  } catch (error) {
    console.error("Error fetching settings:", error)
    // Bei Datenbankfehler: Fallback auf lokalen Modus
    return NextResponse.json({ settings: null, localMode: true })
  }
}

// PUT: Benutzereinstellungen aktualisieren
// Auf Render: Datenbank, Lokal: localStorage
export async function PUT(request: NextRequest) {
  // Ohne Datenbank (lokal): Erfolg simulieren
  if (!prisma) {
    return NextResponse.json({ success: true, localMode: true })
  }

  try {
    const body = await request.json()
    const { userId = "default", ...settingsData } = body

    let user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user) {
      user = await prisma.user.create({
        data: { id: userId }
      })
    }

    const settings = await prisma.userSettings.upsert({
      where: { userId },
      update: {
        ...settingsData,
        updatedAt: new Date()
      },
      create: {
        userId,
        ...settingsData
      }
    })

    return NextResponse.json({ settings })
  } catch (error) {
    console.error("Error updating settings:", error)
    // Bei Datenbankfehler: Fallback auf lokalen Modus
    return NextResponse.json({ success: true, localMode: true })
  }
}
