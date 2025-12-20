"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
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
  Building2,
  Server,
  Settings,
  Play,
  CheckCircle2,
  XCircle,
  Download,
  Copy,
  ExternalLink,
  Loader2,
  Wrench,
  Code2,
  Smartphone,
  Layout,
  Check,
} from "lucide-react"
import { toast } from "sonner"
import {
  OFFICIAL_SAP_MCP_SERVERS,
  SAP_AGENTS,
  SAPMCPConfigManager,
  SAPAgentManager,
  type SAPMCPServerType,
  type SAPAgentType,
  type OfficialSAPMCPServer,
  type SAPAgentConfig,
} from "@/lib/sap-agents"

const configManager = new SAPMCPConfigManager()
const agentManager = new SAPAgentManager()

// Icon-Mapping für SAP Server
const SERVER_ICONS: Record<SAPMCPServerType, typeof Code2> = {
  cap: Code2,
  ui5: Layout,
  mdk: Smartphone,
  fiori: Building2,
}

// Icon-Mapping für SAP Agenten
const AGENT_ICONS: Record<string, string> = {
  "sap-cap-developer": "🏗️",
  "sap-ui5-developer": "🎨",
  "sap-fiori-developer": "📱",
  "sap-mdk-developer": "📲",
}

interface SAPAgentsPanelProps {
  onSelectAgent?: (agent: SAPAgentConfig) => void
  onSelectServer?: (server: OfficialSAPMCPServer) => void
}

