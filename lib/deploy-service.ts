// Deploy Service für Render.com Integration

interface DeployOptions {
  projectName: string
  files: { path: string; content: string }[]
  renderApiKey: string
}

interface DeployResult {
  success: boolean
  serviceId?: string
  serviceName?: string
  url?: string
  deployId?: string
  message?: string
  error?: string
  isNewService?: boolean
  dashboardUrl?: string
  manualSetup?: boolean
  instructions?: string[]
}

interface DeployStatus {
  status: string
  deployId?: string
  createdAt?: string
  finishedAt?: string
}

export async function deployToRender(options: DeployOptions): Promise<DeployResult> {
  const response = await fetch("/api/deploy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(options),
  })

  const data = await response.json()

  if (!response.ok) {
    return {
      success: false,
      error: data.error || `Deploy fehlgeschlagen: ${response.status}`,
    }
  }

  return data
}

export async function getDeployStatus(
  serviceId: string,
  renderApiKey: string,
  deployId?: string
): Promise<DeployStatus> {
  const params = new URLSearchParams({
    serviceId,
    apiKey: renderApiKey,
  })

  if (deployId) {
    params.append("deployId", deployId)
  }

  const response = await fetch(`/api/deploy?${params.toString()}`)
  
  if (!response.ok) {
    throw new Error(`Fehler beim Abrufen des Status: ${response.status}`)
  }

  return response.json()
}

export async function generatePreview(
  files: { path: string; content: string; language: string }[]
): Promise<{ success: boolean; html?: string; error?: string }> {
  const response = await fetch("/api/preview", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ files }),
  })

  const data = await response.json()

  if (!response.ok) {
    return {
      success: false,
      error: data.error || "Preview-Generierung fehlgeschlagen",
    }
  }

  return data
}

// Hilfsfunktion: Öffnet Preview in neuem Fenster
export function openPreviewWindow(html: string): Window | null {
  const previewWindow = window.open("", "_blank", "width=1200,height=800")
  
  if (previewWindow) {
    previewWindow.document.write(html)
    previewWindow.document.close()
  }
  
  return previewWindow
}

// Hilfsfunktion: Generiert Sandpack-kompatible Dateien
export function prepareFilesForSandpack(
  files: { path: string; content: string }[]
): Record<string, string> {
  const sandpackFiles: Record<string, string> = {}
  
  for (const file of files) {
    // Normalisiere Pfad für Sandpack (muss mit / beginnen)
    const normalizedPath = file.path.startsWith("/") ? file.path : `/${file.path}`
    sandpackFiles[normalizedPath] = file.content
  }
  
  return sandpackFiles
}
