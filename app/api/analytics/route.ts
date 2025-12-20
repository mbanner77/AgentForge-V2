import { NextRequest, NextResponse } from "next/server"

// Analytics data structure
interface AnalyticsData {
  totalProjects: number
  totalWorkflows: number
  totalFilesGenerated: number
  totalTokensUsed: number
  successRate: number
  avgWorkflowDuration: number
  agentUsage: Record<string, number>
  modelUsage: Record<string, number>
  dailyActivity: Array<{ date: string; workflows: number; files: number }>
}

// Mock analytics data - in production, aggregate from database
function getAnalyticsData(): AnalyticsData {
  const today = new Date()
  const dailyActivity = []
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    dailyActivity.push({
      date: date.toISOString().slice(0, 10),
      workflows: Math.floor(Math.random() * 10) + 1,
      files: Math.floor(Math.random() * 30) + 5,
    })
  }

  return {
    totalProjects: 12,
    totalWorkflows: 47,
    totalFilesGenerated: 234,
    totalTokensUsed: 1250000,
    successRate: 0.89,
    avgWorkflowDuration: 45, // seconds
    agentUsage: {
      planner: 47,
      coder: 47,
      reviewer: 42,
      security: 28,
      executor: 35,
    },
    modelUsage: {
      "gpt-4o": 120,
      "gpt-4o-mini": 45,
      "claude-3-5-sonnet": 32,
      "claude-3-opus": 8,
    },
    dailyActivity,
  }
}

// GET: Analytics-Daten abrufen
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get("period") || "7d" // 7d, 30d, 90d, all
    
    const analytics = getAnalyticsData()

    return NextResponse.json({
      analytics,
      period,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Error fetching analytics:", error)
    return NextResponse.json({ error: "Fehler beim Laden der Analytics" }, { status: 500 })
  }
}

// POST: Analytics-Event tracken
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { event, data } = body

    if (!event) {
      return NextResponse.json({ error: "Event name ist erforderlich" }, { status: 400 })
    }

    // In production, save to analytics database/service
    console.log("Analytics event:", event, data)

    return NextResponse.json({ success: true, event })
  } catch (error) {
    console.error("Error tracking analytics:", error)
    return NextResponse.json({ error: "Fehler beim Tracking" }, { status: 500 })
  }
}
