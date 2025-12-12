// Zentrale Typdefinitionen für das Agent-System

export type AgentType = "planner" | "coder" | "reviewer" | "security" | "executor"
export type TargetEnvironment = "sandpack" | "webcontainer"
export type AgentStatus = "idle" | "running" | "completed" | "error" | "waiting"

export interface Tool {
  id: string
  name: string
  description: string
  enabled: boolean
  execute?: (input: string, context: AgentContext) => Promise<string>
}

export interface AgentConfig {
  id: AgentType
  name: string
  enabled: boolean
  model: string
  temperature: number
  maxTokens: number
  systemPrompt: string
  tools: Tool[]
  autoRetry: boolean
  streaming: boolean
  detailedLogging: boolean
  mcpServers?: string[] // IDs der zugewiesenen MCP-Server
}

export interface AgentContext {
  projectId: string
  messages: Message[]
  files: ProjectFile[]
  config: AgentConfig
  previousAgentOutput?: string
}

export interface AgentOutput {
  success: boolean
  content: string
  files?: ProjectFile[]
  logs?: LogEntry[]
  error?: string
  metadata?: Record<string, unknown>
}

export interface Message {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  timestamp: Date
  agent?: AgentType | "system"
  metadata?: {
    tokensUsed?: number
    duration?: number
    model?: string
  }
}

export interface WorkflowStep {
  id: string
  agent: AgentType
  status: AgentStatus
  title: string
  description: string
  output?: string
  startTime?: Date
  endTime?: Date
  logs?: LogEntry[]
  error?: string
}

export interface LogEntry {
  id: string
  timestamp: Date
  level: "info" | "warn" | "error" | "debug"
  agent: AgentType | "system"
  message: string
  data?: unknown
}

export interface ProjectFile {
  id: string
  path: string
  content: string
  language: string
  status: "created" | "modified" | "deleted"
  createdAt: Date
  modifiedAt: Date
}

export interface Project {
  id: string
  name: string
  description: string
  createdAt: Date
  updatedAt: Date
  files: ProjectFile[]
  messages: Message[]
  workflowHistory: WorkflowStep[][]
  agentConfigs: Record<AgentType, AgentConfig>
}

export interface GlobalConfig {
  defaultModel: string
  autoReview: boolean
  streaming: boolean
  theme: "dark" | "light" | "system"
  language: "de" | "en"
  maxConcurrentAgents: number
  saveHistory: boolean
  openaiApiKey: string
  anthropicApiKey: string
  openrouterApiKey: string
  renderApiKey: string
  githubToken: string
  targetEnvironment: TargetEnvironment
}

export interface DeploymentInfo {
  serviceId: string
  serviceName: string
  url: string
  status: "pending" | "building" | "live" | "failed"
  deployId?: string
  lastDeployedAt?: Date
}

export interface GeneratedFile {
  name: string
  content: string
  language: string
  path?: string
}

// Marketplace Agent Template
export interface MarketplaceAgent {
  id: string
  name: string
  description: string
  category: "development" | "testing" | "security" | "documentation" | "devops" | "ai" | "custom"
  icon: string
  color: string
  systemPrompt: string
  defaultModel: string
  defaultTemperature: number
  defaultMaxTokens: number
  tools: Tool[]
  author: string
  version: string
  downloads: number
  rating: number
  isInstalled: boolean
  isCore: boolean // Core agents können nicht entfernt werden
}

// Custom Agent (installierter Agent)
export interface CustomAgent extends Omit<AgentConfig, "id"> {
  customId: string
  marketplaceId?: string
  order: number // Position im Workflow
}

// Agenten-Vorschlag für Human-in-the-Loop
export interface AgentSuggestion {
  id: string
  agent: AgentType | string
  type: "improvement" | "fix" | "refactor" | "security" | "performance"
  title: string
  description: string
  affectedFiles: string[]
  suggestedChanges: {
    filePath: string
    originalContent: string
    newContent: string
    diff?: string
  }[]
  priority: "low" | "medium" | "high" | "critical"
  status: "pending" | "approved" | "rejected" | "applied"
  createdAt: Date
}