export function SAPAgentsPanel({ onSelectAgent, onSelectServer }: SAPAgentsPanelProps) {
  const [selectedTab, setSelectedTab] = useState<"agents" | "servers" | "config">("agents")
  const [selectedAgent, setSelectedAgent] = useState<SAPAgentType | null>(null)
  const [selectedServer, setSelectedServer] = useState<SAPMCPServerType | null>(null)
  const [showConfigDialog, setShowConfigDialog] = useState(false)
  const [configFormat, setConfigFormat] = useState<"vscode" | "claude">("vscode")
  const [serverStatus, setServerStatus] = useState<Record<SAPMCPServerType, "unknown" | "checking" | "installed" | "not-installed">>({
    cap: "unknown",
    ui5: "unknown",
    mdk: "unknown",
    fiori: "unknown",
  })
  const [enabledServers, setEnabledServers] = useState<SAPMCPServerType[]>([])

  // Server-Status prüfen
  const checkServerStatus = async (serverId: SAPMCPServerType) => {
    setServerStatus(prev => ({ ...prev, [serverId]: "checking" }))
    const result = await configManager.checkServerInstalled(serverId)
    setServerStatus(prev => ({ ...prev, [serverId]: result.installed ? "installed" : "not-installed" }))
  }

  // Konfiguration generieren
  const generateConfig = () => {
    if (configFormat === "vscode") {
      return JSON.stringify(configManager.generateVSCodeConfig(enabledServers), null, 2)
    } else {
      return JSON.stringify(configManager.generateClaudeDesktopConfig(enabledServers), null, 2)
    }
  }

  // In Zwischenablage kopieren
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  // Server aktivieren/deaktivieren
  const toggleServer = (serverId: SAPMCPServerType) => {
    setEnabledServers(prev => 
      prev.includes(serverId) 
        ? prev.filter(s => s !== serverId)
        : [...prev, serverId]
    )
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-500" />
            <CardTitle className="text-lg">SAP MCP Integration</CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowConfigDialog(true)}>
            <Settings className="h-4 w-4 mr-1" />
            Config
          </Button>
        </div>
        <CardDescription>Offizielle SAP MCP Server und Agenten</CardDescription>
      </CardHeader>
      
      <CardContent className="p-0">
        <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as typeof selectedTab)}>
          <TabsList className="w-full justify-start px-4 h-9">
            <TabsTrigger value="agents" className="text-xs">Agenten</TabsTrigger>
            <TabsTrigger value="servers" className="text-xs">MCP Server</TabsTrigger>
            <TabsTrigger value="config" className="text-xs">Konfiguration</TabsTrigger>
          </TabsList>
          
          {/* Agenten Tab */}
          <TabsContent value="agents" className="mt-0">
            <ScrollArea className="h-[400px]">
              <div className="p-4 space-y-3">
                {SAP_AGENTS.map(agent => (
                  <Card 
                    key={agent.id}
                    className={`cursor-pointer transition-all hover:border-blue-500/50 ${
                      selectedAgent === agent.id ? "border-blue-500 bg-blue-500/5" : ""
                    }`}
                    onClick={() => {
                      setSelectedAgent(agent.id)
                      onSelectAgent?.(agent)
                    }}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{AGENT_ICONS[agent.id]}</span>
                          <div>
                            <h4 className="font-medium text-sm">{agent.name}</h4>
                            <p className="text-xs text-muted-foreground">{agent.description}</p>
                          </div>
                        </div>
                        {selectedAgent === agent.id && (
                          <CheckCircle2 className="h-4 w-4 text-blue-500" />
                        )}
                      </div>
                      
                      <div className="mt-2 flex flex-wrap gap-1">
                        {agent.capabilities.slice(0, 3).map(cap => (
                          <Badge key={cap} variant="secondary" className="text-xs">
                            {cap}
                          </Badge>
                        ))}
                        {agent.capabilities.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{agent.capabilities.length - 3}
                          </Badge>
                        )}
                      </div>
                      
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">MCP Server:</span>
                        {agent.mcpServers.map(serverId => (
                          <Badge key={serverId} variant="outline" className="text-xs">
                            {serverId}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
          
          {/* Server Tab */}
          <TabsContent value="servers" className="mt-0">
            <ScrollArea className="h-[400px]">
              <div className="p-4 space-y-3">
                {OFFICIAL_SAP_MCP_SERVERS.map(server => {
                  const Icon = SERVER_ICONS[server.id]
                  const status = serverStatus[server.id]
                  
                  return (
                    <Card 
                      key={server.id}
                      className={`transition-all ${
                        selectedServer === server.id ? "border-blue-500 bg-blue-500/5" : ""
                      }`}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className="p-2 rounded-lg bg-blue-500/10">
                              <Icon className="h-4 w-4 text-blue-500" />
                            </div>
                            <div>
                              <h4 className="font-medium text-sm">{server.name}</h4>
                              <p className="text-xs text-muted-foreground font-mono">
                                {server.packageName}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {status === "checking" && (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            )}
                            {status === "installed" && (
                              <Badge variant="default" className="text-xs bg-green-500">
                                Installiert
                              </Badge>
                            )}
                            {status === "not-installed" && (
                              <Badge variant="secondary" className="text-xs">
                                Nicht installiert
                              </Badge>
                            )}
                            <Switch
                              checked={enabledServers.includes(server.id)}
                              onCheckedChange={() => toggleServer(server.id)}
                            />
                          </div>
                        </div>
                        
                        <p className="mt-2 text-xs text-muted-foreground">
                          {server.description}
                        </p>
                        
                        <div className="mt-2 flex flex-wrap gap-1">
                          {server.tools.slice(0, 4).map(tool => (
                            <Badge key={tool.name} variant="outline" className="text-xs">
                              <Wrench className="h-3 w-3 mr-1" />
                              {tool.name}
                            </Badge>
                          ))}
                          {server.tools.length > 4 && (
                            <Badge variant="outline" className="text-xs">
                              +{server.tools.length - 4} Tools
                            </Badge>
                          )}
                        </div>
                        
                        <div className="mt-3 flex items-center gap-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="text-xs h-7"
                            onClick={() => checkServerStatus(server.id)}
                          >
                            <Play className="h-3 w-3 mr-1" />
                            Status prüfen
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-xs h-7"
                            onClick={() => window.open(server.repository, "_blank")}
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            Repository
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </ScrollArea>
          </TabsContent>
          
          {/* Config Tab */}
          <TabsContent value="config" className="mt-0">
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <Label>Konfigurationsformat</Label>
                <Select value={configFormat} onValueChange={(v) => setConfigFormat(v as typeof configFormat)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vscode">VS Code (settings.json)</SelectItem>
                    <SelectItem value="claude">Claude Desktop (config.json)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Aktivierte Server ({enabledServers.length})</Label>
                <div className="flex flex-wrap gap-2">
                  {enabledServers.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Keine Server aktiviert. Aktivieren Sie Server im "MCP Server" Tab.
                    </p>
                  ) : (
                    enabledServers.map(serverId => (
                      <Badge key={serverId} variant="default">
                        {serverId}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
              
              {enabledServers.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Generierte Konfiguration</Label>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => copyToClipboard(generateConfig())}
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      Kopieren
                    </Button>
                  </div>
                  <pre className="p-3 bg-muted rounded-lg text-xs overflow-auto max-h-[200px]">
                    {generateConfig()}
                  </pre>
                </div>
              )}
              
              <div className="pt-4 border-t">
                <h4 className="font-medium text-sm mb-2">Installationsanleitungen</h4>
                <div className="space-y-2">
                  {OFFICIAL_SAP_MCP_SERVERS.map(server => (
                    <Button
                      key={server.id}
                      variant="outline"
                      size="sm"
                      className="w-full justify-start text-xs"
                      onClick={() => {
                        const instructions = configManager.getInstallInstructions(server.id)
                        if (instructions) {
                          navigator.clipboard.writeText(instructions)
                          toast.success(`${server.name} Installationsanleitung kopiert!`, {
                            description: "Die Anleitung wurde in die Zwischenablage kopiert.",
                          })
                        } else {
                          toast.error("Anleitung nicht gefunden")
                        }
                      }}
                    >
                      <Download className="h-3 w-3 mr-2" />
                      {server.name} Anleitung kopieren
                    </Button>
                  ))}
                </div>
                
                {/* Installation Preview */}
                <div className="mt-4 p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground mb-2">Schnellinstallation (alle SAP MCP Server):</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-background p-2 rounded font-mono overflow-x-auto">
                      npm install -g @cap-js/mcp-server @ui5/mcp-server @sap/mdk-mcp-server @sap-ux/fiori-mcp-server
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText("npm install -g @cap-js/mcp-server @ui5/mcp-server @sap/mdk-mcp-server @sap-ux/fiori-mcp-server")
                        toast.success("Installationsbefehl kopiert!")
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
      
      {/* Config Dialog */}
      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>SAP MCP Konfiguration</DialogTitle>
            <DialogDescription>
              Konfigurieren Sie die SAP MCP Server für Ihre Entwicklungsumgebung
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {OFFICIAL_SAP_MCP_SERVERS.map(server => (
                <Card key={server.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4 text-blue-500" />
                      <span className="text-sm font-medium">{server.name}</span>
                    </div>
                    <Switch
                      checked={enabledServers.includes(server.id)}
                      onCheckedChange={() => toggleServer(server.id)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {server.tools.length} Tools verfügbar
                  </p>
                </Card>
              ))}
            </div>
            
            <div className="space-y-2">
              <Label>Installationsbefehl</Label>
              <div className="flex gap-2">
                <Input 
                  readOnly 
                  value={enabledServers.map(s => 
                    OFFICIAL_SAP_MCP_SERVERS.find(srv => srv.id === s)?.installCommand
                  ).filter(Boolean).join(" && ")}
                  className="font-mono text-xs"
                />
                <Button 
                  variant="outline"
                  onClick={() => copyToClipboard(
                    enabledServers.map(s => 
                      OFFICIAL_SAP_MCP_SERVERS.find(srv => srv.id === s)?.installCommand
                    ).filter(Boolean).join(" && ")
                  )}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfigDialog(false)}>
              Schließen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

export default SAPAgentsPanel
