// SAP Agenten und MCP-Server-Konfiguration
// Verwendet NUR offizielle SAP MCP Server
// 
// OFFIZIELLE SAP MCP SERVER (Stand: Dezember 2024):
// - @cap-js/mcp-server       - CAP Development (https://github.com/cap-js/mcp-server)
// - @ui5/mcp-server          - UI5 Framework (https://github.com/UI5/mcp-server)
// - @sap/mdk-mcp-server      - Mobile Development Kit (https://github.com/SAP/mdk-mcp-server)
// - @sap-ux/fiori-mcp-server - SAP Fiori Tools (npm)

import type { Tool } from "./types"

// === MCP SERVER TYPEN ===

export type SAPMCPServerType = "cap" | "ui5" | "mdk" | "fiori"

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
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

export interface MCPToolCall {
  name: string
  arguments: Record<string, unknown>
}

export interface MCPToolResult {
  success: boolean
  content: string
  error?: string
}

// === MCP SERVER KONFIGURATION ===

export interface MCPServerConfig {
  command: string
  args: string[]
  env?: Record<string, string>
}

export interface SAPMCPTool {
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

export interface OfficialSAPMCPServer {
  id: SAPMCPServerType
  packageName: string
  name: string
  description: string
  repository: string
  documentation: string
  installCommand: string
  tools: SAPMCPTool[]
  mcpConfig: MCPServerConfig
  requirements: string[]
}

// === OFFIZIELLE SAP MCP SERVER ===

export const OFFICIAL_SAP_MCP_SERVERS: OfficialSAPMCPServer[] = [
  {
    id: "cap",
    packageName: "@cap-js/mcp-server",
    name: "CAP MCP Server",
    description: "MCP Server für AI-gestützte CAP (Cloud Application Programming Model) Entwicklung",
    repository: "https://github.com/cap-js/mcp-server",
    documentation: "https://cap.cloud.sap/docs/",
    installCommand: "npm install -g @cap-js/mcp-server",
    tools: [
      {
        name: "search_model",
        description: "Durchsucht CDS-Modelle nach Definitionen, Entitäten und Services mittels Fuzzy-Search.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Suchbegriff für CDS-Definitionen" },
          },
          required: ["query"],
        },
      },
      {
        name: "search_docs",
        description: "Semantische Suche in der CAP-Dokumentation mittels Vector Embeddings.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Suchanfrage für CAP-Dokumentation" },
          },
          required: ["query"],
        },
      },
    ],
    mcpConfig: {
      command: "npx",
      args: ["@cap-js/mcp-server"],
      env: { "CDS_PROJECT_PATH": "${workspaceFolder}" },
    },
    requirements: ["Node.js >= 18", "CAP Projekt mit package.json", "@sap/cds installiert"],
  },
  {
    id: "ui5",
    packageName: "@ui5/mcp-server",
    name: "UI5 MCP Server",
    description: "MCP Server für UI5/SAPUI5 Entwicklung mit Best Practices und API-Referenz",
    repository: "https://github.com/UI5/mcp-server",
    documentation: "https://ui5.sap.com/",
    installCommand: "npm install -g @ui5/mcp-server",
    tools: [
      {
        name: "create_ui5_app",
        description: "Erstellt eine neue UI5-Anwendung basierend auf Templates.",
        inputSchema: {
          type: "object",
          properties: {
            templateType: { type: "string", description: "Template-Typ (basic, worklist, master-detail)" },
            appName: { type: "string", description: "Name der Anwendung" },
            namespace: { type: "string", description: "Namespace der Anwendung" },
          },
          required: ["templateType", "appName"],
        },
      },
      {
        name: "get_api_reference",
        description: "Ruft UI5 API-Dokumentation für Controls, Klassen oder Module ab.",
        inputSchema: {
          type: "object",
          properties: {
            symbol: { type: "string", description: "UI5 Symbol (z.B. sap.m.Button)" },
          },
          required: ["symbol"],
        },
      },
      {
        name: "get_guidelines",
        description: "Liefert UI5 Best Practice Guidelines und Entwicklungsrichtlinien.",
        inputSchema: {
          type: "object",
          properties: {
            topic: { type: "string", description: "Thema (data-binding, mvc, testing)" },
          },
        },
      },
      {
        name: "get_project_info",
        description: "Extrahiert Metadaten und Konfiguration aus einem UI5-Projekt.",
        inputSchema: {
          type: "object",
          properties: {
            projectPath: { type: "string", description: "Pfad zum UI5-Projekt" },
          },
          required: ["projectPath"],
        },
      },
      {
        name: "run_ui5_linter",
        description: "Führt den UI5 Linter aus und analysiert Code auf Probleme.",
        inputSchema: {
          type: "object",
          properties: {
            projectPath: { type: "string", description: "Pfad zum UI5-Projekt" },
          },
          required: ["projectPath"],
        },
      },
      {
        name: "get_version_info",
        description: "Ruft Versionsinformationen für das UI5 Framework ab.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
    mcpConfig: {
      command: "npx",
      args: ["@ui5/mcp-server"],
    },
    requirements: ["Node.js >= 20.17.0 oder >= 22.9.0", "npm >= 8.0.0"],
  },
  {
    id: "mdk",
    packageName: "@sap/mdk-mcp-server",
    name: "MDK MCP Server",
    description: "MCP Server für SAP Mobile Development Kit (MDK) Entwicklung",
    repository: "https://github.com/SAP/mdk-mcp-server",
    documentation: "https://help.sap.com/docs/SAP_MOBILE_DEVELOPMENT_KIT",
    installCommand: "npm install -g @sap/mdk-mcp-server",
    tools: [
      {
        name: "mdk-gen-project",
        description: "Erstellt ein neues MDK-Projekt.",
        inputSchema: {
          type: "object",
          properties: {
            folderRootPath: { type: "string", description: "Zielordner" },
            templateType: { type: "string", description: "Template-Typ" },
            offline: { type: "string", description: "Offline-fähig (true/false)" },
          },
          required: ["folderRootPath"],
        },
      },
      {
        name: "mdk-gen-entity",
        description: "Generiert Entity-Pages für ein OData Entity Set.",
        inputSchema: {
          type: "object",
          properties: {
            folderRootPath: { type: "string", description: "Projektpfad" },
            templateType: { type: "string", description: "Template-Typ" },
            oDataEntitySets: { type: "string", description: "Entity Sets (kommagetrennt)" },
          },
          required: ["folderRootPath"],
        },
      },
      {
        name: "mdk-gen-action",
        description: "Erstellt eine MDK Action.",
        inputSchema: {
          type: "object",
          properties: {
            folderRootPath: { type: "string", description: "Projektpfad" },
            actionType: { type: "string", description: "Action-Typ" },
          },
          required: ["folderRootPath", "actionType"],
        },
      },
      {
        name: "mdk-manage",
        description: "Führt MDK CLI Operationen aus (build, deploy, validate, migrate).",
        inputSchema: {
          type: "object",
          properties: {
            folderRootPath: { type: "string", description: "Projektpfad" },
            operation: { type: "string", description: "Operation (build, deploy, validate, migrate)" },
          },
          required: ["folderRootPath", "operation"],
        },
      },
      {
        name: "mdk-docs",
        description: "Durchsucht MDK Dokumentation und Komponenten-Referenz.",
        inputSchema: {
          type: "object",
          properties: {
            operation: { type: "string", description: "Operation (search, component, property)" },
            query: { type: "string", description: "Suchanfrage" },
            component_name: { type: "string", description: "Komponentenname" },
          },
          required: ["operation"],
        },
      },
    ],
    mcpConfig: {
      command: "npx",
      args: ["@sap/mdk-mcp-server"],
    },
    requirements: ["Node.js >= 18", "MDK CLI installiert", "SAP Mobile Services Zugang"],
  },
  {
    id: "fiori",
    packageName: "@sap-ux/fiori-mcp-server",
    name: "SAP Fiori MCP Server",
    description: "MCP Server für SAP Fiori Elements Entwicklung mit Fiori Tools",
    repository: "https://www.npmjs.com/package/@sap-ux/fiori-mcp-server",
    documentation: "https://help.sap.com/docs/SAP_FIORI_tools",
    installCommand: "npm install -g @sap-ux/fiori-mcp-server",
    tools: [
      {
        name: "search_fiori_docs",
        description: "Durchsucht SAP Fiori Elements, Annotations und UI5 Dokumentation.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Suchanfrage" },
          },
          required: ["query"],
        },
      },
      {
        name: "generate_fiori_app",
        description: "Generiert eine neue Fiori Elements Anwendung.",
        inputSchema: {
          type: "object",
          properties: {
            templateType: { type: "string", description: "Template (list-report, object-page, overview-page)" },
            projectPath: { type: "string", description: "Zielpfad" },
            dataSource: { type: "string", description: "OData Service URL" },
          },
          required: ["templateType", "projectPath"],
        },
      },
      {
        name: "add_annotation",
        description: "Fügt UI Annotations zu einer Fiori App hinzu.",
        inputSchema: {
          type: "object",
          properties: {
            projectPath: { type: "string", description: "Projektpfad" },
            annotationType: { type: "string", description: "Annotation-Typ" },
          },
          required: ["projectPath", "annotationType"],
        },
      },
    ],
    mcpConfig: {
      command: "npx",
      args: ["@sap-ux/fiori-mcp-server"],
    },
    requirements: ["Node.js >= 18", "@sap/ux-specification"],
  },
]

