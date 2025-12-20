import { NextRequest, NextResponse } from "next/server"
import { execSync } from "child_process"
import { 
  type BTPCredentials, 
  type BTPDeploymentConfig,
  type BTPDeploymentResult,
  generateMtaYaml,
  generateXsSecurityJson,
  validateBTPCredentials,
  CF_COMMANDS,
} from "@/lib/btp-deployment"

export const runtime = "nodejs"
export const maxDuration = 300 // 5 Minuten für Deployment

// POST /api/btp/deploy - Deploy to BTP
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, config, credentials } = body as {
      action: "validate" | "build" | "deploy" | "status" | "generate-mta"
      config?: BTPDeploymentConfig
      credentials?: BTPCredentials
    }

    switch (action) {
      case "validate":
        return handleValidate(credentials)
      
      case "generate-mta":
        return handleGenerateMta(config)
      
      case "build":
        return handleBuild(config)
      
      case "deploy":
        return handleDeploy(config)
      
      case "status":
        return handleStatus(config)
      
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 })
    }
  } catch (error) {
    console.error("BTP Deploy Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

// Validate BTP Credentials
function handleValidate(credentials?: BTPCredentials) {
  if (!credentials) {
    return NextResponse.json({ error: "Credentials required" }, { status: 400 })
  }

  const validation = validateBTPCredentials(credentials)
  
  if (!validation.valid) {
    return NextResponse.json({ 
      valid: false, 
      errors: validation.errors 
    })
  }

  // In demo mode, just validate format
  const isDemoMode = process.env.MCP_MODE !== "production"
  
  if (isDemoMode) {
    return NextResponse.json({
      valid: true,
      mode: "demo",
      message: "Credentials Format valid (Demo-Mode - keine echte Verbindung)",
    })
  }

  // Production: Test actual CF login
  try {
    const loginCmd = CF_COMMANDS.login(credentials)
    execSync(loginCmd, { encoding: "utf-8", timeout: 30000 })
    
    return NextResponse.json({
      valid: true,
      mode: "production",
      message: "Successfully connected to BTP",
    })
  } catch (error) {
    return NextResponse.json({
      valid: false,
      errors: ["CF Login fehlgeschlagen: " + (error instanceof Error ? error.message : "Unknown error")],
    })
  }
}

// Generate MTA files
function handleGenerateMta(config?: BTPDeploymentConfig) {
  if (!config) {
    return NextResponse.json({ error: "Config required" }, { status: 400 })
  }

  const mtaYaml = generateMtaYaml({
    appName: config.appName,
    projectType: config.projectType === "mta" ? "cap" : config.projectType,
    useHANA: config.useHANA,
  })

  const xsSecurity = generateXsSecurityJson(config.appName)

  return NextResponse.json({
    success: true,
    files: {
      "mta.yaml": mtaYaml,
      "xs-security.json": xsSecurity,
    },
  })
}

// Build MTA
function handleBuild(config?: BTPDeploymentConfig) {
  if (!config) {
    return NextResponse.json({ error: "Config required" }, { status: 400 })
  }

  const isDemoMode = process.env.MCP_MODE !== "production"
  const logs: string[] = []

  if (isDemoMode) {
    // Simulate build process
    logs.push("[Demo] Starting MTA build...")
    logs.push("[Demo] Installing dependencies...")
    logs.push("[Demo] Running cds build --production...")
    logs.push("[Demo] Building MTA archive...")
    logs.push(`[Demo] Created: mta_archives/${config.appName}_1.0.0.mtar`)
    logs.push("[Demo] Build completed successfully")

    return NextResponse.json({
      success: true,
      mode: "demo",
      mtarPath: `mta_archives/${config.appName}_1.0.0.mtar`,
      logs,
    })
  }

  // Production: Run actual build
  try {
    logs.push("Starting MTA build...")
    
    // Check if mbt is installed
    try {
      execSync("mbt --version", { encoding: "utf-8" })
    } catch {
      logs.push("Installing MBT (MTA Build Tool)...")
      execSync("npm install -g mbt", { encoding: "utf-8" })
    }

    logs.push("Running mbt build...")
    const buildOutput = execSync(CF_COMMANDS.mtaBuild(), {
      cwd: config.projectPath,
      encoding: "utf-8",
      timeout: 300000, // 5 min
    })
    logs.push(buildOutput)

    const mtarPath = `mta_archives/${config.appName}_1.0.0.mtar`
    logs.push(`Build completed: ${mtarPath}`)

    return NextResponse.json({
      success: true,
      mode: "production",
      mtarPath,
      logs,
    })
  } catch (error) {
    logs.push(`Build error: ${error instanceof Error ? error.message : "Unknown"}`)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Build failed",
      logs,
    }, { status: 500 })
  }
}

