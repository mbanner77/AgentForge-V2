// MCP Executor - Ermöglicht Agenten die Nutzung aller MCP Server

import { mcpServers, type MCPServer } from "./mcp-servers"

export interface MCPCallOptions {
  serverId: string
  capability: string
  args?: Record<string, unknown>
}

export interface MCPCallResult {
  success: boolean
  result?: unknown
  error?: string
  server: string
  capability: string
  mode: "demo" | "production"
}

// Call any MCP Tool via API
export async function callMCPTool(options: MCPCallOptions): Promise<MCPCallResult> {
  try {
    const response = await fetch("/api/mcp/general", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    })

    if (!response.ok) {
      const error = await response.json()
      return {
        success: false,
        error: error.error || `HTTP ${response.status}`,
        server: options.serverId,
        capability: options.capability,
        mode: "demo",
      }
    }

    const data = await response.json()
    return {
      success: data.success,
      result: data.result,
      server: data.server,
      capability: data.capability,
      mode: data.mode,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      server: options.serverId,
      capability: options.capability,
      mode: "demo",
    }
  }
}

// Get MCP server by ID
export function getMCPServer(serverId: string): MCPServer | undefined {
  return mcpServers.find(s => s.id === serverId)
}

// Get all capabilities for a server
export function getServerCapabilities(serverId: string): string[] {
  const server = getMCPServer(serverId)
  return server?.capabilities || []
}

// Get servers by category
export function getServersByCategory(category: MCPServer["category"]): MCPServer[] {
  return mcpServers.filter(s => s.category === category)
}

// Check if capability exists for server
export function hasCapability(serverId: string, capability: string): boolean {
  const server = getMCPServer(serverId)
  return server?.capabilities.includes(capability) || false
}

// Find server that has a specific capability
export function findServerWithCapability(capability: string): MCPServer | undefined {
  return mcpServers.find(s => s.capabilities.includes(capability))
}

// MCP Tool definitions for LLM function calling
export interface MCPToolDefinition {
  name: string
  description: string
  server: string
  parameters: {
    type: "object"
    properties: Record<string, { type: string; description: string }>
    required?: string[]
  }
}

// Generate tool definitions for LLM
export function generateMCPToolDefinitions(serverIds?: string[]): MCPToolDefinition[] {
  const servers = serverIds 
    ? mcpServers.filter(s => serverIds.includes(s.id))
    : mcpServers

  const tools: MCPToolDefinition[] = []

  for (const server of servers) {
    for (const capability of server.capabilities) {
      tools.push({
        name: `${server.id}_${capability}`,
        description: `${server.name}: ${capability}`,
        server: server.id,
        parameters: {
          type: "object",
          properties: getCapabilityParameters(server.id, capability),
        },
      })
    }
  }

  return tools
}

// Get parameters for a capability
function getCapabilityParameters(serverId: string, capability: string): Record<string, { type: string; description: string }> {
  // Common parameters based on capability patterns
  const parameterMap: Record<string, Record<string, { type: string; description: string }>> = {
    // Filesystem
    read_file: { path: { type: "string", description: "Dateipfad" } },
    write_file: { path: { type: "string", description: "Dateipfad" }, content: { type: "string", description: "Dateiinhalt" } },
    list_directory: { path: { type: "string", description: "Verzeichnispfad" } },
    create_directory: { path: { type: "string", description: "Verzeichnispfad" } },
    delete_file: { path: { type: "string", description: "Dateipfad" } },
    
    // Git
    git_commit: { message: { type: "string", description: "Commit-Nachricht" } },
    git_push: { remote: { type: "string", description: "Remote Name" }, branch: { type: "string", description: "Branch Name" } },
    git_clone: { url: { type: "string", description: "Repository URL" } },
    git_branch: { name: { type: "string", description: "Branch Name" } },
    
    // Database
    query: { sql: { type: "string", description: "SQL Query" } },
    insert: { table: { type: "string", description: "Tabelle" }, data: { type: "object", description: "Daten" } },
    update: { table: { type: "string", description: "Tabelle" }, data: { type: "object", description: "Daten" }, where: { type: "string", description: "WHERE Bedingung" } },
    delete: { table: { type: "string", description: "Tabelle" }, where: { type: "string", description: "WHERE Bedingung" } },
    
    // Search
    web_search: { query: { type: "string", description: "Suchanfrage" } },
    fetch_url: { url: { type: "string", description: "URL" } },
    
    // GitHub
    create_repo: { name: { type: "string", description: "Repository Name" }, private: { type: "boolean", description: "Privat?" } },
    create_issue: { title: { type: "string", description: "Issue Titel" }, body: { type: "string", description: "Issue Text" } },
    create_pr: { title: { type: "string", description: "PR Titel" }, head: { type: "string", description: "Head Branch" }, base: { type: "string", description: "Base Branch" } },
    
    // Slack
    send_message: { channel: { type: "string", description: "Channel Name oder ID" }, text: { type: "string", description: "Nachricht" } },
    
    // Puppeteer
    screenshot: { url: { type: "string", description: "URL" } },
    navigate: { url: { type: "string", description: "URL" } },
    click: { selector: { type: "string", description: "CSS Selector" } },
    type: { selector: { type: "string", description: "CSS Selector" }, text: { type: "string", description: "Text" } },
  }

  return parameterMap[capability] || {}
}

