import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 120

interface VercelDeployConfig {
  projectName: string
  framework?: "nextjs" | "vite" | "react" | "static"
  files: Array<{ path: string; content: string }>
  repoUrl?: string
  branch?: string
  envVars?: Record<string, string>
}

// POST /api/vercel/deploy - Deploy to Vercel
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, config, apiKey } = body as {
      action: "validate" | "deploy" | "status"
      config?: VercelDeployConfig
      apiKey?: string
    }

    switch (action) {
      case "validate":
        return handleValidate(apiKey)
      
      case "deploy":
        return handleDeploy(config, apiKey)
      
      case "status":
        return handleStatus(config, apiKey)
      
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 })
    }
  } catch (error) {
    console.error("Vercel Deploy Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

// Validate Vercel API Token
function handleValidate(apiKey?: string) {
  if (!apiKey) {
    return NextResponse.json({ 
      valid: false, 
      errors: ["Vercel Token fehlt"] 
    })
  }

  // Basic validation - Vercel tokens are usually long strings
  if (apiKey.length < 20) {
    return NextResponse.json({ 
      valid: false, 
      errors: ["Vercel Token scheint ungültig zu sein"] 
    })
  }

  return NextResponse.json({ 
    valid: true, 
    message: "Vercel Token Format OK" 
  })
}

// Deploy to Vercel
async function handleDeploy(config?: VercelDeployConfig, apiKey?: string) {
  const logs: string[] = []
  
  if (!config) {
    return NextResponse.json({ error: "Config fehlt" }, { status: 400 })
  }

  if (!apiKey) {
    return NextResponse.json({ error: "Vercel Token fehlt" }, { status: 400 })
  }

  try {
    logs.push("Starte Vercel Deployment...")
    
    // 1. Get or create project
    logs.push("Prüfe Vercel Projekt...")
    
    // First, get user/team info
    const userRes = await fetch("https://api.vercel.com/v2/user", {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
    })
    
    if (!userRes.ok) {
      const errorText = await userRes.text()
      console.error("Vercel API Error:", userRes.status, errorText)
      throw new Error(`Vercel API Fehler: ${userRes.status} - Prüfe deinen Token`)
    }
    
    const user = await userRes.json()
    logs.push(`Vercel User: ${user.user?.username || user.user?.email || "OK"}`)
    
    // 2. Create deployment using Vercel's deployment API
    logs.push("Erstelle Deployment...")
    
    // Prepare files for Vercel deployment
    const vercelFiles = config.files.map(file => ({
      file: file.path.startsWith("/") ? file.path.slice(1) : file.path,
      data: file.content,
    }))
    
    // Determine project settings based on framework
    const projectSettings: Record<string, unknown> = {
      framework: config.framework || "nextjs",
    }
    
    if (config.framework === "nextjs") {
      projectSettings.installCommand = "npm install"
      projectSettings.buildCommand = "npm run build"
      projectSettings.outputDirectory = ".next"
    } else if (config.framework === "vite") {
      projectSettings.installCommand = "npm install"
      projectSettings.buildCommand = "npm run build"
      projectSettings.outputDirectory = "dist"
    }
    
    // Create deployment
    const deployRes = await fetch("https://api.vercel.com/v13/deployments", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: config.projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        files: vercelFiles,
        projectSettings,
        target: "production",
        source: "api",
      }),
    })
    
    if (!deployRes.ok) {
      const errorData = await deployRes.json()
      console.error("Vercel Deploy Error:", errorData)
      
      // Handle specific errors
      if (errorData.error?.code === "forbidden") {
        throw new Error("Keine Berechtigung. Prüfe deinen Vercel Token.")
      }
      if (errorData.error?.code === "invalid_request") {
        throw new Error(errorData.error?.message || "Ungültige Anfrage")
      }
      
      throw new Error(errorData.error?.message || `Vercel API Error: ${deployRes.status}`)
    }
    
    const deployment = await deployRes.json()
    logs.push(`✓ Deployment erstellt: ${deployment.id}`)
    logs.push(`URL: https://${deployment.url}`)
    
    // Return success
    return NextResponse.json({
      success: true,
      logs,
      deploymentId: deployment.id,
      url: `https://${deployment.url}`,
      projectUrl: `https://vercel.com/${user.user?.username}/${config.projectName}`,
      status: deployment.readyState,
    })
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unbekannter Fehler"
    logs.push(`Fehler: ${errorMessage}`)
    
    return NextResponse.json({
      success: false,
      logs,
      error: errorMessage,
    })
  }
}

// Get deployment status
async function handleStatus(config?: VercelDeployConfig, apiKey?: string) {
  if (!apiKey) {
    return NextResponse.json({ error: "Vercel Token fehlt" }, { status: 400 })
  }
  
  // Get recent deployments
  try {
    const deploymentsRes = await fetch(
      `https://api.vercel.com/v6/deployments?limit=5`,
      {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
        },
      }
    )
    
    if (!deploymentsRes.ok) {
      throw new Error(`API Error: ${deploymentsRes.status}`)
    }
    
    const data = await deploymentsRes.json()
    
    return NextResponse.json({
      success: true,
      deployments: data.deployments?.map((d: { uid: string; name: string; url: string; state: string; created: number }) => ({
        id: d.uid,
        name: d.name,
        url: `https://${d.url}`,
        state: d.state,
        created: d.created,
      })) || [],
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unbekannter Fehler",
    })
  }
}

// GET - Return available options
export async function GET() {
  return NextResponse.json({
    frameworks: [
      { id: "nextjs", name: "Next.js", description: "React Framework mit SSR" },
      { id: "vite", name: "Vite", description: "Schneller Build-Tool" },
      { id: "react", name: "Create React App", description: "Standard React Setup" },
      { id: "static", name: "Static", description: "Statische Dateien" },
    ],
    features: [
      "Automatisches HTTPS",
      "Edge Network (CDN)",
      "Serverless Functions",
      "Preview Deployments",
      "Automatische Skalierung",
    ],
    pricing: {
      hobby: { name: "Hobby", price: "Kostenlos", limits: "100GB Bandwidth" },
      pro: { name: "Pro", price: "$20/mo", limits: "1TB Bandwidth" },
    },
  })
}