// Deploy to BTP
function handleDeploy(config?: BTPDeploymentConfig) {
  if (!config) {
    return NextResponse.json({ error: "Config required" }, { status: 400 })
  }

  const isDemoMode = process.env.MCP_MODE !== "production"
  const logs: string[] = []
  const result: BTPDeploymentResult = {
    success: false,
    logs,
  }

  if (isDemoMode) {
    // Simulate deployment
    logs.push("[Demo] Logging in to Cloud Foundry...")
    logs.push(`[Demo] API Endpoint: ${config.credentials.apiEndpoint}`)
    logs.push(`[Demo] Org: ${config.credentials.org}`)
    logs.push(`[Demo] Space: ${config.credentials.space}`)
    logs.push("[Demo] Login successful")
    logs.push("")
    logs.push("[Demo] Deploying MTA archive...")
    logs.push("[Demo] Creating services...")
    logs.push(`[Demo]   - Creating ${config.appName}-auth (xsuaa)`)
    logs.push(`[Demo]   - Creating ${config.appName}-db (hana)`)
    logs.push(`[Demo]   - Creating ${config.appName}-destination (destination)`)
    logs.push("[Demo] Deploying modules...")
    logs.push(`[Demo]   - Deploying ${config.appName}-srv`)
    logs.push(`[Demo]   - Deploying ${config.appName}-db-deployer`)
    logs.push(`[Demo]   - Deploying ${config.appName}-app`)
    logs.push("[Demo] Binding services...")
    logs.push("[Demo] Starting applications...")
    logs.push("")
    logs.push("[Demo] Deployment completed successfully!")
    logs.push("")
    logs.push(`[Demo] Application URL: https://${config.appName}.cfapps.${extractRegion(config.credentials.apiEndpoint)}.hana.ondemand.com`)

    result.success = true
    result.appUrl = `https://${config.appName}.cfapps.${extractRegion(config.credentials.apiEndpoint)}.hana.ondemand.com`
    result.duration = 45000 // 45 seconds simulated

    return NextResponse.json({
      ...result,
      mode: "demo",
    })
  }

  // Production: Run actual deployment
  try {
    // Login
    logs.push("Logging in to Cloud Foundry...")
    execSync(CF_COMMANDS.login(config.credentials), {
      encoding: "utf-8",
      timeout: 30000,
    })
    logs.push("Login successful")

    // Deploy
    const mtarPath = `mta_archives/${config.appName}_1.0.0.mtar`
    logs.push(`Deploying ${mtarPath}...`)
    
    const deployOutput = execSync(CF_COMMANDS.mtaDeploy(mtarPath), {
      cwd: config.projectPath,
      encoding: "utf-8",
      timeout: 600000, // 10 min
    })
    logs.push(deployOutput)

    // Get app URL
    const appsOutput = execSync(CF_COMMANDS.apps(), { encoding: "utf-8" })
    const appLine = appsOutput.split("\n").find(l => l.includes(config.appName))
    const urlMatch = appLine?.match(/https?:\/\/[^\s]+/)
    
    result.success = true
    result.appUrl = urlMatch?.[0]
    logs.push(`Deployment completed! URL: ${result.appUrl}`)

    return NextResponse.json({
      ...result,
      mode: "production",
    })
  } catch (error) {
    logs.push(`Deployment error: ${error instanceof Error ? error.message : "Unknown"}`)
    result.error = error instanceof Error ? error.message : "Deployment failed"
    
    return NextResponse.json({
      ...result,
      mode: "production",
    }, { status: 500 })
  }
}

// Get deployment status
function handleStatus(config?: BTPDeploymentConfig) {
  if (!config) {
    return NextResponse.json({ error: "Config required" }, { status: 400 })
  }

  const isDemoMode = process.env.MCP_MODE !== "production"

  if (isDemoMode) {
    return NextResponse.json({
      mode: "demo",
      apps: [
        { name: `${config.appName}-srv`, state: "STARTED", instances: "1/1", memory: "256M" },
        { name: `${config.appName}-app`, state: "STARTED", instances: "1/1", memory: "256M" },
      ],
      services: [
        { name: `${config.appName}-auth`, service: "xsuaa", plan: "application" },
        { name: `${config.appName}-db`, service: "hana", plan: "hdi-shared" },
        { name: `${config.appName}-destination`, service: "destination", plan: "lite" },
      ],
    })
  }

  // Production: Get actual status
  try {
    const appsOutput = execSync(CF_COMMANDS.apps(), { encoding: "utf-8" })
    const servicesOutput = execSync(CF_COMMANDS.services(), { encoding: "utf-8" })

    return NextResponse.json({
      mode: "production",
      appsRaw: appsOutput,
      servicesRaw: servicesOutput,
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Status check failed",
    }, { status: 500 })
  }
}

// Extract region from API endpoint
function extractRegion(apiEndpoint: string): string {
  const match = apiEndpoint.match(/api\.cf\.([^.]+)\./)
  return match?.[1] || "eu10"
}

// GET /api/btp/deploy - Get BTP regions and info
export async function GET() {
  const { BTP_REGIONS, BTP_SERVICES } = await import("@/lib/btp-deployment")
  
  return NextResponse.json({
    regions: BTP_REGIONS,
    services: BTP_SERVICES,
    requirements: [
      "Cloud Foundry CLI (cf) installiert",
      "MTA Build Tool (mbt) installiert",
      "BTP Account mit Cloud Foundry Environment",
      "Mindestens Space Developer Rolle",
    ],
    installCommands: {
      cf: "brew install cloudfoundry/tap/cf-cli",
      mbt: "npm install -g mbt",
    },
  })
}