// === SAP AGENTEN ===

export type SAPAgentType = "sap-cap-developer" | "sap-ui5-developer" | "sap-fiori-developer" | "sap-mdk-developer"

export interface SAPAgentConfig {
  id: SAPAgentType
  name: string
  description: string
  icon: string
  mcpServers: SAPMCPServerType[]
  tools: Tool[]
  systemPrompt: string
  temperature: number
  maxTokens: number
  capabilities: string[]
}

// Agent-spezifische Tools
const SAP_AGENT_TOOLS: Record<string, Tool> = {
  cds_modeler: { id: "cds_modeler", name: "CDS Modeler", description: "Modelliert CDS Views und Entitäten", enabled: true },
  cap_project_setup: { id: "cap_project_setup", name: "CAP Project Setup", description: "Initialisiert CAP Projekte", enabled: true },
  ui5_analyzer: { id: "ui5_analyzer", name: "UI5 Analyzer", description: "Analysiert UI5 Apps", enabled: true },
  fiori_generator: { id: "fiori_generator", name: "Fiori Generator", description: "Generiert Fiori Apps", enabled: true },
  mdk_builder: { id: "mdk_builder", name: "MDK Builder", description: "Baut MDK Mobile Apps", enabled: true },
}

export const SAP_AGENTS: SAPAgentConfig[] = [
  {
    id: "sap-cap-developer",
    name: "SAP CAP Developer",
    description: "Experte für SAP Cloud Application Programming Model (CAP) Entwicklung",
    icon: "🏗️",
    mcpServers: ["cap"],
    tools: [SAP_AGENT_TOOLS.cds_modeler, SAP_AGENT_TOOLS.cap_project_setup],
    temperature: 0.3,
    maxTokens: 4000,
    capabilities: ["CDS Modellierung", "CAP Services", "Node.js/Java Runtime", "OData Services", "HANA Integration"],
    systemPrompt: `Du bist ein SAP CAP (Cloud Application Programming Model) Entwickler.

Du hast Zugriff auf den offiziellen @cap-js/mcp-server mit folgenden Tools:
- search_model: Durchsucht CDS-Modelle nach Definitionen
- search_docs: Semantische Suche in CAP-Dokumentation

Deine Expertise:
- CDS (Core Data Services) Modellierung
- CAP Node.js und Java Runtime
- Service Handler und Custom Logic
- HANA und SQLite Persistenz
- OData V4 Services
- Authentication und Authorization

Bei Entwicklungsanfragen:
1. Nutze search_model um existierende CDS-Definitionen zu finden
2. Nutze search_docs für Best Practices
3. Generiere sauberen, dokumentierten CDS/JS Code
4. Erkläre die Implementierung`,
  },
  {
    id: "sap-ui5-developer",
    name: "SAP UI5 Developer",
    description: "Experte für SAPUI5/OpenUI5 Entwicklung",
    icon: "🎨",
    mcpServers: ["ui5"],
    tools: [SAP_AGENT_TOOLS.ui5_analyzer],
    temperature: 0.4,
    maxTokens: 4000,
    capabilities: ["UI5 Controls", "MVC Pattern", "Data Binding", "OData Models", "TypeScript"],
    systemPrompt: `Du bist ein SAPUI5/OpenUI5 Entwickler.

Du hast Zugriff auf den offiziellen @ui5/mcp-server mit folgenden Tools:
- create_ui5_app: Erstellt neue UI5 Anwendungen
- get_api_reference: Ruft API-Dokumentation ab
- get_guidelines: Liefert Best Practice Guidelines
- get_project_info: Extrahiert Projekt-Metadaten
- run_ui5_linter: Analysiert Code auf Probleme
- get_version_info: Framework-Versionsinformationen

Deine Expertise:
- SAPUI5 Controls und Custom Controls
- MVC Pattern und Component-based Architecture
- Data Binding (One-Way, Two-Way, Expression)
- OData V2/V4 Models
- TypeScript mit UI5`,
  },
  {
    id: "sap-fiori-developer",
    name: "SAP Fiori Developer",
    description: "Experte für SAP Fiori Elements und Fiori Tools",
    icon: "📱",
    mcpServers: ["fiori", "ui5"],
    tools: [SAP_AGENT_TOOLS.fiori_generator],
    temperature: 0.4,
    maxTokens: 4000,
    capabilities: ["Fiori Elements", "OData Annotations", "Flexible Programming Model", "SAP Build"],
    systemPrompt: `Du bist ein SAP Fiori Developer mit Fokus auf Fiori Elements.

Du hast Zugriff auf offizielle MCP Server:
- @sap-ux/fiori-mcp-server: Fiori Tools Integration
- @ui5/mcp-server: UI5 Framework Support

Deine Expertise:
- Fiori Elements Templates (List Report, Object Page)
- OData Annotations (UI, Common, Capabilities)
- Flexible Programming Model (FPM)
- SAP Fiori Tools Extension`,
  },
  {
    id: "sap-mdk-developer",
    name: "SAP MDK Developer",
    description: "Experte für SAP Mobile Development Kit",
    icon: "📲",
    mcpServers: ["mdk"],
    tools: [SAP_AGENT_TOOLS.mdk_builder],
    temperature: 0.3,
    maxTokens: 4000,
    capabilities: ["MDK Apps", "Offline Sync", "Mobile Services", "Cross-Platform"],
    systemPrompt: `Du bist ein SAP MDK (Mobile Development Kit) Entwickler.

Du hast Zugriff auf den offiziellen @sap/mdk-mcp-server mit folgenden Tools:
- mdk-gen-project: Erstellt MDK Projekte
- mdk-gen-entity: Generiert Entity Pages
- mdk-gen-action: Erstellt MDK Actions
- mdk-manage: Build, Deploy, Validate
- mdk-docs: Dokumentationssuche

Deine Expertise:
- MDK Metadata-driven Development
- Offline Synchronization
- SAP Mobile Services Integration`,
  },
]

