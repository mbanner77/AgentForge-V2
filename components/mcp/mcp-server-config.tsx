"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Server,
  Settings,
  Play,
  Square,
  CheckCircle2,
  XCircle,
  Copy,
  ExternalLink,
  Loader2,
  Wrench,
  Download,
  RefreshCw,
  Trash2,
  Plus,
  Eye,
  EyeOff,
} from "lucide-react"
import {
  mcpServers,
  mcpCategories,
  type MCPServer,
  type MCPConfigField,
} from "@/lib/mcp-servers"
import {
  MCPConfigGenerator,
  getInstalledServerManager,
  type MCPServerStatus,
} from "@/lib/mcp-client"

interface MCPServerConfigProps {
  onServerInstalled?: (serverId: string) => void
  onServerUninstalled?: (serverId: string) => void
}

export function MCPServerConfig({ onServerInstalled, onServerUninstalled }: MCPServerConfigProps) {
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedServer, setSelectedServer] = useState<MCPServer | null>(null)
  const [showConfigDialog, setShowConfigDialog] = useState(false)
  const [serverConfig, setServerConfig] = useState<Record<string, string | number | boolean>>({})
  const [serverStatuses, setServerStatuses] = useState<Record<string, MCPServerStatus>>({})
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({})
  const [configFormat, setConfigFormat] = useState<"vscode" | "claude">("vscode")
  const [copied, setCopied] = useState(false)

  const serverManager = getInstalledServerManager()
  const installedServers = serverManager.getInstalledServers()

  // Filter servers
  const filteredServers = mcpServers.filter(server => {
    const matchesSearch = server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      server.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = selectedCategory === "all" || server.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  // Check if server is installed
  const isInstalled = (serverId: string) => {
    return installedServers.some(s => s.id === serverId)
  }

  // Open config dialog
  const openConfigDialog = (server: MCPServer) => {
    setSelectedServer(server)
    const installed = serverManager.getServer(server.id)
    if (installed) {
      setServerConfig(installed.config)
    } else {
      // Set defaults
      const defaults: Record<string, string | number | boolean> = {}
      server.configSchema?.forEach(field => {
        if (field.default !== undefined) {
          defaults[field.name] = field.default
        }
      })
      setServerConfig(defaults)
    }
    setShowConfigDialog(true)
  }

  // Install server
  const installServer = () => {
    if (!selectedServer) return

    const success = serverManager.installServer(selectedServer.id, serverConfig)
    if (success) {
      onServerInstalled?.(selectedServer.id)
      setShowConfigDialog(false)
    }
  }

  // Uninstall server
  const uninstallServer = (serverId: string) => {
    const success = serverManager.uninstallServer(serverId)
    if (success) {
      onServerUninstalled?.(serverId)
    }
  }

  // Activate server
  const activateServer = async (serverId: string) => {
    setServerStatuses(prev => ({
      ...prev,
      [serverId]: { ...prev[serverId], status: "connecting" } as MCPServerStatus,
    }))

    const status = await serverManager.activateServer(serverId)
    setServerStatuses(prev => ({ ...prev, [serverId]: status }))
  }

  // Deactivate server
  const deactivateServer = async (serverId: string) => {
    await serverManager.deactivateServer(serverId)
    setServerStatuses(prev => ({
      ...prev,
      [serverId]: { ...prev[serverId], status: "disconnected" } as MCPServerStatus,
    }))
  }

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Generate config
  const generateConfig = () => {
    const installedIds = installedServers.map(s => s.id)
    const configs = new Map(installedServers.map(s => [s.id, s.config]))

    if (configFormat === "vscode") {
      return JSON.stringify(MCPConfigGenerator.generateVSCodeConfig(installedIds, configs), null, 2)
    } else {
      return JSON.stringify(MCPConfigGenerator.generateClaudeDesktopConfig(installedIds, configs), null, 2)
    }
  }

  // Render config field
  const renderConfigField = (field: MCPConfigField) => {
    const value = serverConfig[field.name]
    const isPassword = field.type === "password"
    const showPassword = showPasswords[field.name]

    return (
      <div key={field.name} className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={field.name}>
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </Label>
          {isPassword && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPasswords(prev => ({ ...prev, [field.name]: !prev[field.name] }))}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          )}
        </div>

        {field.type === "select" && field.options ? (
          <Select
            value={String(value || "")}
            onValueChange={(v) => setServerConfig(prev => ({ ...prev, [field.name]: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder={`${field.label} wählen`} />
            </SelectTrigger>
            <SelectContent>
              {field.options.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : field.type === "boolean" ? (
          <Switch
            checked={Boolean(value)}
            onCheckedChange={(checked) => setServerConfig(prev => ({ ...prev, [field.name]: checked }))}
          />
        ) : (
          <Input
            id={field.name}
            type={isPassword && !showPassword ? "password" : field.type === "number" ? "number" : "text"}
            value={String(value || "")}
            onChange={(e) => setServerConfig(prev => ({
              ...prev,
              [field.name]: field.type === "number" ? Number(e.target.value) : e.target.value,
            }))}
            placeholder={field.description}
          />
        )}
        <p className="text-xs text-muted-foreground">{field.description}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Server className="h-5 w-5" />
            MCP Server Konfiguration
          </h2>
          <p className="text-sm text-muted-foreground">
            Model Context Protocol Server verwalten
          </p>
        </div>
        <Badge variant="outline">
          {installedServers.length} installiert
        </Badge>
      </div>

      <Tabs defaultValue="available">
        <TabsList>
          <TabsTrigger value="available">Verfügbar ({mcpServers.length})</TabsTrigger>
          <TabsTrigger value="installed">Installiert ({installedServers.length})</TabsTrigger>
          <TabsTrigger value="config">Konfiguration</TabsTrigger>
        </TabsList>

        {/* Available Servers */}
        <TabsContent value="available" className="space-y-4">
          {/* Search & Filter */}
          <div className="flex gap-2">
            <Input
              placeholder="Server suchen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-xs"
            />
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {mcpCategories.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Server List */}
          <ScrollArea className="h-[400px]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredServers.map(server => (
                <Card key={server.id} className="hover:border-primary/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{server.name}</h3>
                          {server.isOfficial && (
                            <Badge variant="secondary" className="text-xs">Offiziell</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {server.description}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">{server.category}</Badge>
                          <span className="text-xs text-muted-foreground">v{server.version}</span>
                          <span className="text-xs text-muted-foreground">⭐ {server.stars}</span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={isInstalled(server.id) ? "secondary" : "default"}
                        onClick={() => openConfigDialog(server)}
                      >
                        {isInstalled(server.id) ? (
                          <>
                            <Settings className="h-4 w-4 mr-1" />
                            Config
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4 mr-1" />
                            Install
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Installed Servers */}
        <TabsContent value="installed" className="space-y-4">
          {installedServers.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                Keine MCP Server installiert. Wählen Sie Server aus dem "Verfügbar" Tab.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {installedServers.map(server => {
                const status = serverStatuses[server.id]
                return (
                  <Card key={server.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div>
                            <h3 className="font-medium">{server.name}</h3>
                            <p className="text-xs text-muted-foreground">
                              {server.capabilities.length} Tools verfügbar
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Status Badge */}
                          {status?.status === "connecting" && (
                            <Badge variant="secondary">
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              Verbinde...
                            </Badge>
                          )}
                          {status?.status === "connected" && (
                            <Badge variant="default" className="bg-green-500">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Aktiv
                            </Badge>
                          )}
                          {status?.status === "error" && (
                            <Badge variant="destructive">
                              <XCircle className="h-3 w-3 mr-1" />
                              Fehler
                            </Badge>
                          )}
                          {(!status || status.status === "disconnected") && (
                            <Badge variant="outline">Inaktiv</Badge>
                          )}

                          {/* Actions */}
                          {status?.status === "connected" ? (
                            <Button size="sm" variant="outline" onClick={() => deactivateServer(server.id)}>
                              <Square className="h-4 w-4 mr-1" />
                              Stop
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => activateServer(server.id)}>
                              <Play className="h-4 w-4 mr-1" />
                              Start
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => openConfigDialog(server)}>
                            <Settings className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => uninstallServer(server.id)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>

                      {/* Tools */}
                      <div className="mt-3 flex flex-wrap gap-1">
                        {server.capabilities.slice(0, 6).map(cap => (
                          <Badge key={cap} variant="outline" className="text-xs">
                            <Wrench className="h-3 w-3 mr-1" />
                            {cap}
                          </Badge>
                        ))}
                        {server.capabilities.length > 6 && (
                          <Badge variant="outline" className="text-xs">
                            +{server.capabilities.length - 6}
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* Config Export */}
        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Konfiguration exportieren</CardTitle>
              <CardDescription>
                Exportieren Sie die MCP-Konfiguration für Ihre IDE
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button
                  variant={configFormat === "vscode" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setConfigFormat("vscode")}
                >
                  VS Code
                </Button>
                <Button
                  variant={configFormat === "claude" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setConfigFormat("claude")}
                >
                  Claude Desktop
                </Button>
              </div>

              {installedServers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Installieren Sie mindestens einen Server, um eine Konfiguration zu generieren.
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>
                      {configFormat === "vscode" ? "settings.json" : "config.json"}
                    </Label>
                    <Button size="sm" variant="outline" onClick={() => copyToClipboard(generateConfig())}>
                      {copied ? <CheckCircle2 className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                      {copied ? "Kopiert!" : "Kopieren"}
                    </Button>
                  </div>
                  <pre className="p-3 bg-muted rounded-lg text-xs overflow-auto max-h-[300px]">
                    {generateConfig()}
                  </pre>
                </div>
              )}

              {/* Install Command */}
              {installedServers.length > 0 && (
                <div className="space-y-2 pt-4 border-t">
                  <Label>Installationsbefehl</Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={MCPConfigGenerator.generateInstallCommand(installedServers.map(s => s.id))}
                      className="font-mono text-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(
                        MCPConfigGenerator.generateInstallCommand(installedServers.map(s => s.id))
                      )}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Config Dialog */}
      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedServer?.name} konfigurieren</DialogTitle>
            <DialogDescription>
              {selectedServer?.description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedServer?.configSchema && selectedServer.configSchema.length > 0 ? (
              selectedServer.configSchema.map(renderConfigField)
            ) : (
              <p className="text-sm text-muted-foreground">
                Dieser Server benötigt keine Konfiguration.
              </p>
            )}

            {/* Capabilities */}
            <div className="space-y-2 pt-4 border-t">
              <Label>Verfügbare Tools</Label>
              <div className="flex flex-wrap gap-1">
                {selectedServer?.capabilities.map(cap => (
                  <Badge key={cap} variant="secondary" className="text-xs">
                    {cap}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Links */}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" asChild>
                <a href={selectedServer?.repository} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Repository
                </a>
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfigDialog(false)}>
              Abbrechen
            </Button>
            <Button onClick={installServer}>
              {isInstalled(selectedServer?.id || "") ? "Speichern" : "Installieren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default MCPServerConfig