// Execute MCP tool from LLM tool call
export async function executeMCPToolCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<MCPCallResult> {
  // Parse tool name (format: serverId_capability)
  const parts = toolName.split("_")
  if (parts.length < 2) {
    return {
      success: false,
      error: `Invalid tool name format: ${toolName}`,
      server: "unknown",
      capability: toolName,
      mode: "demo",
    }
  }

  const serverId = parts[0]
  const capability = parts.slice(1).join("_")

  return callMCPTool({ serverId, capability, args })
}

// Build system prompt with MCP tools info
export function buildMCPSystemPrompt(serverIds?: string[]): string {
  const servers = serverIds 
    ? mcpServers.filter(s => serverIds.includes(s.id))
    : mcpServers

  const toolsInfo = servers.map(server => {
    const capabilities = server.capabilities.map(c => `  - ${c}`).join("\n")
    return `## ${server.name} (${server.id})\n${server.description}\nCapabilities:\n${capabilities}`
  }).join("\n\n")

  return `Du hast Zugriff auf folgende MCP Server und deren Funktionen:

${toolsInfo}

Um ein MCP Tool zu verwenden, antworte mit:
[MCP_CALL: serverId.capability({"param": "value"})]

Beispiele:
- [MCP_CALL: filesystem.read_file({"path": "src/index.ts"})]
- [MCP_CALL: git.git_status({})]
- [MCP_CALL: postgres.query({"sql": "SELECT * FROM users"})]
- [MCP_CALL: github.create_issue({"title": "Bug Report", "body": "..."})]

Die Tool-Aufrufe werden ausgeführt und du erhältst das Ergebnis.`
}

// Parse MCP calls from LLM response
export function parseMCPCalls(response: string): Array<{ serverId: string; capability: string; args: Record<string, unknown> }> {
  const calls: Array<{ serverId: string; capability: string; args: Record<string, unknown> }> = []
  const regex = /\[MCP_CALL:\s*(\w+)\.(\w+)\(({[^}]*})\)\]/g
  let match

  while ((match = regex.exec(response)) !== null) {
    try {
      calls.push({
        serverId: match[1],
        capability: match[2],
        args: JSON.parse(match[3]),
      })
    } catch {
      // Invalid JSON, skip
    }
  }

  return calls
}

// Execute all MCP calls in a response and replace with results
export async function executeMCPCallsInResponse(response: string): Promise<{
  response: string
  calls: Array<{ serverId: string; capability: string; result: MCPCallResult }>
}> {
  const calls = parseMCPCalls(response)
  const results: Array<{ serverId: string; capability: string; result: MCPCallResult }> = []
  let updatedResponse = response

  for (const call of calls) {
    const result = await callMCPTool({
      serverId: call.serverId,
      capability: call.capability,
      args: call.args,
    })

    results.push({
      serverId: call.serverId,
      capability: call.capability,
      result,
    })

    // Replace call with result
    const callPattern = `[MCP_CALL: ${call.serverId}.${call.capability}(${JSON.stringify(call.args)})]`
    const resultText = result.success
      ? `\n**${call.serverId}.${call.capability} Ergebnis:**\n\`\`\`json\n${JSON.stringify(result.result, null, 2)}\n\`\`\`\n`
      : `\n**${call.serverId}.${call.capability} Fehler:** ${result.error}\n`

    updatedResponse = updatedResponse.replace(callPattern, resultText)
  }

  return { response: updatedResponse, calls: results }
}

// Get summary of available MCP servers
export function getMCPServersSummary(): Array<{
  id: string
  name: string
  category: string
  capabilities: number
  isOfficial: boolean
}> {
  return mcpServers.map(s => ({
    id: s.id,
    name: s.name,
    category: s.category,
    capabilities: s.capabilities.length,
    isOfficial: s.isOfficial,
  }))
}
