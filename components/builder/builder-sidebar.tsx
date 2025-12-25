"use client"

import { useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Brain,
  Code2,
  Eye,
  Play,
  ChevronDown,
  PanelLeftClose,
  FolderOpen,
  Upload,
  Download,
  RotateCcw,
  Trash2,
  Key,
  EyeOff,
  EyeIcon,
  Shield,
  TestTube,
  FileText,
  Zap,
  Globe,
  Database,
  Network,
  RefreshCw,
  Container,
  Accessibility,
  Rocket,
} from "lucide-react"
import { marketplaceAgents } from "@/lib/marketplace-agents"
import { mcpServers, getMcpServerById } from "@/lib/mcp-servers"
import { Input } from "@/components/ui/input"
import { useAgentStore } from "@/lib/agent-store"
import { usePersistence } from "@/lib/use-persistence"
import type { AgentType } from "@/lib/types"
import { Checkbox } from "@/components/ui/checkbox"
import { KnowledgeBaseManager } from "./knowledge-base-manager"

interface BuilderSidebarProps {
  onClose: () => void
}

// Icon Map für alle Agenten (Core + Marketplace)
const iconMap: Record<string, typeof Brain> = {
  Brain,
  Code2,
  Eye,
  Shield,
  Play,
  TestTube,
  FileText,
  Zap,
  Globe,
  Database,
  Network,
  RefreshCw,
  Container,
  Accessibility,
}

// Funktion um Agent-Info aus Marketplace zu holen
const getAgentInfo = (agentId: string) => {
  const marketplaceAgent = marketplaceAgents.find(a => a.id === agentId)
  if (marketplaceAgent) {
    return {
      icon: iconMap[marketplaceAgent.icon] || Brain,
      color: marketplaceAgent.color,
      name: marketplaceAgent.name,
    }
  }
  // Fallback für unbekannte Agenten
  return {
    icon: Brain,
    color: "text-gray-500",
    name: agentId,
  }
}

