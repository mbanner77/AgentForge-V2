import { NextRequest, NextResponse } from "next/server"
import {
  type RenderDeploymentConfig,
  type RenderDeploymentResult,
  generateRenderBlueprint,
  generateFullStackBlueprint,
  validateRenderApiKey,
  RENDER_REGIONS,
  RENDER_PLANS,
} from "@/lib/render-deployment"

export const runtime = "nodejs"
export const maxDuration = 120

// POST /api/render/deploy - Deploy to Render
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, config, apiKey } = body as {
      action: "validate" | "generate-blueprint" | "create-service" | "deploy" | "status"
      config?: RenderDeploymentConfig & { includeDatabase?: boolean; includeWorker?: boolean }
      apiKey?: string
    }

    switch (action) {
      case "validate":
        return handleValidate(apiKey)
      
      case "generate-blueprint":
        return handleGenerateBlueprint(config)
      
      case "create-service":
        return handleCreateService(config, apiKey)
      
      case "deploy":
        return handleDeploy(config, apiKey)
      
      case "status":
        return handleStatus(config, apiKey)
      
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 })
    }
  } catch (error) {
    console.error("Render Deploy Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

// Validate Render API Key
function handleValidate(apiKey?: string) {
  if (!apiKey) {
    return NextResponse.json({ 
      valid: false, 
      errors: ["API Key fehlt"] 
    })
  }

  if (!validateRenderApiKey(apiKey)) {
    return NextResponse.json({ 
      valid: false, 
      errors: ["Ungültiges API Key Format (muss mit 'rnd_' beginnen)"] 
    })
  }

  const isDemoMode = process.env.MCP_MODE !== "production"

  if (isDemoMode) {
    return NextResponse.json({
      valid: true,
      mode: "demo",
      message: "API Key Format valid (Demo-Mode)",
    })
  }

  // Production: Test actual API connection
  return testRenderConnection(apiKey)
}

// Test Render API connection
async function testRenderConnection(apiKey: string) {
  try {
    const response = await fetch("https://api.render.com/v1/owners", {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
      },
    })

    if (!response.ok) {
      return NextResponse.json({
        valid: false,
        errors: [`Render API Fehler: ${response.status}`],
      })
    }

    const data = await response.json()
    return NextResponse.json({
      valid: true,
      mode: "production",
      message: "Connected to Render",
      owners: data.map((o: { id: string; name: string; email: string }) => ({
        id: o.id,
        name: o.name,
        email: o.email,
      })),
    })
  } catch (error) {
    return NextResponse.json({
      valid: false,
      errors: [`Verbindung fehlgeschlagen: ${error instanceof Error ? error.message : "Unknown"}`],
    })
  }
}

// Generate Blueprint
function handleGenerateBlueprint(config?: RenderDeploymentConfig & { includeDatabase?: boolean; includeWorker?: boolean }) {
  if (!config) {
    return NextResponse.json({ error: "Config required" }, { status: 400 })
  }

  let blueprint: string

  if (config.includeDatabase || config.includeWorker) {
    blueprint = generateFullStackBlueprint({
      projectName: config.projectName,
      region: config.region,
      includeDatabase: config.includeDatabase,
      includeWorker: config.includeWorker,
    })
  } else {
    blueprint = generateRenderBlueprint(config)
  }

  // Generate deploy button URL
  const deployButtonUrl = `https://render.com/deploy?repo=https://github.com/YOUR_USERNAME/${config.projectName}`

  return NextResponse.json({
    success: true,
    blueprint,
    filename: "render.yaml",
    deployButtonUrl,
    instructions: [
      "1. Erstelle ein GitHub Repository für dein Projekt",
      "2. Füge die render.yaml Datei zum Repository hinzu",
      "3. Verbinde das Repository mit Render",
      "4. Render deployt automatisch bei jedem Push",
    ],
  })
}

// Create Service on Render
async function handleCreateService(
  config?: RenderDeploymentConfig,
  apiKey?: string
): Promise<NextResponse> {
  if (!config) {
    return NextResponse.json({ error: "Config required" }, { status: 400 })
  }

  const isDemoMode = process.env.MCP_MODE !== "production"
  const logs: string[] = []
  const result: RenderDeploymentResult = {
    success: false,
    logs,
  }

  if (isDemoMode) {
    // Simulate service creation
    logs.push("[Demo] Erstelle Render Service...")
    logs.push(`[Demo] Service Name: ${config.projectName}`)
    logs.push(`[Demo] Region: ${config.region}`)
    logs.push(`[Demo] Plan: ${config.plan}`)
    logs.push("[Demo] Service erstellt!")
    logs.push("")
    logs.push("[Demo] Generiere Blueprint...")
    
    const blueprint = generateRenderBlueprint(config)
    logs.push("[Demo] Blueprint generiert:")
    logs.push("---")
    blueprint.split("\n").slice(0, 10).forEach(line => logs.push(`[Demo] ${line}`))
    logs.push("[Demo] ...")
    logs.push("---")
    logs.push("")
    logs.push(`[Demo] Service URL: https://${config.projectName}.onrender.com`)
    logs.push(`[Demo] Dashboard: https://dashboard.render.com/web/srv-demo123`)

    result.success = true
    result.serviceId = "srv-demo123"
    result.serviceUrl = `https://${config.projectName}.onrender.com`
    result.dashboardUrl = "https://dashboard.render.com/web/srv-demo123"
    result.blueprintUrl = `https://render.com/deploy?repo=https://github.com/YOUR_USERNAME/${config.projectName}`

    return NextResponse.json({
      ...result,
      mode: "demo",
      blueprint,
    })
  }

  // Production: Create actual service
  if (!apiKey) {
    return NextResponse.json({ error: "API Key required for production" }, { status: 400 })
  }

  try {
    logs.push("Erstelle Render Service...")
    
    // First, get owner ID
    const ownersRes = await fetch("https://api.render.com/v1/owners", {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
      },
    })
    
    if (!ownersRes.ok) {
      const errorText = await ownersRes.text()
      console.error("Render API Error:", ownersRes.status, errorText)
      throw new Error(`Render API Fehler: ${ownersRes.status} - Prüfe deinen API-Key`)
    }
    
    const ownersData = await ownersRes.json()
    console.log("Render Owners Response:", JSON.stringify(ownersData, null, 2))
    
    // Render API gibt ein Array zurück, wobei jedes Element ein {owner: {...}} Objekt hat
    // Oder direkt ein Array von Ownern - handle beide Fälle
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let owners: Array<{id: string, name?: string, email?: string}> = []
    if (Array.isArray(ownersData)) {
      // Format: [{owner: {...}}, ...] oder [{id: ..., name: ...}, ...]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      owners = ownersData.map((item: any) => item.owner || item).filter((o: any) => o?.id)
    } else if (ownersData.owners) {
      // Format: {owners: [...]}
      owners = ownersData.owners
    }
    
    const ownerId = owners[0]?.id

    if (!ownerId) {
      console.error("No owner found in response:", ownersData)
      throw new Error("Kein Render Owner gefunden. Stelle sicher, dass dein API-Key gültig ist und Berechtigungen hat.")
    }
    logs.push(`Owner gefunden: ${owners[0]?.name || owners[0]?.email || ownerId}`)

    // Create web service
    const serviceRes = await fetch("https://api.render.com/v1/services", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "web_service",
        name: config.projectName,
        ownerId,
        repo: config.repoUrl || `https://github.com/YOUR_USERNAME/${config.projectName}`,
        branch: config.branch || "main",
        autoDeploy: config.autoDeploy !== false ? "yes" : "no",
        serviceDetails: {
          region: config.region,
          plan: config.plan,
          runtime: "node",
          buildCommand: config.buildCommand || "npm install && npm run build",
          startCommand: config.startCommand || "npm start",
          envVars: config.envVars ? Object.entries(config.envVars).map(([key, value]) => ({
            key,
            value,
          })) : [],
        },
      }),
    })

    if (!serviceRes.ok) {
      const errorData = await serviceRes.json()
      throw new Error(errorData.message || `API Error: ${serviceRes.status}`)
    }

    const service = await serviceRes.json()
    logs.push(`Service erstellt: ${service.service.name}`)
    logs.push(`Service ID: ${service.service.id}`)
    logs.push(`URL: ${service.service.serviceDetails?.url || "Pending..."}`)

    result.success = true
    result.serviceId = service.service.id
    result.serviceUrl = service.service.serviceDetails?.url
    result.dashboardUrl = `https://dashboard.render.com/web/${service.service.id}`

    // Generate blueprint for reference
    const blueprint = generateRenderBlueprint(config)
    result.blueprintUrl = `https://render.com/deploy?repo=${config.repoUrl || ""}`

    return NextResponse.json({
      ...result,
      mode: "production",
      blueprint,
    })
  } catch (error) {
    logs.push(`Fehler: ${error instanceof Error ? error.message : "Unknown"}`)
    result.error = error instanceof Error ? error.message : "Service creation failed"
    
    return NextResponse.json({
      ...result,
      mode: "production",
    }, { status: 500 })
  }
}

