import { NextRequest, NextResponse } from "next/server"

// In-memory log storage (in production, use database or logging service)
let logs: Array<{
  id: string
  timestamp: Date
  level: "info" | "warn" | "error" | "debug"
  agent: string
  message: string
  data?: unknown
}> = []

// GET: Logs abrufen
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const level = searchParams.get("level")
    const agent = searchParams.get("agent")
    const limit = parseInt(searchParams.get("limit") || "100")
    const offset = parseInt(searchParams.get("offset") || "0")

    let filteredLogs = [...logs]

    if (level && level !== "all") {
      filteredLogs = filteredLogs.filter(log => log.level === level)
    }

    if (agent && agent !== "all") {
      filteredLogs = filteredLogs.filter(log => log.agent === agent)
    }

    // Sort by timestamp descending (newest first)
    filteredLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    // Paginate
    const paginatedLogs = filteredLogs.slice(offset, offset + limit)

    return NextResponse.json({
      logs: paginatedLogs,
      total: filteredLogs.length,
      hasMore: offset + limit < filteredLogs.length
    })
  } catch (error) {
    console.error("Error fetching logs:", error)
    return NextResponse.json({ error: "Fehler beim Laden der Logs" }, { status: 500 })
  }
}

// POST: Neuen Log-Eintrag erstellen
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { level, agent, message, data } = body

    if (!level || !agent || !message) {
      return NextResponse.json({ error: "level, agent und message sind erforderlich" }, { status: 400 })
    }

    const logEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      level,
      agent,
      message,
      data
    }

    logs.push(logEntry)

    // Keep only last 10000 logs
    if (logs.length > 10000) {
      logs = logs.slice(-10000)
    }

    return NextResponse.json({ log: logEntry })
  } catch (error) {
    console.error("Error creating log:", error)
    return NextResponse.json({ error: "Fehler beim Erstellen des Logs" }, { status: 500 })
  }
}

// DELETE: Logs löschen
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const all = searchParams.get("all") === "true"
    const before = searchParams.get("before")

    if (all) {
      logs = []
      return NextResponse.json({ success: true, message: "Alle Logs gelöscht" })
    }

    if (before) {
      const beforeDate = new Date(before)
      logs = logs.filter(log => new Date(log.timestamp) > beforeDate)
      return NextResponse.json({ success: true, message: `Logs vor ${before} gelöscht` })
    }

    return NextResponse.json({ error: "Parameter all=true oder before=<date> erforderlich" }, { status: 400 })
  } catch (error) {
    console.error("Error deleting logs:", error)
    return NextResponse.json({ error: "Fehler beim Löschen der Logs" }, { status: 500 })
  }
}