export function BuilderSidebar({ onClose }: BuilderSidebarProps) {
  const [importValue, setImportValue] = useState("")
  const [showOpenAIKey, setShowOpenAIKey] = useState(false)
  const [showAnthropicKey, setShowAnthropicKey] = useState(false)
  const [showOpenRouterKey, setShowOpenRouterKey] = useState(false)
  const [showRenderKey, setShowRenderKey] = useState(false)

  const {
    globalConfig,
    agentConfigs,
    projects,
    currentProject,
    updateGlobalConfig,
    updateAgentConfig,
    resetAgentConfig,
    toggleAgentTool,
    loadProject,
    deleteProject,
    exportConfig,
    importConfig,
    installedAgents,
    workflowOrder,
    customAgentConfigs,
    updateCustomAgentConfig,
    installedMcpServers,
  } = useAgentStore()

  const { loadServerProject } = usePersistence()

  const handleExportConfig = () => {
    const config = exportConfig()
    const blob = new Blob([config], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "agentforge-config.json"
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportConfig = () => {
    if (importValue.trim()) {
      importConfig(importValue)
      setImportValue("")
    }
  }

  return (
    <div className="flex h-full w-80 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <Image src="/images/realcore-logo.png" alt="RealCore Logo" width={100} height={24} className="h-6 w-auto" />
          <span className="font-semibold">Konfiguration</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <PanelLeftClose className="h-5 w-5" />
        </Button>
      </div>

      <Tabs defaultValue="agents" className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b border-border px-2">
          <TabsList className="h-10 w-full justify-start bg-transparent">
            <TabsTrigger value="agents" className="text-xs">
              Agenten
            </TabsTrigger>
            <TabsTrigger value="global" className="text-xs">
              Global
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="text-xs">
              <Database className="h-3 w-3 mr-1" />
              Wissen
            </TabsTrigger>
            <TabsTrigger value="projects" className="text-xs">
              Projekte
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Agents Tab */}
        <TabsContent value="agents" className="mt-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full p-4">
            <div className="space-y-3">
              {workflowOrder.map((agentId) => {
                // Hole Agent-Info aus Marketplace
                const agentInfo = getAgentInfo(agentId)
                const Icon = agentInfo.icon
                const color = agentInfo.color
                
                // Prüfe ob Agent in agentConfigs existiert (Core Agents)
                const agentType = agentId as AgentType
                const config = agentConfigs[agentType]

                // Wenn kein Config existiert, zeige Custom Agent mit Einstellungen
                if (!config) {
                  // Hole Marketplace-Agent Info für Defaults
                  const marketplaceAgent = marketplaceAgents.find(a => a.id === agentId)
                  const customConfig = customAgentConfigs[agentId] || {
                    enabled: true,
                    model: marketplaceAgent?.defaultModel || "gpt-4o",
                    temperature: marketplaceAgent?.defaultTemperature || 0.7,
                    maxTokens: marketplaceAgent?.defaultMaxTokens || 4000,
                    systemPrompt: marketplaceAgent?.systemPrompt || "",
                  }
                  
                  return (
                    <Collapsible key={agentId}>
                      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border bg-secondary/50 p-3 text-sm font-medium hover:bg-secondary">
                        <div className="flex items-center gap-2">
                          <Icon className={`h-4 w-4 ${color}`} />
                          <span>{agentInfo.name}</span>
                          {!customConfig.enabled && (
                            <Badge variant="outline" className="text-xs">Aus</Badge>
                          )}
                          <Badge variant="outline" className="text-xs">Custom</Badge>
                        </div>
                        <ChevronDown className="h-4 w-4" />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-4 px-1 pt-4">
                        {/* Enable/Disable */}
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Aktiviert</Label>
                          <Switch
                            checked={customConfig.enabled}
                            onCheckedChange={(enabled) => updateCustomAgentConfig(agentId, { ...customConfig, enabled })}
                          />
                        </div>

                        {/* Model Selection */}
                        <div className="space-y-2">
                          <Label className="text-sm">Modell</Label>
                          <Select 
                            value={customConfig.model} 
                            onValueChange={(model) => updateCustomAgentConfig(agentId, { ...customConfig, model })}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">OpenAI</div>
                              <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                              <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                              <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                              <SelectItem value="gpt-4">GPT-4</SelectItem>
                              <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground mt-2">Anthropic</div>
                              <SelectItem value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</SelectItem>
                              <SelectItem value="claude-3-opus-20240229">Claude 3 Opus</SelectItem>
                              <SelectItem value="claude-3-haiku-20240307">Claude 3 Haiku</SelectItem>
                              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground mt-2">OpenRouter</div>
                              <SelectItem value="openrouter/auto">Auto (Best for prompt)</SelectItem>
                              <SelectItem value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet (OR)</SelectItem>
                              <SelectItem value="openai/gpt-4o">GPT-4o (OR)</SelectItem>
                              <SelectItem value="google/gemini-2.0-flash-001">Gemini 2.0 Flash (OR)</SelectItem>
                              <SelectItem value="meta-llama/llama-3.3-70b-instruct">Llama 3.3 70B (OR)</SelectItem>
                              <SelectItem value="deepseek/deepseek-chat">DeepSeek Chat (OR)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Temperature */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm">Temperatur</Label>
                            <span className="text-xs text-muted-foreground">{customConfig.temperature}</span>
                          </div>
                          <Slider
                            value={[customConfig.temperature]}
                            min={0}
                            max={1}
                            step={0.1}
                            onValueChange={([temperature]) => updateCustomAgentConfig(agentId, { ...customConfig, temperature })}
                          />
                        </div>

                        {/* Max Tokens */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm">Max Tokens</Label>
                            <span className="text-xs text-muted-foreground">{customConfig.maxTokens}</span>
                          </div>
                          <Slider
                            value={[customConfig.maxTokens]}
                            min={500}
                            max={16000}
                            step={500}
                            onValueChange={([maxTokens]) => updateCustomAgentConfig(agentId, { ...customConfig, maxTokens })}
                          />
                        </div>

                        {/* MCP Server Auswahl */}
                        {installedMcpServers.length > 0 && (
                          <div className="space-y-2">
                            <Label className="text-sm flex items-center gap-2">
                              <Network className="h-4 w-4" />
                              MCP Server
                            </Label>
                            <div className="space-y-2 max-h-32 overflow-y-auto">
                              {installedMcpServers.map(serverId => {
                                const server = getMcpServerById(serverId)
                                if (!server) return null
                                const isSelected = customConfig.mcpServers?.includes(serverId) || false
                                return (
                                  <div key={serverId} className="flex items-center gap-2">
                                    <Checkbox
                                      id={`mcp-${agentId}-${serverId}`}
                                      checked={isSelected}
                                      onCheckedChange={(checked: boolean) => {
                                        const currentServers = customConfig.mcpServers || []
                                        const newServers = checked
                                          ? [...currentServers, serverId]
                                          : currentServers.filter(s => s !== serverId)
                                        updateCustomAgentConfig(agentId, { ...customConfig, mcpServers: newServers })
                                      }}
                                    />
                                    <label
                                      htmlFor={`mcp-${agentId}-${serverId}`}
                                      className="text-xs cursor-pointer"
                                    >
                                      {server.name}
                                    </label>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* Description */}
                        {marketplaceAgent?.description && (
                          <p className="text-xs text-muted-foreground">{marketplaceAgent.description}</p>
                        )}
                      </CollapsibleContent>
                    </Collapsible>
                  )
                }

                return (
                  <Collapsible key={agentType}>
                    <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border bg-secondary/50 p-3 text-sm font-medium hover:bg-secondary">
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${color}`} />
                        {config.name}
                        {!config.enabled && (
                          <Badge variant="outline" className="text-xs">
                            Aus
                          </Badge>
                        )}
                      </div>
                      <ChevronDown className="h-4 w-4" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-4 px-1 pt-4">
                      {/* Enable/Disable */}
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Aktiviert</Label>
                        <Switch
                          checked={config.enabled}
                          onCheckedChange={(enabled) => updateAgentConfig(agentType, { enabled })}
                        />
                      </div>

                      {/* Model Selection */}
                      <div className="space-y-2">
                        <Label className="text-sm">Modell</Label>
                        <Select value={config.model} onValueChange={(model) => updateAgentConfig(agentType, { model })}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">OpenAI</div>
                            <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                            <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                            <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                            <SelectItem value="gpt-4">GPT-4</SelectItem>
                            <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                            <div className="px-2 py-1 text-xs font-semibold text-muted-foreground mt-2">Anthropic</div>
                            <SelectItem value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</SelectItem>
                            <SelectItem value="claude-3-opus-20240229">Claude 3 Opus</SelectItem>
                            <SelectItem value="claude-3-haiku-20240307">Claude 3 Haiku</SelectItem>
                            <div className="px-2 py-1 text-xs font-semibold text-muted-foreground mt-2">OpenRouter</div>
                            <SelectItem value="openrouter/auto">Auto (Best for prompt)</SelectItem>
                            <SelectItem value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet (OR)</SelectItem>
                            <SelectItem value="openai/gpt-4o">GPT-4o (OR)</SelectItem>
                            <SelectItem value="google/gemini-2.0-flash-001">Gemini 2.0 Flash (OR)</SelectItem>
                            <SelectItem value="meta-llama/llama-3.3-70b-instruct">Llama 3.3 70B (OR)</SelectItem>
                            <SelectItem value="deepseek/deepseek-chat">DeepSeek Chat (OR)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Temperature */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Temperature</Label>
                          <span className="text-xs text-muted-foreground">{config.temperature}</span>
                        </div>
                        <Slider
                          value={[config.temperature]}
                          onValueChange={([temperature]) => updateAgentConfig(agentType, { temperature })}
                          min={0}
                          max={1}
                          step={0.1}
                        />
                      </div>

                      {/* Max Tokens */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Max Tokens</Label>
                          <span className="text-xs text-muted-foreground">{config.maxTokens.toLocaleString()}</span>
                        </div>
                        <Slider
                          value={[config.maxTokens]}
                          onValueChange={([maxTokens]) => updateAgentConfig(agentType, { maxTokens })}
                          min={1000}
                          max={agentType === "coder" ? 64000 : 16000}
                          step={1000}
                        />
                        {agentType === "coder" && (
                          <p className="text-xs text-muted-foreground">
                            Für komplexe Apps: 16000-32000 empfohlen
                          </p>
                        )}
                      </div>

                      {/* System Prompt */}
                      <div className="space-y-2">
                        <Label className="text-sm">System Prompt</Label>
                        <Textarea
                          value={config.systemPrompt}
                          onChange={(e) => updateAgentConfig(agentType, { systemPrompt: e.target.value })}
                          className="min-h-[100px] resize-none text-xs"
                        />
                      </div>

                      {/* Tools */}
                      <div className="space-y-2">
                        <Label className="text-sm">Tools</Label>
                        <div className="space-y-1">
                          {config.tools.map((tool) => (
                            <div
                              key={tool.id}
                              className="flex items-center justify-between rounded-md bg-secondary/50 px-2 py-1"
                            >
                              <span className="text-xs">{tool.name}</span>
                              <Switch
                                checked={tool.enabled}
                                onCheckedChange={() => toggleAgentTool(agentType, tool.id)}
                                className="scale-75"
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* MCP Server Auswahl für Core-Agenten */}
                      {installedMcpServers.length > 0 && (
                        <div className="space-y-2">
                          <Label className="text-sm flex items-center gap-2">
                            <Network className="h-4 w-4" />
                            MCP Server
                          </Label>
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {installedMcpServers.map(serverId => {
                              const server = getMcpServerById(serverId)
                              if (!server) return null
                              const isSelected = config.mcpServers?.includes(serverId) || false
                              return (
                                <div key={serverId} className="flex items-center gap-2">
                                  <Checkbox
                                    id={`mcp-core-${agentType}-${serverId}`}
                                    checked={isSelected}
                                    onCheckedChange={(checked: boolean) => {
                                      const currentServers = config.mcpServers || []
                                      const newServers = checked
                                        ? [...currentServers, serverId]
                                        : currentServers.filter(s => s !== serverId)
                                      updateAgentConfig(agentType, { mcpServers: newServers })
                                    }}
                                  />
                                  <label
                                    htmlFor={`mcp-core-${agentType}-${serverId}`}
                                    className="text-xs cursor-pointer"
                                  >
                                    {server.name}
                                  </label>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Advanced Options */}
                      <div className="space-y-2 rounded-lg border border-border p-3">
                        <Label className="text-xs font-medium">Erweitert</Label>
                        <div className="flex items-center justify-between">
                          <span className="text-xs">Auto-Retry</span>
                          <Switch
                            checked={config.autoRetry}
                            onCheckedChange={(autoRetry) => updateAgentConfig(agentType, { autoRetry })}
                            className="scale-75"
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs">Streaming</span>
                          <Switch
                            checked={config.streaming}
                            onCheckedChange={(streaming) => updateAgentConfig(agentType, { streaming })}
                            className="scale-75"
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs">Detailed Logging</span>
                          <Switch
                            checked={config.detailedLogging}
                            onCheckedChange={(detailedLogging) => updateAgentConfig(agentType, { detailedLogging })}
                            className="scale-75"
                          />
                        </div>
                      </div>

                      {/* Reset Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full bg-transparent"
                        onClick={() => resetAgentConfig(agentType)}
                      >
                        <RotateCcw className="mr-2 h-3 w-3" />
                        Zurücksetzen
                      </Button>
                    </CollapsibleContent>
                  </Collapsible>
                )
              })}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Global Tab */}
        <TabsContent value="global" className="mt-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full p-4">
            <div className="space-y-4">
              {/* Target Environment Section */}
              <div className="rounded-lg border border-blue-500/50 bg-blue-500/5 p-3">
                <div className="mb-3 flex items-center gap-2">
                  <Container className="h-4 w-4 text-blue-500" />
                  <Label className="font-medium">Zielumgebung</Label>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  Wähle die Laufzeitumgebung für generierten Code
                </p>
                <Select
                  value={globalConfig.targetEnvironment || "sandpack"}
                  onValueChange={(value: "sandpack" | "webcontainer") => 
                    updateGlobalConfig({ targetEnvironment: value })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sandpack">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Sandpack</span>
                        <span className="text-xs text-muted-foreground">(Einfach, schnell)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="webcontainer">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">WebContainer</span>
                        <span className="text-xs text-muted-foreground">(Voll, Vite)</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <div className="mt-2 text-xs text-muted-foreground">
                  {globalConfig.targetEnvironment === "webcontainer" ? (
                    <span>✓ Mehrere Dateien, npm-Packages, Vite</span>
                  ) : (
                    <span>✓ Eine App.tsx, Inline-Styles, schnelle Vorschau</span>
                  )}
                </div>
              </div>

              {/* Deployment Target Section */}
              <div className="rounded-lg border border-purple-500/50 bg-purple-500/5 p-3">
                <div className="mb-3 flex items-center gap-2">
                  <Rocket className="h-4 w-4 text-purple-500" />
                  <Label className="font-medium">Deployment-Ziel</Label>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  Wähle die Zielplattform für das Deployment
                </p>
                <Select
                  value={(globalConfig as { deploymentTarget?: string }).deploymentTarget || "none"}
                  onValueChange={(value: string) => 
                    updateGlobalConfig({ deploymentTarget: value === "none" ? undefined : value } as Partial<typeof globalConfig>)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Kein Deployment</span>
                        <span className="text-xs text-muted-foreground">(Nur Vorschau)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="vercel">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Vercel</span>
                        <span className="text-xs text-muted-foreground">(Kostenlos)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="render">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Render</span>
                        <span className="text-xs text-muted-foreground">(Next.js, $7/mo)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="netlify">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Netlify</span>
                        <span className="text-xs text-muted-foreground">(Kostenlos)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="btp">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">SAP BTP</span>
                        <span className="text-xs text-muted-foreground">(Enterprise)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="github-only">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">GitHub</span>
                        <span className="text-xs text-muted-foreground">(Nur Repository)</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <div className="mt-2 text-xs text-muted-foreground">
                  {(globalConfig as { deploymentTarget?: string }).deploymentTarget === "render" && (
                    <span>🚀 Agenten generieren Next.js App Router Code</span>
                  )}
                  {(globalConfig as { deploymentTarget?: string }).deploymentTarget === "vercel" && (
                    <span>🔺 Agenten generieren Next.js Code für Vercel</span>
                  )}
                  {(globalConfig as { deploymentTarget?: string }).deploymentTarget === "netlify" && (
                    <span>🌐 Agenten generieren Next.js Code für Netlify</span>
                  )}
                  {(globalConfig as { deploymentTarget?: string }).deploymentTarget === "btp" && (
                    <span>🏢 Agenten generieren SAP Fiori/SAPUI5 Code</span>
                  )}
                  {(globalConfig as { deploymentTarget?: string }).deploymentTarget === "github-only" && (
                    <span>📦 Code wird nur zu GitHub gepusht</span>
                  )}
                  {!(globalConfig as { deploymentTarget?: string }).deploymentTarget && (
                    <span>💡 Wähle ein Deployment-Ziel für optimierten Code</span>
                  )}
                </div>
              </div>

              {/* API Keys Section */}
              <div className="rounded-lg border border-primary/50 bg-primary/5 p-3">
                <div className="mb-3 flex items-center gap-2">
                  <Key className="h-4 w-4 text-primary" />
                  <Label className="font-medium">API-Schlüssel</Label>
                </div>
                
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">OpenAI API Key</Label>
                    <div className="relative">
                      <Input
                        type={showOpenAIKey ? "text" : "password"}
                        value={globalConfig.openaiApiKey || ""}
                        onChange={(e) => updateGlobalConfig({ openaiApiKey: e.target.value })}
                        placeholder="sk-..."
                        className="pr-10 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showOpenAIKey ? <EyeOff className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Anthropic API Key</Label>
                    <div className="relative">
                      <Input
                        type={showAnthropicKey ? "text" : "password"}
                        value={globalConfig.anthropicApiKey || ""}
                        onChange={(e) => updateGlobalConfig({ anthropicApiKey: e.target.value })}
                        placeholder="sk-ant-..."
                        className="pr-10 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showAnthropicKey ? <EyeOff className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">OpenRouter API Key</Label>
                    <div className="relative">
                      <Input
                        type={showOpenRouterKey ? "text" : "password"}
                        value={globalConfig.openrouterApiKey || ""}
                        onChange={(e) => updateGlobalConfig({ openrouterApiKey: e.target.value })}
                        placeholder="sk-or-..."
                        className="pr-10 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowOpenRouterKey(!showOpenRouterKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showOpenRouterKey ? <EyeOff className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        API Key erstellen →
                      </a>
                    </p>
                  </div>
                  
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Vercel Token (kostenlos)</Label>
                    <div className="relative">
                      <Input
                        type="password"
                        value={globalConfig.vercelToken || ""}
                        onChange={(e) => updateGlobalConfig({ vercelToken: e.target.value })}
                        placeholder="..."
                        className="pr-10 text-xs"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <a href="https://vercel.com/account/tokens" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        Token erstellen →
                      </a>
                    </p>
                  </div>
                  
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Render.com API Key ($7/mo)</Label>
                    <div className="relative">
                      <Input
                        type={showRenderKey ? "text" : "password"}
                        value={globalConfig.renderApiKey || ""}
                        onChange={(e) => updateGlobalConfig({ renderApiKey: e.target.value })}
                        placeholder="rnd_..."
                        className="pr-10 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRenderKey(!showRenderKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showRenderKey ? <EyeOff className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <a href="https://dashboard.render.com/u/settings#api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        API Key erstellen →
                      </a>
                    </p>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">GitHub Token</Label>
                    <div className="relative">
                      <Input
                        type="password"
                        value={globalConfig.githubToken || ""}
                        onChange={(e) => updateGlobalConfig({ githubToken: e.target.value })}
                        placeholder="ghp_..."
                        className="pr-10 text-xs"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <a href="https://github.com/settings/tokens/new?scopes=repo" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        Token erstellen (repo scope) →
                      </a>
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Keys werden lokal im Browser gespeichert.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Standard-Modell</Label>
                <Select
                  value={globalConfig.defaultModel}
                  onValueChange={(defaultModel) => updateGlobalConfig({ defaultModel })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">OpenAI</div>
                    <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                    <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                    <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                    <SelectItem value="gpt-4">GPT-4</SelectItem>
                    <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                    <div className="px-2 py-1 text-xs font-semibold text-muted-foreground mt-2">Anthropic</div>
                    <SelectItem value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</SelectItem>
                    <SelectItem value="claude-3-opus-20240229">Claude 3 Opus</SelectItem>
                    <SelectItem value="claude-3-haiku-20240307">Claude 3 Haiku</SelectItem>
                    <div className="px-2 py-1 text-xs font-semibold text-muted-foreground mt-2">OpenRouter</div>
                    <SelectItem value="openrouter/auto">Auto (Best for prompt)</SelectItem>
                    <SelectItem value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet (OR)</SelectItem>
                    <SelectItem value="anthropic/claude-3-opus">Claude 3 Opus (OR)</SelectItem>
                    <SelectItem value="openai/gpt-4o">GPT-4o (OR)</SelectItem>
                    <SelectItem value="openai/gpt-4o-mini">GPT-4o Mini (OR)</SelectItem>
                    <SelectItem value="google/gemini-2.0-flash-001">Gemini 2.0 Flash (OR)</SelectItem>
                    <SelectItem value="google/gemini-2.5-pro-preview">Gemini 2.5 Pro (OR)</SelectItem>
                    <SelectItem value="meta-llama/llama-3.3-70b-instruct">Llama 3.3 70B (OR)</SelectItem>
                    <SelectItem value="mistralai/mistral-large-2411">Mistral Large (OR)</SelectItem>
                    <SelectItem value="deepseek/deepseek-chat">DeepSeek Chat (OR)</SelectItem>
                    <SelectItem value="qwen/qwen-2.5-72b-instruct">Qwen 2.5 72B (OR)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <Label>Auto-Review</Label>
                <Switch
                  checked={globalConfig.autoReview}
                  onCheckedChange={(autoReview) => updateGlobalConfig({ autoReview })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>Streaming</Label>
                <Switch
                  checked={globalConfig.streaming}
                  onCheckedChange={(streaming) => updateGlobalConfig({ streaming })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>Historie speichern</Label>
                <Switch
                  checked={globalConfig.saveHistory}
                  onCheckedChange={(saveHistory) => updateGlobalConfig({ saveHistory })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label title="Fügt Best Practices für Next.js/React zum Coder-Prompt hinzu. Kann Token-Limit überschreiten bei komplexen Apps.">
                  Best Practices RAG
                </Label>
                <Switch
                  checked={globalConfig.enableBestPracticesRAG ?? false}
                  onCheckedChange={(enableBestPracticesRAG) => updateGlobalConfig({ enableBestPracticesRAG })}
                />
              </div>

              <div className="space-y-2">
                <Label>Sprache</Label>
                <Select
                  value={globalConfig.language}
                  onValueChange={(language: "de" | "en") => updateGlobalConfig({ language })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="de">Deutsch</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="border-t border-border pt-4">
                <h4 className="mb-3 text-sm font-medium">Konfiguration</h4>
                <div className="space-y-2">
                  <Button variant="outline" size="sm" className="w-full bg-transparent" onClick={handleExportConfig}>
                    <Download className="mr-2 h-4 w-4" />
                    Konfiguration exportieren
                  </Button>
                  <Textarea
                    placeholder="JSON-Konfiguration einfügen..."
                    value={importValue}
                    onChange={(e) => setImportValue(e.target.value)}
                    className="min-h-[80px] resize-none text-xs"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full bg-transparent"
                    onClick={handleImportConfig}
                    disabled={!importValue.trim()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Konfiguration importieren
                  </Button>
                </div>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Knowledge Base Tab */}
        <TabsContent value="knowledge" className="mt-0 flex-1 overflow-hidden p-4">
          <KnowledgeBaseManager />
        </TabsContent>

        {/* Projects Tab */}
        <TabsContent value="projects" className="mt-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full p-4">
            <div className="space-y-2">
              {projects.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Noch keine Projekte erstellt.</div>
              ) : (
                projects.map((project) => (
                  <div
                    key={project.id}
                    className={`flex items-center justify-between rounded-lg border p-3 ${
                      currentProject?.id === project.id
                        ? "border-primary bg-primary/5"
                        : "border-border bg-secondary/50"
                    }`}
                  >
                    <button
                      className="flex flex-1 flex-col items-start gap-1 text-left"
                      onClick={() => loadServerProject(project.id)}
                    >
                      <div className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4" />
                        <span className="text-sm font-medium">{project.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {project.files.length} Dateien | Aktualisiert:{" "}
                        {new Date(project.updatedAt).toLocaleDateString("de-DE")}
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      onClick={() => deleteProject(project.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  )
}
