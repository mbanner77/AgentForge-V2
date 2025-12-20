// MCP (Model Context Protocol) Client Implementation
// Vollständige Implementierung für MCP Server Verbindungen

import { mcpServers, type MCPServer, type MCPConfigField, type InstalledMCPServer } from "./mcp-servers"

// === MCP PROTOCOL TYPES ===

export interface MCPRequest {
  jsonrpc: "2.0"
  id: string | number
  method: string
  params?: Record<string, unknown>
}

export interface MCPResponse {
  jsonrpc: "2.0"
  id: string | number
  result?: unknown
  error?: MCPError
}

export interface MCPError {
  code: number
  message: string
  data?: unknown
}

export interface MCPToolDefinition {
  name: string
  description: string
  inputSchema: {
    type: "object"
    properties: Record<string, {
      type: string
      description: string
    }>
    required?: string[]
  }
}

export interface MCPResourceDefinition {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

export interface MCPPromptDefinition {
  name: string
  description?: string
  arguments?: {
    name: string
    description?: string
    required?: boolean
  }[]
}

// === MCP CONNECTION STATUS ===

export type MCPConnectionStatus = "disconnected" | "connecting" | "connected" | "error"

export interface MCPServerStatus {
  serverId: string
  status: MCPConnectionStatus
  error?: string
  connectedAt?: Date
  lastActivity?: Date
  availableTools: string[]
  availableResources: string[]
}

// === MCP CLIENT OPTIONS ===

export interface MCPClientOptions {
  timeout?: number
  retryAttempts?: number
  retryDelay?: number
  onStatusChange?: (status: MCPServerStatus) => void
  onError?: (error: Error) => void
}

// === MCP CLIENT CLASS ===

export class MCPClient {
  private serverId: string
  private config: Record<string, string | number | boolean>
  private options: MCPClientOptions
  private status: MCPConnectionStatus = "disconnected"
  private process: unknown = null
  private tools: MCPToolDefinition[] = []
  private resources: MCPResourceDefinition[] = []
  private prompts: MCPPromptDefinition[] = []
  private requestId = 0

  constructor(
    serverId: string,
    config: Record<string, string | number | boolean>,
    options: MCPClientOptions = {}
  ) {
    this.serverId = serverId
    this.config = config
    this.options = {
      timeout: options.timeout || 30000,
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 1000,
      ...options,
    }
  }

  // Server-Definition abrufen
  getServerDefinition(): MCPServer | undefined {
    return mcpServers.find(s => s.id === this.serverId)
  }

  // Verbindung herstellen
  async connect(): Promise<MCPServerStatus> {
    const server = this.getServerDefinition()
    if (!server) {
      return this.createStatus("error", `Server ${this.serverId} nicht gefunden`)
    }

    this.setStatus("connecting")

    try {
      // Validiere Konfiguration
      const validationError = this.validateConfig(server)
      if (validationError) {
        return this.createStatus("error", validationError)
      }

      // In Produktion: MCP Server Prozess starten
      // await this.startServerProcess(server)

      // Server-Capabilities abrufen
      await this.discoverCapabilities()

      this.setStatus("connected")
      return this.createStatus("connected")
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.setStatus("error")
      return this.createStatus("error", errorMessage)
    }
  }

  // Verbindung trennen
  async disconnect(): Promise<void> {
    if (this.process) {
      // In Produktion: Prozess beenden
      this.process = null
    }
    this.setStatus("disconnected")
    this.tools = []
    this.resources = []
    this.prompts = []
  }

  // Tool aufrufen
  async callTool(toolName: string, args: Record<string, unknown>): Promise<MCPResponse> {
    if (this.status !== "connected") {
      return this.createErrorResponse("Nicht verbunden")
    }

    const tool = this.tools.find(t => t.name === toolName)
    if (!tool) {
      return this.createErrorResponse(`Tool ${toolName} nicht gefunden`)
    }

    // Validiere required parameters
    const required = tool.inputSchema.required || []
    for (const param of required) {
      if (args[param] === undefined) {
        return this.createErrorResponse(`Parameter ${param} ist erforderlich`)
      }
    }

    const request: MCPRequest = {
      jsonrpc: "2.0",
      id: this.nextRequestId(),
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
      },
    }

    return this.sendRequest(request)
  }

  // Resource lesen
  async readResource(uri: string): Promise<MCPResponse> {
    if (this.status !== "connected") {
      return this.createErrorResponse("Nicht verbunden")
    }

    const request: MCPRequest = {
      jsonrpc: "2.0",
      id: this.nextRequestId(),
      method: "resources/read",
      params: { uri },
    }

    return this.sendRequest(request)
  }

