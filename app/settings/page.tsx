"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import { 
  ArrowLeft, 
  Key, 
  Globe, 
  Palette, 
  Bot, 
  Database,
  Shield,
  Save,
  RotateCcw,
  EyeOff,
  Eye,
  ExternalLink,
  CheckCircle2,
  Server,
  Play,
  TestTube,
} from "lucide-react"
import { useAgentStore } from "@/lib/agent-store"
import { useAuth } from "@/lib/auth"
import { toast } from "sonner"
import { getMCPMode, setMCPMode, type MCPMode } from "@/lib/mcp-config"

export default function SettingsPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuth()
  const { globalConfig, updateGlobalConfig, agentConfigs, updateAgentConfig, resetAgentConfig } = useAgentStore()
  
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [hasChanges, setHasChanges] = useState(false)
  const [mcpMode, setMcpModeState] = useState<MCPMode>(getMCPMode())

  const handleMCPModeChange = (mode: MCPMode) => {
    setMcpModeState(mode)
    setMCPMode(mode)
    setHasChanges(true)
    toast.success(`MCP Modus auf "${mode === "production" ? "Production" : "Demo"}" gesetzt`)
  }

  const toggleKeyVisibility = (key: string) => {
    setShowKeys(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSave = () => {
    toast.success("Einstellungen gespeichert")
    setHasChanges(false)
  }

  const handleReset = () => {
    // Reset to defaults
    updateGlobalConfig({
      defaultModel: "gpt-4o",
      autoReview: true,
      streaming: true,
      theme: "dark",
      language: "de",
      targetEnvironment: "sandpack",
    })
    toast.success("Einstellungen zurückgesetzt")
    setHasChanges(false)
  }

  if (!isAuthenticated) {
    router.push("/builder/login")
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4 max-w-5xl mx-auto">
          <div className="flex items-center gap-4">
            <Link href="/builder">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Zurück
              </Button>
            </Link>
            <h1 className="text-lg font-semibold">Einstellungen</h1>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <Badge variant="outline" className="text-yellow-500 border-yellow-500">
                Ungespeicherte Änderungen
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Zurücksetzen
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!hasChanges}>
              <Save className="h-4 w-4 mr-2" />
              Speichern
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto p-6">
        <Tabs defaultValue="general" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="general" className="gap-2">
              <Globe className="h-4 w-4" />
              Allgemein
            </TabsTrigger>
            <TabsTrigger value="api-keys" className="gap-2">
              <Key className="h-4 w-4" />
              API Keys
            </TabsTrigger>
            <TabsTrigger value="agents" className="gap-2">
              <Bot className="h-4 w-4" />
              Agenten
            </TabsTrigger>
            <TabsTrigger value="appearance" className="gap-2">
              <Palette className="h-4 w-4" />
              Darstellung
            </TabsTrigger>
            <TabsTrigger value="advanced" className="gap-2">
              <Shield className="h-4 w-4" />
              Erweitert
            </TabsTrigger>
          </TabsList>

          {/* General Settings */}
          <TabsContent value="general" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Allgemeine Einstellungen</CardTitle>
                <CardDescription>Grundlegende Konfiguration für AgentForge</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Standard-Modell</Label>
                  <Select 
                    value={globalConfig.defaultModel} 
                    onValueChange={(v) => { updateGlobalConfig({ defaultModel: v }); setHasChanges(true) }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                      <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                      <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                      <SelectItem value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</SelectItem>
                      <SelectItem value="claude-3-opus-20240229">Claude 3 Opus</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Zielumgebung</Label>
                  <Select 
                    value={globalConfig.targetEnvironment} 
                    onValueChange={(v: "sandpack" | "webcontainer") => { updateGlobalConfig({ targetEnvironment: v }); setHasChanges(true) }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sandpack">Sandpack (Einfach, schnell)</SelectItem>
                      <SelectItem value="webcontainer">WebContainer (Voll, Vite)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {globalConfig.targetEnvironment === "webcontainer" 
                      ? "Vollständige Node.js-Umgebung mit Vite und npm"
                      : "Schnelle Vorschau mit einer App.tsx-Datei"}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Sprache</Label>
                  <Select 
                    value={globalConfig.language} 
                    onValueChange={(v: "de" | "en") => { updateGlobalConfig({ language: v }); setHasChanges(true) }}
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

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Auto-Review</Label>
                    <p className="text-xs text-muted-foreground">Reviewer-Agent automatisch nach Coder ausführen</p>
                  </div>
                  <Switch 
                    checked={globalConfig.autoReview} 
                    onCheckedChange={(v) => { updateGlobalConfig({ autoReview: v }); setHasChanges(true) }} 
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Streaming</Label>
                    <p className="text-xs text-muted-foreground">Echtzeit-Token-Ausgabe aktivieren</p>
                  </div>
                  <Switch 
                    checked={globalConfig.streaming} 
                    onCheckedChange={(v) => { updateGlobalConfig({ streaming: v }); setHasChanges(true) }} 
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Historie speichern</Label>
                    <p className="text-xs text-muted-foreground">Chat-Verlauf persistent speichern</p>
                  </div>
                  <Switch 
                    checked={globalConfig.saveHistory} 
                    onCheckedChange={(v) => { updateGlobalConfig({ saveHistory: v }); setHasChanges(true) }} 
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* API Keys */}
          <TabsContent value="api-keys" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>API-Schlüssel</CardTitle>
                <CardDescription>Konfiguriere deine API-Keys für verschiedene Dienste</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* OpenAI */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    OpenAI API Key
                    {globalConfig.openaiApiKey && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                  </Label>
                  <div className="relative">
                    <Input
                      type={showKeys.openai ? "text" : "password"}
                      value={globalConfig.openaiApiKey || ""}
                      onChange={(e) => { updateGlobalConfig({ openaiApiKey: e.target.value }); setHasChanges(true) }}
                      placeholder="sk-..."
                      className="pr-20"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2"
                      onClick={() => toggleKeyVisibility("openai")}
                    >
                      {showKeys.openai ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" 
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                    API Key erstellen <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                {/* Anthropic */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Anthropic API Key
                    {globalConfig.anthropicApiKey && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                  </Label>
                  <div className="relative">
                    <Input
                      type={showKeys.anthropic ? "text" : "password"}
                      value={globalConfig.anthropicApiKey || ""}
                      onChange={(e) => { updateGlobalConfig({ anthropicApiKey: e.target.value }); setHasChanges(true) }}
                      placeholder="sk-ant-..."
                      className="pr-20"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2"
                      onClick={() => toggleKeyVisibility("anthropic")}
                    >
                      {showKeys.anthropic ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" 
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                    API Key erstellen <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                {/* OpenRouter */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    OpenRouter API Key
                    {globalConfig.openrouterApiKey && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                  </Label>
                  <div className="relative">
                    <Input
                      type={showKeys.openrouter ? "text" : "password"}
                      value={globalConfig.openrouterApiKey || ""}
                      onChange={(e) => { updateGlobalConfig({ openrouterApiKey: e.target.value }); setHasChanges(true) }}
                      placeholder="sk-or-..."
                      className="pr-20"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2"
                      onClick={() => toggleKeyVisibility("openrouter")}
                    >
                      {showKeys.openrouter ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" 
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                    API Key erstellen <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                {/* GitHub */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    GitHub Token
                    {globalConfig.githubToken && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                  </Label>
                  <div className="relative">
                    <Input
                      type={showKeys.github ? "text" : "password"}
                      value={globalConfig.githubToken || ""}
                      onChange={(e) => { updateGlobalConfig({ githubToken: e.target.value }); setHasChanges(true) }}
                      placeholder="ghp_..."
                      className="pr-20"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2"
                      onClick={() => toggleKeyVisibility("github")}
                    >
                      {showKeys.github ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <a href="https://github.com/settings/tokens/new?scopes=repo" target="_blank" rel="noopener noreferrer" 
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                    Token erstellen (repo scope) <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                {/* Render */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Render.com API Key
                    {globalConfig.renderApiKey && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                  </Label>
                  <div className="relative">
                    <Input
                      type={showKeys.render ? "text" : "password"}
                      value={globalConfig.renderApiKey || ""}
                      onChange={(e) => { updateGlobalConfig({ renderApiKey: e.target.value }); setHasChanges(true) }}
                      placeholder="rnd_..."
                      className="pr-20"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2"
                      onClick={() => toggleKeyVisibility("render")}
                    >
                      {showKeys.render ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <a href="https://dashboard.render.com/u/settings#api-keys" target="_blank" rel="noopener noreferrer" 
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                    API Key erstellen <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-3">
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">
                    <strong>Hinweis:</strong> API-Keys werden lokal im Browser gespeichert und nie an unsere Server übertragen.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* SAP BTP Credentials */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  SAP BTP Credentials
                </CardTitle>
                <CardDescription>Konfiguriere deine SAP Business Technology Platform Zugangsdaten für Deployments</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* API Endpoint */}
                <div className="space-y-2">
                  <Label>Cloud Foundry API Endpoint</Label>
                  <Select 
                    value={globalConfig.btpApiEndpoint || ""} 
                    onValueChange={(v) => { updateGlobalConfig({ btpApiEndpoint: v }); setHasChanges(true) }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Region wählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="https://api.cf.eu10.hana.ondemand.com">Europe (Frankfurt) - eu10</SelectItem>
                      <SelectItem value="https://api.cf.eu20.hana.ondemand.com">Europe (Netherlands) - eu20</SelectItem>
                      <SelectItem value="https://api.cf.us10.hana.ondemand.com">US East (VA) - us10</SelectItem>
                      <SelectItem value="https://api.cf.us20.hana.ondemand.com">US West (WA) - us20</SelectItem>
                      <SelectItem value="https://api.cf.ap10.hana.ondemand.com">Australia (Sydney) - ap10</SelectItem>
                      <SelectItem value="https://api.cf.ap11.hana.ondemand.com">Singapore - ap11</SelectItem>
                      <SelectItem value="https://api.cf.jp10.hana.ondemand.com">Japan (Tokyo) - jp10</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Organization */}
                <div className="space-y-2">
                  <Label>Organisation</Label>
                  <Input
                    value={globalConfig.btpOrg || ""}
                    onChange={(e) => { updateGlobalConfig({ btpOrg: e.target.value }); setHasChanges(true) }}
                    placeholder="z.B. my-org-trial"
                  />
                </div>

                {/* Space */}
                <div className="space-y-2">
                  <Label>Space</Label>
                  <Input
                    value={globalConfig.btpSpace || ""}
                    onChange={(e) => { updateGlobalConfig({ btpSpace: e.target.value }); setHasChanges(true) }}
                    placeholder="z.B. dev"
                  />
                </div>

                {/* Username */}
                <div className="space-y-2">
                  <Label>BTP Username (Email)</Label>
                  <Input
                    type="email"
                    value={globalConfig.btpUsername || ""}
                    onChange={(e) => { updateGlobalConfig({ btpUsername: e.target.value }); setHasChanges(true) }}
                    placeholder="your.email@company.com"
                  />
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <Label>BTP Password / API Token</Label>
                  <div className="relative">
                    <Input
                      type={showKeys.btp ? "text" : "password"}
                      value={globalConfig.btpPassword || ""}
                      onChange={(e) => { updateGlobalConfig({ btpPassword: e.target.value }); setHasChanges(true) }}
                      placeholder="••••••••"
                      className="pr-20"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2"
                      onClick={() => toggleKeyVisibility("btp")}
                    >
                      {showKeys.btp ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-3">
                  <p className="text-sm text-blue-600 dark:text-blue-400">
                    <strong>Tipp:</strong> Für Production-Deployments empfehlen wir einen API Token statt Passwort.
                    Erstelle einen unter SAP BTP Cockpit → Security → Users → Create API Token.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Agents */}
          <TabsContent value="agents" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Agenten-Konfiguration</CardTitle>
                <CardDescription>Konfiguriere die einzelnen Agenten im Workflow</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {Object.entries(agentConfigs).map(([agentType, config]) => (
                  <div key={agentType} className="border rounded-lg p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">{config.name}</h4>
                        <p className="text-xs text-muted-foreground">ID: {agentType}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={config.enabled}
                          onCheckedChange={(v) => { updateAgentConfig(agentType as any, { enabled: v }); setHasChanges(true) }}
                        />
                        <Button variant="ghost" size="sm" onClick={() => { resetAgentConfig(agentType as any); setHasChanges(true) }}>
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs">Modell</Label>
                        <Select
                          value={config.model}
                          onValueChange={(v) => { updateAgentConfig(agentType as any, { model: v }); setHasChanges(true) }}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                            <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                            <SelectItem value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs">Temperatur: {config.temperature}</Label>
                        <Slider
                          value={[config.temperature]}
                          min={0}
                          max={1}
                          step={0.1}
                          onValueChange={([v]) => { updateAgentConfig(agentType as any, { temperature: v }); setHasChanges(true) }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Appearance */}
          <TabsContent value="appearance" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Darstellung</CardTitle>
                <CardDescription>Passe das Erscheinungsbild an</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Theme</Label>
                  <Select 
                    value={globalConfig.theme} 
                    onValueChange={(v: "dark" | "light" | "system") => { updateGlobalConfig({ theme: v }); setHasChanges(true) }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dark">Dunkel</SelectItem>
                      <SelectItem value="light">Hell</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Advanced */}
          <TabsContent value="advanced" className="space-y-4">
            {/* MCP Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5" />
                  MCP Server Konfiguration
                </CardTitle>
                <CardDescription>Konfiguriere den Betriebsmodus für MCP (Model Context Protocol) Server</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <Label>MCP Betriebsmodus</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => handleMCPModeChange("demo")}
                      className={`flex flex-col items-center p-4 rounded-lg border-2 transition-all ${
                        mcpMode === "demo" 
                          ? "border-primary bg-primary/10" 
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <TestTube className={`h-8 w-8 mb-2 ${mcpMode === "demo" ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="font-medium">Demo</span>
                      <span className="text-xs text-muted-foreground text-center mt-1">
                        Simulierte Responses für Entwicklung
                      </span>
                    </button>
                    <button
                      onClick={() => handleMCPModeChange("production")}
                      className={`flex flex-col items-center p-4 rounded-lg border-2 transition-all ${
                        mcpMode === "production" 
                          ? "border-green-500 bg-green-500/10" 
                          : "border-border hover:border-green-500/50"
                      }`}
                    >
                      <Play className={`h-8 w-8 mb-2 ${mcpMode === "production" ? "text-green-500" : "text-muted-foreground"}`} />
                      <span className="font-medium">Production</span>
                      <span className="text-xs text-muted-foreground text-center mt-1">
                        Echte MCP Server Aufrufe
                      </span>
                    </button>
                  </div>
                  <div className={`rounded-lg p-3 ${mcpMode === "production" ? "bg-green-500/10 border border-green-500/30" : "bg-blue-500/10 border border-blue-500/30"}`}>
                    <p className="text-sm">
                      {mcpMode === "production" ? (
                        <>
                          <strong className="text-green-500">Production-Modus aktiv:</strong> MCP Server werden real aufgerufen. 
                          Stelle sicher, dass die Server installiert sind.
                        </>
                      ) : (
                        <>
                          <strong className="text-blue-500">Demo-Modus aktiv:</strong> MCP Aufrufe werden simuliert. 
                          Ideal für Entwicklung und Tests.
                        </>
                      )}
                    </p>
                  </div>
                </div>

                {mcpMode === "production" && (
                  <div className="space-y-3 pt-4 border-t">
                    <Label>MCP Server Installation</Label>
                    <p className="text-xs text-muted-foreground">
                      Für Production-Modus müssen die MCP Server global installiert sein.
                    </p>
                    <div className="bg-muted rounded-lg p-3 font-mono text-xs overflow-x-auto">
                      <code>chmod +x scripts/install-mcp-servers.sh && ./scripts/install-mcp-servers.sh</code>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Oder setze <code className="bg-muted px-1 py-0.5 rounded">MCP_MODE=production</code> in deiner <code className="bg-muted px-1 py-0.5 rounded">.env.local</code>
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Erweiterte Einstellungen</CardTitle>
                <CardDescription>Für fortgeschrittene Benutzer</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Max. parallele Agenten</Label>
                  <Select 
                    value={String(globalConfig.maxConcurrentAgents)} 
                    onValueChange={(v) => { updateGlobalConfig({ maxConcurrentAgents: parseInt(v) }); setHasChanges(true) }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 (Sequentiell)</SelectItem>
                      <SelectItem value="2">2</SelectItem>
                      <SelectItem value="3">3</SelectItem>
                      <SelectItem value="4">4</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Anzahl der Agenten, die gleichzeitig ausgeführt werden können
                  </p>
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2 text-destructive">Gefahrenzone</h4>
                  <Button variant="destructive" size="sm" onClick={() => {
                    if (confirm("Alle Einstellungen wirklich zurücksetzen?")) {
                      handleReset()
                      toast.success("Alle Einstellungen zurückgesetzt")
                    }
                  }}>
                    Alle Einstellungen zurücksetzen
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