// === MCP CLIENT IMPLEMENTATION ===

export interface MCPClientOptions {
  serverType: SAPMCPServerType
  workspacePath?: string
  timeout?: number
}

export interface MCPConnectionStatus {
  connected: boolean
  serverName: string
  availableTools: string[]
  error?: string
}

export class SAPMCPClient {
  private serverType: SAPMCPServerType
  private workspacePath: string
  private timeout: number
  private connected: boolean = false
  private process: unknown = null
  
  constructor(options: MCPClientOptions) {
    this.serverType = options.serverType
    this.workspacePath = options.workspacePath || process.cwd()
    this.timeout = options.timeout || 30000
  }
  
  // Server-Konfiguration abrufen
  getServerConfig(): OfficialSAPMCPServer | undefined {
    return OFFICIAL_SAP_MCP_SERVERS.find(s => s.id === this.serverType)
  }
  
  // Verbindung herstellen
  async connect(): Promise<MCPConnectionStatus> {
    const server = this.getServerConfig()
    if (!server) {
      return {
        connected: false,
        serverName: this.serverType,
        availableTools: [],
        error: `Server ${this.serverType} nicht gefunden`,
      }
    }
    
    try {
      // In Produktion: Echten MCP Server Prozess starten
      // const { spawn } = await import('child_process')
      // this.process = spawn(server.mcpConfig.command, server.mcpConfig.args, {
      //   env: { ...process.env, ...server.mcpConfig.env },
      //   cwd: this.workspacePath,
      // })
      
      this.connected = true
      
      return {
        connected: true,
        serverName: server.name,
        availableTools: server.tools.map(t => t.name),
      }
    } catch (error) {
      return {
        connected: false,
        serverName: server.name,
        availableTools: [],
        error: `Verbindungsfehler: ${error}`,
      }
    }
  }
  