// Full deploy flow
async function handleDeploy(
  config?: RenderDeploymentConfig,
  apiKey?: string
): Promise<NextResponse> {
  if (!config) {
    return NextResponse.json({ error: "Config required" }, { status: 400 })
  }

  const isDemoMode = process.env.MCP_MODE !== "production"
  const logs: string[] = []

  if (isDemoMode) {
    // Simulate full deployment
    logs.push("[Demo] === Render Deployment Start ===")
    logs.push("")
    logs.push("[Demo] 1. Generiere Blueprint...")
    logs.push("[Demo] ✓ render.yaml erstellt")
    logs.push("")
    logs.push("[Demo] 2. Erstelle Service...")
    logs.push(`[Demo] Name: ${config.projectName}`)
    logs.push(`[Demo] Region: ${RENDER_REGIONS.find(r => r.id === config.region)?.name || config.region}`)
    logs.push(`[Demo] Plan: ${RENDER_PLANS.find(p => p.id === config.plan)?.name || config.plan}`)
    logs.push("[Demo] ✓ Service erstellt")
    logs.push("")
    logs.push("[Demo] 3. Starte Build...")
    logs.push("[Demo] → npm install")
    logs.push("[Demo] → npm run build")
    logs.push("[Demo] ✓ Build erfolgreich")
    logs.push("")
    logs.push("[Demo] 4. Deploye...")
    logs.push("[Demo] → Container wird erstellt")
    logs.push("[Demo] → Health Check läuft")
    logs.push("[Demo] ✓ Deployment erfolgreich!")
    logs.push("")
    logs.push("[Demo] === Deployment Complete ===")
    logs.push("")
    logs.push(`[Demo] 🚀 App URL: https://${config.projectName}.onrender.com`)
    logs.push(`[Demo] 📊 Dashboard: https://dashboard.render.com/web/srv-demo123`)

    const blueprint = generateRenderBlueprint(config)

    return NextResponse.json({
      success: true,
      mode: "demo",
      serviceId: "srv-demo123",
      serviceUrl: `https://${config.projectName}.onrender.com`,
      dashboardUrl: "https://dashboard.render.com/web/srv-demo123",
      blueprint,
      logs,
    })
  }

  // Production deployment
  return handleCreateService(config, apiKey)
}

