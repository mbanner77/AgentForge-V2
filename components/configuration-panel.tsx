"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Brain, Code2, Eye, Play, Copy, Check, Shield } from "lucide-react"
import { useAgentStore } from "@/lib/agent-store"
import type { AgentType } from "@/lib/types"

const agentIcons: Record<AgentType, typeof Brain> = {
  planner: Brain,
  coder: Code2,
  reviewer: Eye,
  security: Shield,
  executor: Play,
}

export function ConfigurationPanel() {
  const [activeAgent, setActiveAgent] = useState<AgentType>("planner")
  const [copied, setCopied] = useState(false)
  
  const { agentConfigs, updateAgentConfig, exportConfig } = useAgentStore()
  const currentConfig = agentConfigs[activeAgent]

  const handleCopy = () => {
    navigator.clipboard.writeText(exportConfig())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section id="configure" className="border-t border-border bg-secondary/30 px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-16 text-center">
          <Badge variant="secondary" className="mb-4">
            Konfiguration
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Konfiguriere deine Agenten</h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Passe jeden Agenten individuell an. Definiere System-Prompts, wähle Modelle und konfiguriere verfügbare
            Tools.
          </p>
        </div>

        <Card className="overflow-hidden border-border bg-card">
          <Tabs value={activeAgent} onValueChange={(v) => setActiveAgent(v as AgentType)}>
            <div className="border-b border-border bg-secondary/50 px-4">
              <TabsList className="h-14 w-full justify-start gap-2 bg-transparent">
                {(Object.keys(agentConfigs) as AgentType[]).map((key) => {
                  const Icon = agentIcons[key]
                  return (
                    <TabsTrigger
                      key={key}
                      value={key}
                      className="flex items-center gap-2 data-[state=active]:bg-background"
                    >
                      <Icon className="h-4 w-4" />
                      <span className="hidden sm:inline">{agentConfigs[key].name}</span>
                    </TabsTrigger>
                  )
                })}
              </TabsList>
            </div>

            {(Object.keys(agentConfigs) as AgentType[]).map((key) => (
              <TabsContent key={key} value={key} className="m-0">
                <div className="grid gap-6 p-6 lg:grid-cols-2">
                  {/* Left Column - Text Config */}
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="system-prompt">System Prompt</Label>
                      <Textarea
                        id="system-prompt"
                        value={currentConfig.systemPrompt}
                        onChange={(e) => updateAgentConfig(activeAgent, { systemPrompt: e.target.value })}
                        className="min-h-[200px] resize-none font-mono text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Verfügbare Tools</Label>
                      <div className="flex flex-wrap gap-2">
                        {currentConfig.tools.map((tool) => (
                          <Badge key={tool.id} variant="outline" className="font-mono text-xs">
                            {tool.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Column - Settings */}
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="model">Modell</Label>
                      <Select value={currentConfig.model} onValueChange={(v) => updateAgentConfig(activeAgent, { model: v })}>
                        <SelectTrigger id="model">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                          <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                          <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                          <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                          <SelectItem value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</SelectItem>
                          <SelectItem value="claude-3-opus-20240229">Claude 3 Opus</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Temperature</Label>
                          <span className="text-sm text-muted-foreground">{currentConfig.temperature}</span>
                        </div>
                        <Slider
                          value={[currentConfig.temperature]}
                          onValueChange={([v]) => updateAgentConfig(activeAgent, { temperature: v })}
                          min={0}
                          max={1}
                          step={0.1}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Max Tokens</Label>
                          <span className="text-sm text-muted-foreground">{currentConfig.maxTokens}</span>
                        </div>
                        <Slider
                          value={[currentConfig.maxTokens]}
                          onValueChange={([v]) => updateAgentConfig(activeAgent, { maxTokens: v })}
                          min={500}
                          max={8000}
                          step={100}
                        />
                      </div>
                    </div>

                    <div className="space-y-4 rounded-lg border border-border bg-secondary/50 p-4">
                      <h4 className="font-medium">Erweiterte Optionen</h4>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="auto-retry" className="cursor-pointer">
                          Automatisches Retry bei Fehlern
                        </Label>
                        <Switch 
                          id="auto-retry" 
                          checked={currentConfig.autoRetry}
                          onCheckedChange={(autoRetry) => updateAgentConfig(activeAgent, { autoRetry })}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="streaming" className="cursor-pointer">
                          Streaming aktivieren
                        </Label>
                        <Switch 
                          id="streaming" 
                          checked={currentConfig.streaming}
                          onCheckedChange={(streaming) => updateAgentConfig(activeAgent, { streaming })}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="logging" className="cursor-pointer">
                          Detailliertes Logging
                        </Label>
                        <Switch 
                          id="logging" 
                          checked={currentConfig.detailedLogging}
                          onCheckedChange={(detailedLogging) => updateAgentConfig(activeAgent, { detailedLogging })}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-border bg-secondary/30 px-6 py-4">
                  <p className="text-sm text-muted-foreground">Konfiguration wird automatisch gespeichert</p>
                  <Button variant="outline" size="sm" onClick={handleCopy}>
                    {copied ? (
                      <>
                        <Check className="mr-2 h-4 w-4" />
                        Kopiert
                      </>
                    ) : (
                      <>
                        <Copy className="mr-2 h-4 w-4" />
                        Als JSON kopieren
                      </>
                    )}
                  </Button>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </Card>
      </div>
    </section>
  )
}