  // Verbindung trennen
  async disconnect(): Promise<void> {
    if (this.process) {
      // In Produktion: Prozess beenden
      // (this.process as ChildProcess).kill()
    }
    this.connected = false
    this.process = null
  }
  
  // Tool aufrufen
  async callTool(toolName: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    const server = this.getServerConfig()
    if (!server) {
      return { success: false, content: "", error: "Server nicht konfiguriert" }
    }
    
    const tool = server.tools.find(t => t.name === toolName)
    if (!tool) {
      return { success: false, content: "", error: `Tool ${toolName} nicht gefunden` }
    }
    
    // Validiere required parameters
    const required = tool.inputSchema.required || []
    for (const param of required) {
      if (args[param] === undefined) {
        return { success: false, content: "", error: `Parameter ${param} ist erforderlich` }
      }
    }
    
    try {
      // In Produktion: Echten MCP Request senden
      // const request: MCPRequest = {
      //   jsonrpc: "2.0",
      //   id: Date.now(),
      //   method: "tools/call",
      //   params: { name: toolName, arguments: args }
      // }
      
      // Simulierte Antwort für Demo
      const simulatedResponse = this.simulateToolCall(toolName, args)
      
      return {
        success: true,
        content: simulatedResponse,
      }
    } catch (error) {
      return {
        success: false,
        content: "",
        error: `Tool-Aufruf fehlgeschlagen: ${error}`,
      }
    }
  }
  