// Get deployment status
async function handleStatus(
  config?: RenderDeploymentConfig,
  apiKey?: string
): Promise<NextResponse> {
  const isDemoMode = process.env.MCP_MODE !== "production"

  if (isDemoMode) {
    return NextResponse.json({
      mode: "demo",
      status: "live",
      service: {
        id: "srv-demo123",
        name: config?.projectName || "demo-app",
        type: "web_service",
        status: "live",
        url: `https://${config?.projectName || "demo-app"}.onrender.com`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    })
  }

  if (!apiKey) {
    return NextResponse.json({ error: "API Key required" }, { status: 400 })
  }

  try {
    const response = await fetch("https://api.render.com/v1/services", {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
      },
    })

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`)
    }

    const services = await response.json()
    
    return NextResponse.json({
      mode: "production",
      services: services.map((s: { service: { id: string; name: string; type: string; suspended: string; serviceDetails?: { url: string } }; cursor: string }) => ({
        id: s.service.id,
        name: s.service.name,
        type: s.service.type,
        status: s.service.suspended === "suspended" ? "suspended" : "live",
        url: s.service.serviceDetails?.url,
      })),
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Status check failed",
    }, { status: 500 })
  }
}

// GET /api/render/deploy - Get Render info
export async function GET() {
  return NextResponse.json({
    regions: RENDER_REGIONS,
    plans: RENDER_PLANS,
    projectTypes: [
      { id: "nextjs", name: "Next.js", description: "React Framework mit SSR" },
      { id: "node", name: "Node.js", description: "Node.js Backend Service" },
      { id: "static", name: "Static Site", description: "Statische Website" },
      { id: "docker", name: "Docker", description: "Custom Docker Container" },
    ],
    documentation: "https://render.com/docs",
  })
}
