"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Server } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { MCPServerConfig } from "@/components/mcp/mcp-server-config"
import { toast } from "sonner"

export default function MCPPage() {
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
              <Server className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">MCP Server Konfiguration</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/sap">
              <Button variant="outline" size="sm">
                SAP Integration
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
        <MCPServerConfig 
          onServerInstalled={(id) => toast.success(`MCP Server "${id}" installiert`)}
          onServerUninstalled={(id) => toast.success(`MCP Server "${id}" deinstalliert`)}
        />
      </main>
    </div>
  )
}
