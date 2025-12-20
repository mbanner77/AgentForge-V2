// SAP MCP Executor - Führt MCP Tool-Calls für SAP Agenten aus

import { 
  SAP_AGENTS, 
  OFFICIAL_SAP_MCP_SERVERS, 
  type SAPAgentType, 
  type SAPMCPServerType,
  type MCPToolResult 
} from "./sap-agents"

export interface SAPMCPCallOptions {
  serverType: SAPMCPServerType
  toolName: string
  args: Record<string, unknown>
}

export interface SAPMCPCallResult {
  success: boolean
  result?: unknown
  error?: string
  mode: "demo" | "production"
}

// Call SAP MCP Tool via API
export async function callSAPMCPTool(options: SAPMCPCallOptions): Promise<SAPMCPCallResult> {
  try {
    const response = await fetch("/api/mcp/call", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(options),
    })

    if (!response.ok) {
      const error = await response.json()
      return {
        success: false,
        error: error.error || `HTTP ${response.status}`,
        mode: "demo",
      }
    }

    const data = await response.json()
    return {
      success: data.success,
      result: data.result,
      mode: data.mode,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      mode: "demo",
    }
  }
}

// Get available tools for an SAP agent
export function getSAPAgentTools(agentId: SAPAgentType): string[] {
  const agent = SAP_AGENTS.find(a => a.id === agentId)
  if (!agent) return []

  const tools: string[] = []
  for (const serverId of agent.mcpServers) {
    const server = OFFICIAL_SAP_MCP_SERVERS.find(s => s.id === serverId)
    if (server) {
      tools.push(...server.tools.map(t => t.name))
    }
  }
  return tools
}

// Get MCP server for a tool
export function getMCPServerForTool(toolName: string): SAPMCPServerType | null {
  for (const server of OFFICIAL_SAP_MCP_SERVERS) {
    if (server.tools.some(t => t.name === toolName)) {
      return server.id
    }
  }
  return null
}

// Execute SAP agent with MCP tools
export async function executeSAPAgentWithMCP(
  agentId: SAPAgentType,
  prompt: string,
  apiKey: string,
  model: string = "gpt-4o"
): Promise<{
  response: string
  mcpCalls: Array<{ tool: string; result: SAPMCPCallResult }>
}> {
  const agent = SAP_AGENTS.find(a => a.id === agentId)
  if (!agent) {
    return {
      response: `Agent ${agentId} nicht gefunden`,
      mcpCalls: [],
    }
  }

  // Get available tools for this agent
  const availableTools = getSAPAgentTools(agentId)
  
  // Build system prompt with MCP tool information
  const mcpToolsInfo = agent.mcpServers
    .map(serverId => {
      const server = OFFICIAL_SAP_MCP_SERVERS.find(s => s.id === serverId)
      if (!server) return ""
      return `## ${server.name}\n${server.tools.map(t => `- ${t.name}: ${t.description}`).join("\n")}`
    })
    .filter(Boolean)
    .join("\n\n")

  const systemPrompt = `${agent.systemPrompt}

## Verfügbare MCP Tools
${mcpToolsInfo}

Wenn du ein MCP Tool verwenden möchtest, antworte mit:
[MCP_CALL: toolName({"param": "value"})]

Der Tool-Aufruf wird ausgeführt und du erhältst das Ergebnis.`

  // Call LLM
  const llmResponse = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      model,
      apiKey,
    }),
  })

  if (!llmResponse.ok) {
    return {
      response: "LLM Fehler: " + (await llmResponse.text()),
      mcpCalls: [],
    }
  }

  const llmData = await llmResponse.json()
  let responseText = llmData.content || llmData.choices?.[0]?.message?.content || ""

  // Parse and execute MCP calls
  const mcpCalls: Array<{ tool: string; result: SAPMCPCallResult }> = []
  const mcpCallRegex = /\[MCP_CALL:\s*(\w+)\(({[^}]+})\)\]/g
  let match

  while ((match = mcpCallRegex.exec(responseText)) !== null) {
    const toolName = match[1]
    let args: Record<string, unknown> = {}
    
    try {
      args = JSON.parse(match[2])
    } catch {
      continue
    }

    const serverType = getMCPServerForTool(toolName)
    if (!serverType) continue

    const result = await callSAPMCPTool({
      serverType,
      toolName,
      args,
    })

    mcpCalls.push({ tool: toolName, result })

    // Replace MCP call with result in response
    const resultText = result.success
      ? `\n**${toolName} Ergebnis:**\n\`\`\`json\n${JSON.stringify(result.result, null, 2)}\n\`\`\`\n`
      : `\n**${toolName} Fehler:** ${result.error}\n`

    responseText = responseText.replace(match[0], resultText)
  }

  return {
    response: responseText,
    mcpCalls,
  }
}

// Get SAP agent info for UI display
export function getSAPAgentInfo(agentId: SAPAgentType) {
  const agent = SAP_AGENTS.find(a => a.id === agentId)
  if (!agent) return null

  const mcpServers = agent.mcpServers.map(serverId => {
    const server = OFFICIAL_SAP_MCP_SERVERS.find(s => s.id === serverId)
    return server ? {
      id: server.id,
      name: server.name,
      tools: server.tools.map(t => t.name),
    } : null
  }).filter(Boolean)

  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    icon: agent.icon,
    capabilities: agent.capabilities,
    mcpServers,
  }
}

// Check if agent is SAP agent
export function isSAPAgent(agentType: string): agentType is SAPAgentType {
  return SAP_AGENTS.some(a => a.id === agentType)
}