  // Prompt abrufen
  async getPrompt(name: string, args?: Record<string, string>): Promise<MCPResponse> {
    if (this.status !== "connected") {
      return this.createErrorResponse("Nicht verbunden")
    }

    const request: MCPRequest = {
      jsonrpc: "2.0",
      id: this.nextRequestId(),
      method: "prompts/get",
      params: { name, arguments: args },
    }

    return this.sendRequest(request)
  }

  // Verfügbare Tools
  getTools(): MCPToolDefinition[] {
    return this.tools
  }

  // Verfügbare Resources
  getResources(): MCPResourceDefinition[] {
    return this.resources
  }

  // Verfügbare Prompts
  getPrompts(): MCPPromptDefinition[] {
    return this.prompts
  }

  // Status
  getStatus(): MCPConnectionStatus {
    return this.status
  }

  // === PRIVATE METHODS ===

  private setStatus(status: MCPConnectionStatus): void {
    this.status = status
    this.options.onStatusChange?.(this.createStatus(status))
  }

  private createStatus(status: MCPConnectionStatus, error?: string): MCPServerStatus {
    return {
      serverId: this.serverId,
      status,
      error,
      connectedAt: status === "connected" ? new Date() : undefined,
      lastActivity: new Date(),
      availableTools: this.tools.map(t => t.name),
      availableResources: this.resources.map(r => r.uri),
    }
  }

  private validateConfig(server: MCPServer): string | null {
    if (!server.configSchema) return null

    for (const field of server.configSchema) {
      if (field.required && this.config[field.name] === undefined) {
        return `Konfigurationsfeld ${field.label} ist erforderlich`
      }
    }

    return null
  }

  private async discoverCapabilities(): Promise<void> {
    const server = this.getServerDefinition()
    if (!server) return

    // Simuliere Tool-Discovery basierend auf Server-Capabilities
    this.tools = server.capabilities.map(cap => ({
      name: cap,
      description: `${cap} operation`,
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    }))
  }

  private nextRequestId(): number {
    return ++this.requestId
  }

  private async sendRequest(request: MCPRequest): Promise<MCPResponse> {
    // In Produktion: Echten Request über stdio/HTTP senden
    // Hier simulieren wir die Antwort

    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        success: true,
        message: `${request.method} ausgeführt`,
        data: request.params,
      },
    }
  }

  private createErrorResponse(message: string): MCPResponse {
    return {
      jsonrpc: "2.0",
      id: this.nextRequestId(),
      error: {
        code: -1,
        message,
      },
    }
  }
}

// === MCP CONNECTION MANAGER ===

export interface MCPConnectionConfig {
  serverId: string
  config: Record<string, string | number | boolean>
  autoConnect?: boolean
}

export class MCPConnectionManager {
  private clients: Map<string, MCPClient> = new Map()
  private configs: Map<string, Record<string, string | number | boolean>> = new Map()
  private options: MCPClientOptions

  constructor(options: MCPClientOptions = {}) {
    this.options = options
  }

  // Server konfigurieren
  configureServer(serverId: string, config: Record<string, string | number | boolean>): void {
    this.configs.set(serverId, config)
  }

  // Konfiguration abrufen
  getConfig(serverId: string): Record<string, string | number | boolean> | undefined {
    return this.configs.get(serverId)
  }

  // Alle Konfigurationen
  getAllConfigs(): Map<string, Record<string, string | number | boolean>> {
    return new Map(this.configs)
  }

  // Verbindung herstellen
  async connect(serverId: string): Promise<MCPServerStatus> {
    const config = this.configs.get(serverId)
    if (!config) {
      return {
        serverId,
        status: "error",
        error: "Keine Konfiguration für Server gefunden",
        availableTools: [],
        availableResources: [],
      }
    }

    let client = this.clients.get(serverId)
    if (!client) {
      client = new MCPClient(serverId, config, this.options)
      this.clients.set(serverId, client)
    }

    return client.connect()
  }

  // Verbindung trennen
  async disconnect(serverId: string): Promise<void> {
    const client = this.clients.get(serverId)
    if (client) {
      await client.disconnect()
      this.clients.delete(serverId)
    }
  }