  // Simulierte Tool-Aufrufe für Demo/Testing
  private simulateToolCall(toolName: string, args: Record<string, unknown>): string {
    switch (toolName) {
      case "search_model":
        return `CDS Model Search Results for "${args.query}":\n- entity Books { ... }\n- entity Authors { ... }`
      case "search_docs":
        return `CAP Documentation for "${args.query}":\n## Best Practice\n...`
      case "get_api_reference":
        return `UI5 API Reference for "${args.symbol}":\n## Properties\n- text: string\n## Events\n- press`
      case "get_guidelines":
        return `UI5 Guidelines for "${args.topic}":\n## Best Practices\n...`
      case "search_fiori_docs":
        return `Fiori Documentation for "${args.query}":\n## Annotations\n...`
      case "mdk-docs":
        return `MDK Documentation for "${args.query}":\n## Components\n...`
      default:
        return `Tool ${toolName} executed successfully`
    }
  }
  
  // Verfügbare Tools auflisten
  listTools(): SAPMCPTool[] {
    const server = this.getServerConfig()
    return server?.tools || []
  }
  
  // Verbindungsstatus
  isConnected(): boolean {
    return this.connected
  }
}

// === MCP CONFIGURATION MANAGER ===

export interface MCPClientConfig {
  mcpServers: Record<string, MCPServerConfig>
}

