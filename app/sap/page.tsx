"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Building2 } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { SAPAgentsPanel } from "@/components/sap/sap-agents-panel"
import { toast } from "sonner"

export default function SAPPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    router.push("/builder/login")
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4 max-w-6xl mx-auto">
          <div className="flex items-center gap-4">
            <Link href="/builder">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Zurück zum Builder
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-500" />
              <h1 className="text-lg font-semibold">SAP Integration</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/mcp">
              <Button variant="outline" size="sm">
                MCP Server
              </Button>
            </Link>
            <Link href="/admin">
              <Button variant="outline" size="sm">
                Admin Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* SAP Agents Panel */}
          <div className="lg:col-span-2">
            <SAPAgentsPanel 
              onSelectAgent={(agent) => toast.info(`Agent "${agent.name}" ausgewählt`)}
              onSelectServer={(server) => toast.info(`Server "${server.name}" ausgewählt`)}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