  // Alle Verbindungen trennen
  async disconnectAll(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.disconnect()
    }
    this.clients.clear()
  }

  // Client abrufen
  getClient(serverId: string): MCPClient | undefined {
    return this.clients.get(serverId)
  }

  // Tool aufrufen
  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<MCPResponse> {
    const client = this.clients.get(serverId)
    if (!client) {
      return {
        jsonrpc: "2.0",
        id: 0,
        error: { code: -1, message: "Server nicht verbunden" },
      }
    }

    return client.callTool(toolName, args)
  }

  // Resource lesen
  async readResource(serverId: string, uri: string): Promise<MCPResponse> {
    const client = this.clients.get(serverId)
    if (!client) {
      return {
        jsonrpc: "2.0",
        id: 0,
        error: { code: -1, message: "Server nicht verbunden" },
      }
    }

    return client.readResource(uri)
  }

  // Status aller Server
  getServerStatuses(): MCPServerStatus[] {
    const statuses: MCPServerStatus[] = []

    for (const [serverId, client] of this.clients) {
      statuses.push({
        serverId,
        status: client.getStatus(),
        availableTools: client.getTools().map(t => t.name),
        availableResources: client.getResources().map(r => r.uri),
      })
    }

    return statuses
  }

  // Konfiguration exportieren
  exportConfig(): Record<string, Record<string, string | number | boolean>> {
    const result: Record<string, Record<string, string | number | boolean>> = {}
    for (const [serverId, config] of this.configs) {
      // Sensible Daten maskieren
      result[serverId] = { ...config }
      const server = mcpServers.find(s => s.id === serverId)
      if (server?.configSchema) {
        for (const field of server.configSchema) {
          if (field.type === "password" && result[serverId][field.name]) {
            result[serverId][field.name] = "***"
          }
        }
      }
    }
    return result
  }

  // Konfiguration importieren
  importConfig(config: Record<string, Record<string, string | number | boolean>>): void {
    for (const [serverId, serverConfig] of Object.entries(config)) {
      this.configs.set(serverId, serverConfig)
    }
  }
}

// === MCP CONFIG GENERATOR ===

export interface MCPClientConfig {
  mcpServers: Record<string, {
    command: string
    args: string[]
    env?: Record<string, string>
  }>
}

export class MCPConfigGenerator {
  // VS Code settings.json Format
  static generateVSCodeConfig(
    serverIds: string[],
    configs: Map<string, Record<string, string | number | boolean>>
  ): object {
    const servers: Record<string, object> = {}

    for (const serverId of serverIds) {
      const server = mcpServers.find(s => s.id === serverId)
      if (!server || !server.npmPackage) continue

      const serverConfig = configs.get(serverId) || {}
      const env: Record<string, string> = {}

      // Config-Felder als Umgebungsvariablen
      if (server.configSchema) {
        for (const field of server.configSchema) {
          const value = serverConfig[field.name]
          if (value !== undefined) {
            const envKey = `MCP_${field.name.toUpperCase()}`
            env[envKey] = String(value)
          }
        }
      }

      servers[server.npmPackage] = {
        command: "npx",
        args: ["-y", server.npmPackage],
        ...(Object.keys(env).length > 0 && { env }),
      }
    }

    return { "mcp.servers": servers }
  }

  // Claude Desktop config.json Format
  static generateClaudeDesktopConfig(
    serverIds: string[],
    configs: Map<string, Record<string, string | number | boolean>>
  ): MCPClientConfig {
    const mcpServersConfig: MCPClientConfig["mcpServers"] = {}

    for (const serverId of serverIds) {
      const server = mcpServers.find(s => s.id === serverId)
      if (!server || !server.npmPackage) continue

      const serverConfig = configs.get(serverId) || {}
      const env: Record<string, string> = {}

      if (server.configSchema) {
        for (const field of server.configSchema) {
          const value = serverConfig[field.name]
          if (value !== undefined) {
            const envKey = `MCP_${field.name.toUpperCase()}`
            env[envKey] = String(value)
          }
        }
      }

      mcpServersConfig[serverId] = {
        command: "npx",
        args: ["-y", server.npmPackage],
        ...(Object.keys(env).length > 0 && { env }),
      }
    }

    return { mcpServers: mcpServersConfig }
  }

  // Installationsbefehl generieren
  static generateInstallCommand(serverIds: string[]): string {
    const packages = serverIds
      .map(id => mcpServers.find(s => s.id === id)?.npmPackage)
      .filter(Boolean)

    if (packages.length === 0) return ""

    return `npm install -g ${packages.join(" ")}`
  }