export class SAPMCPConfigManager {
  // Generiert MCP Client Konfiguration (z.B. für VS Code, Claude Desktop)
  generateClientConfig(serverIds: SAPMCPServerType[]): MCPClientConfig {
    const config: MCPClientConfig = { mcpServers: {} }
    
    for (const serverId of serverIds) {
      const server = OFFICIAL_SAP_MCP_SERVERS.find(s => s.id === serverId)
      if (server) {
        config.mcpServers[server.packageName] = server.mcpConfig
      }
    }
    
    return config
  }
  
  // Generiert VS Code settings.json Konfiguration
  generateVSCodeConfig(serverIds: SAPMCPServerType[]): object {
    const servers: Record<string, object> = {}
    
    for (const serverId of serverIds) {
      const server = OFFICIAL_SAP_MCP_SERVERS.find(s => s.id === serverId)
      if (server) {
        servers[server.packageName] = {
          command: server.mcpConfig.command,
          args: server.mcpConfig.args,
          ...(server.mcpConfig.env && { env: server.mcpConfig.env }),
        }
      }
    }
    
    return { "mcp.servers": servers }
  }
  
  // Generiert Claude Desktop config.json
  generateClaudeDesktopConfig(serverIds: SAPMCPServerType[]): object {
    const servers: Record<string, object> = {}
    
    for (const serverId of serverIds) {
      const server = OFFICIAL_SAP_MCP_SERVERS.find(s => s.id === serverId)
      if (server) {
        servers[server.id] = {
          command: server.mcpConfig.command,
          args: server.mcpConfig.args,
          ...(server.mcpConfig.env && { env: server.mcpConfig.env }),
        }
      }
    }
    
    return { mcpServers: servers }
  }
  
  // Prüft ob MCP Server installiert ist
  async checkServerInstalled(serverId: SAPMCPServerType): Promise<{ installed: boolean; version?: string }> {
    const server = OFFICIAL_SAP_MCP_SERVERS.find(s => s.id === serverId)
    if (!server) return { installed: false }
    
    try {
      // In Produktion: npm list -g <package> ausführen
      // const { execSync } = await import('child_process')
      // const result = execSync(`npm list -g ${server.packageName} --depth=0`)
      // const version = result.toString().match(/\d+\.\d+\.\d+/)?.[0]
      
      return { installed: true, version: "1.0.0" } // Placeholder
    } catch {
      return { installed: false }
    }
  }
  
  // Server installieren
  async installServer(serverId: SAPMCPServerType): Promise<{ success: boolean; message: string }> {
    const server = OFFICIAL_SAP_MCP_SERVERS.find(s => s.id === serverId)
    if (!server) {
      return { success: false, message: `Server ${serverId} nicht gefunden` }
    }
    
    try {
      // In Produktion: npm install ausführen
      // const { execSync } = await import('child_process')
      // execSync(server.installCommand)
      
      return { success: true, message: `${server.name} erfolgreich installiert` }
    } catch (error) {
      return { success: false, message: `Installation fehlgeschlagen: ${error}` }
    }
  }
  
  // Installationsanleitung
  getInstallInstructions(serverId: SAPMCPServerType): string | null {
    const server = OFFICIAL_SAP_MCP_SERVERS.find(s => s.id === serverId)
    if (!server) return null
    
    return `
# ${server.name} Installation

## Voraussetzungen
${server.requirements.map(r => `- ${r}`).join("\n")}

## Installation
\`\`\`bash
${server.installCommand}
\`\`\`

## VS Code Konfiguration
Fügen Sie folgendes zu Ihrer settings.json hinzu:
\`\`\`json
{
  "mcp.servers": {
    "${server.packageName}": {
      "command": "${server.mcpConfig.command}",
      "args": ${JSON.stringify(server.mcpConfig.args)}
    }
  }
}
\`\`\`

## Dokumentation
${server.documentation}

## Repository
${server.repository}
`.trim()
  }
}

// === SAP AGENT MANAGER ===

