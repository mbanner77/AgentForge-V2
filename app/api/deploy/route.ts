import { NextRequest, NextResponse } from "next/server"

export const runtime = "edge"

interface DeployRequest {
  projectName: string
  files?: { path: string; content: string }[]
  renderApiKey: string
  repoUrl?: string // GitHub Repository URL für Render.com
}

interface RenderService {
  id: string
  name: string
  slug: string
  serviceDetails: {
    url: string
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: DeployRequest = await request.json()
    const { projectName, renderApiKey, repoUrl } = body

    if (!renderApiKey) {
      return NextResponse.json(
        { error: "Render API Key fehlt. Bitte in den Einstellungen konfigurieren." },
        { status: 400 }
      )
    }

    if (!repoUrl) {
      return NextResponse.json(
        { error: "GitHub Repository URL fehlt." },
        { status: 400 }
      )
    }

    const serviceName = `agentforge-${projectName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`

    // Schritt 1: Hole Owner ID
    const ownersResponse = await fetch("https://api.render.com/v1/owners?limit=1", {
      headers: {
        Authorization: `Bearer ${renderApiKey}`,
        "Content-Type": "application/json",
      },
    })

    if (!ownersResponse.ok) {
      const error = await ownersResponse.text()
      console.error("Render API Error (owners):", error)
      return NextResponse.json(
        { error: `Render API Fehler: ${ownersResponse.status} - Bitte API Key prüfen` },
        { status: ownersResponse.status }
      )
    }

    const ownersData = await ownersResponse.json()
    const ownerId = ownersData[0]?.owner?.id

    if (!ownerId) {
      return NextResponse.json(
        { error: "Kein Render.com Owner gefunden. Bitte API Key prüfen." },
        { status: 400 }
      )
    }

    // Schritt 2: Prüfe ob Service bereits existiert
    const existingServices = await fetch("https://api.render.com/v1/services?limit=100", {
      headers: {
        Authorization: `Bearer ${renderApiKey}`,
        "Content-Type": "application/json",
      },
    })

    if (existingServices.ok) {
      const servicesData = await existingServices.json()
      const existingService = servicesData.find(
        (s: { service: RenderService }) => s.service.name === serviceName || s.service.slug === serviceName
      )

      if (existingService) {
        // Trigger neuen Deploy für existierenden Service
        const deployResponse = await fetch(
          `https://api.render.com/v1/services/${existingService.service.id}/deploys`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${renderApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              clearCache: "do_not_clear",
            }),
          }
        )

        if (deployResponse.ok) {
          const deployData = await deployResponse.json()
          return NextResponse.json({
            success: true,
            serviceId: existingService.service.id,
            serviceName: existingService.service.name,
            deployId: deployData.id,
            url: existingService.service.serviceDetails?.url || `https://${serviceName}.onrender.com`,
            message: "Neuer Deploy gestartet für existierenden Service",
            isNewService: false,
          })
        }
      }
    }

    // Schritt 3: Erstelle neuen Static Site Service mit GitHub Repo
    const createServiceResponse = await fetch("https://api.render.com/v1/services", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${renderApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "static_site",
        name: serviceName,
        ownerId: ownerId,
        repo: repoUrl,
        autoDeploy: "yes",
        branch: "main",
        buildCommand: "npm install && npm run build",
        staticPublishPath: ".next",
        envVars: [],
      }),
    })

    if (!createServiceResponse.ok) {
      const errorText = await createServiceResponse.text()
      console.error("Render Create Service Error:", errorText)
      
      // Fallback: Gib Anweisungen für manuelles Setup
      return NextResponse.json({
        success: false,
        error: "Automatisches Erstellen fehlgeschlagen. Bitte manuell auf Render.com verbinden.",
        manualSetup: true,
        dashboardUrl: "https://dashboard.render.com/select-repo?type=static",
        repoUrl: repoUrl,
      })
    }

    const newService = await createServiceResponse.json()

    return NextResponse.json({
      success: true,
      serviceId: newService.service?.id,
      serviceName: newService.service?.name || serviceName,
      url: newService.service?.serviceDetails?.url || `https://${serviceName}.onrender.com`,
      message: "Service erstellt und mit GitHub verbunden!",
      isNewService: true,
      dashboardUrl: `https://dashboard.render.com/static/${newService.service?.id}`,
    })

  } catch (error) {
    console.error("Deploy API Error:", error)
    return NextResponse.json(
      { error: "Interner Server-Fehler beim Deploy" },
      { status: 500 }
    )
  }
}

// GET: Status eines Deploys abrufen
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const serviceId = searchParams.get("serviceId")
  const deployId = searchParams.get("deployId")
  const renderApiKey = searchParams.get("apiKey")

  if (!renderApiKey || !serviceId) {
    return NextResponse.json(
      { error: "serviceId und apiKey sind erforderlich" },
      { status: 400 }
    )
  }

  try {
    if (deployId) {
      // Status eines spezifischen Deploys
      const response = await fetch(
        `https://api.render.com/v1/services/${serviceId}/deploys/${deployId}`,
        {
          headers: {
            Authorization: `Bearer ${renderApiKey}`,
          },
        }
      )

      if (!response.ok) {
        return NextResponse.json(
          { error: `Fehler beim Abrufen des Deploy-Status: ${response.status}` },
          { status: response.status }
        )
      }

      const data = await response.json()
      return NextResponse.json({
        status: data.status,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        finishedAt: data.finishedAt,
      })
    } else {
      // Letzter Deploy des Services
      const response = await fetch(
        `https://api.render.com/v1/services/${serviceId}/deploys?limit=1`,
        {
          headers: {
            Authorization: `Bearer ${renderApiKey}`,
          },
        }
      )

      if (!response.ok) {
        return NextResponse.json(
          { error: `Fehler beim Abrufen der Deploys: ${response.status}` },
          { status: response.status }
        )
      }

      const data = await response.json()
      const latestDeploy = data[0]

      return NextResponse.json({
        deployId: latestDeploy?.deploy?.id,
        status: latestDeploy?.deploy?.status,
        createdAt: latestDeploy?.deploy?.createdAt,
        finishedAt: latestDeploy?.deploy?.finishedAt,
      })
    }
  } catch (error) {
    console.error("Deploy Status Error:", error)
    return NextResponse.json(
      { error: "Fehler beim Abrufen des Deploy-Status" },
      { status: 500 }
    )
  }
}