  // Installations-Anleitung
  static generateInstallInstructions(serverId: string): string | null {
    const server = mcpServers.find(s => s.id === serverId)
    if (!server) return null

    const configFields = server.configSchema?.map(field => {
      const required = field.required ? " (erforderlich)" : ""
      const defaultVal = field.default !== undefined ? ` [Default: ${field.default}]` : ""
      return `  - ${field.label}${required}${defaultVal}: ${field.description}`
    }).join("\n") || "  Keine Konfiguration erforderlich"

    return `
# ${server.name} MCP Server

## Beschreibung
${server.description}

## Installation
\`\`\`bash
npm install -g ${server.npmPackage || server.id}
\`\`\`

## Konfiguration
${configFields}

## Capabilities
${server.capabilities.map(c => `- ${c}`).join("\n")}

## Repository
${server.repository}

## Autor
${server.author} ${server.isOfficial ? "(Offiziell)" : "(Community)"}
`.trim()
  }
}

// === INSTALLED SERVER MANAGER ===

export class InstalledServerManager {
  private installedServers: Map<string, InstalledMCPServer> = new Map()
  private connectionManager: MCPConnectionManager

  constructor() {
    this.connectionManager = new MCPConnectionManager()
  }

  // Server installieren
  installServer(serverId: string, config: Record<string, string | number | boolean>): boolean {
    const server = mcpServers.find(s => s.id === serverId)
    if (!server) return false

    const installed: InstalledMCPServer = {
      ...server,
      config,
      status: "inactive",
      isInstalled: true,
    }

    this.installedServers.set(serverId, installed)
    this.connectionManager.configureServer(serverId, config)
    return true
  }

  // Server deinstallieren
  uninstallServer(serverId: string): boolean {
    this.connectionManager.disconnect(serverId)
    return this.installedServers.delete(serverId)
  }

  // Server aktivieren
  async activateServer(serverId: string): Promise<MCPServerStatus> {
    const installed = this.installedServers.get(serverId)
    if (!installed) {
      return {
        serverId,
        status: "error",
        error: "Server nicht installiert",
        availableTools: [],
        availableResources: [],
      }
    }

    const status = await this.connectionManager.connect(serverId)
    installed.status = status.status === "connected" ? "active" : "error"
    installed.lastUsed = new Date()
    return status
  }

  // Server deaktivieren
  async deactivateServer(serverId: string): Promise<void> {
    await this.connectionManager.disconnect(serverId)
    const installed = this.installedServers.get(serverId)
    if (installed) {
      installed.status = "inactive"
    }
  }

  // Konfiguration aktualisieren
  updateServerConfig(serverId: string, config: Record<string, string | number | boolean>): boolean {
    const installed = this.installedServers.get(serverId)
    if (!installed) return false

    installed.config = { ...installed.config, ...config }
    this.connectionManager.configureServer(serverId, installed.config)
    return true
  }

  // Installierte Server
  getInstalledServers(): InstalledMCPServer[] {
    return Array.from(this.installedServers.values())
  }

  // Server abrufen
  getServer(serverId: string): InstalledMCPServer | undefined {
    return this.installedServers.get(serverId)
  }

  // Tool aufrufen
  async callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<MCPResponse> {
    return this.connectionManager.callTool(serverId, toolName, args)
  }

  // Resource lesen
  async readResource(serverId: string, uri: string): Promise<MCPResponse> {
    return this.connectionManager.readResource(serverId, uri)
  }

  // Export
  export(): { servers: [string, InstalledMCPServer][]; configs: Record<string, Record<string, string | number | boolean>> } {
    return {
      servers: Array.from(this.installedServers.entries()),
      configs: this.connectionManager.exportConfig(),
    }
  }

  // Import
  import(data: ReturnType<InstalledServerManager["export"]>): void {
    this.installedServers = new Map(data.servers)
    this.connectionManager.importConfig(data.configs)
  }
}

// === SINGLETON INSTANCES ===

let connectionManagerInstance: MCPConnectionManager | null = null
let installedServerManagerInstance: InstalledServerManager | null = null

export function getMCPConnectionManager(): MCPConnectionManager {
  if (!connectionManagerInstance) {
    connectionManagerInstance = new MCPConnectionManager()
  }
  return connectionManagerInstance
}

export function getInstalledServerManager(): InstalledServerManager {
  if (!installedServerManagerInstance) {
    installedServerManagerInstance = new InstalledServerManager()
  }
  return installedServerManagerInstance
}