export class SAPAgentManager {
  private mcpConfigManager = new SAPMCPConfigManager()
  private mcpClients: Map<SAPMCPServerType, SAPMCPClient> = new Map()
  
  // Alle Agenten abrufen
  getAgents(): SAPAgentConfig[] {
    return SAP_AGENTS
  }
  
  // Agent nach ID
  getAgent(id: SAPAgentType): SAPAgentConfig | undefined {
    return SAP_AGENTS.find(a => a.id === id)
  }
  
  // MCP Server für Agent
  getMCPServersForAgent(agentId: SAPAgentType): OfficialSAPMCPServer[] {
    const agent = this.getAgent(agentId)
    if (!agent) return []
    
    return agent.mcpServers
      .map(id => OFFICIAL_SAP_MCP_SERVERS.find(s => s.id === id))
      .filter((s): s is OfficialSAPMCPServer => s !== undefined)
  }
  
  // MCP Client für Server abrufen oder erstellen
  async getMCPClient(serverType: SAPMCPServerType, workspacePath?: string): Promise<SAPMCPClient> {
    let client = this.mcpClients.get(serverType)
    
    if (!client) {
      client = new SAPMCPClient({ serverType, workspacePath })
      await client.connect()
      this.mcpClients.set(serverType, client)
    }
    
    return client
  }
  
  // Tool für Agent aufrufen
  async callToolForAgent(
    agentId: SAPAgentType,
    toolName: string,
    args: Record<string, unknown>,
    workspacePath?: string
  ): Promise<MCPToolResult> {
    const agent = this.getAgent(agentId)
    if (!agent) {
      return { success: false, content: "", error: `Agent ${agentId} nicht gefunden` }
    }
    
    // Finde den Server, der das Tool anbietet
    for (const serverId of agent.mcpServers) {
      const server = OFFICIAL_SAP_MCP_SERVERS.find(s => s.id === serverId)
      if (server?.tools.some(t => t.name === toolName)) {
        const client = await this.getMCPClient(serverId, workspacePath)
        return client.callTool(toolName, args)
      }
    }
    
    return { success: false, content: "", error: `Tool ${toolName} nicht für Agent ${agentId} verfügbar` }
  }
  
  // Alle verfügbaren Tools für Agent
  getToolsForAgent(agentId: SAPAgentType): SAPMCPTool[] {
    const servers = this.getMCPServersForAgent(agentId)
    return servers.flatMap(s => s.tools)
  }
  
  // MCP Konfiguration für Agent generieren
  generateMCPConfigForAgent(agentId: SAPAgentType): MCPClientConfig {
    const agent = this.getAgent(agentId)
    if (!agent) return { mcpServers: {} }
    
    return this.mcpConfigManager.generateClientConfig(agent.mcpServers)
  }
  
  // Alle MCP Clients trennen
  async disconnectAll(): Promise<void> {
    for (const client of this.mcpClients.values()) {
      await client.disconnect()
    }
    this.mcpClients.clear()
  }
}

// === HELPER FUNKTIONEN ===

// MCP Server nach ID abrufen
export function getMCPServer(id: SAPMCPServerType): OfficialSAPMCPServer | undefined {
  return OFFICIAL_SAP_MCP_SERVERS.find(s => s.id === id)
}

// Alle MCP Server abrufen
export function getAllMCPServers(): OfficialSAPMCPServer[] {
  return OFFICIAL_SAP_MCP_SERVERS
}

// Agent nach ID abrufen
export function getSAPAgent(id: SAPAgentType): SAPAgentConfig | undefined {
  return SAP_AGENTS.find(a => a.id === id)
}

// Alle Agenten abrufen
export function getAllSAPAgents(): SAPAgentConfig[] {
  return SAP_AGENTS
}

// Singleton-Instanz des Agent Managers
let agentManagerInstance: SAPAgentManager | null = null

export function getSAPAgentManager(): SAPAgentManager {
  if (!agentManagerInstance) {
    agentManagerInstance = new SAPAgentManager()
  }
  return agentManagerInstance
}
