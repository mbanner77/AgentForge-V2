import { NextRequest, NextResponse } from "next/server"
import { spawn, ChildProcess } from "child_process"
import { OFFICIAL_SAP_MCP_SERVERS, type SAPMCPServerType } from "@/lib/sap-agents"

// MCP Request/Response Types
interface MCPRequest {
  jsonrpc: "2.0"
  id: number
  method: string
  params?: Record<string, unknown>
}

interface MCPResponse {
  jsonrpc: "2.0"
  id: number
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

// Active MCP Server processes
const activeProcesses: Map<string, ChildProcess> = new Map()

// Start MCP Server process
async function startMCPServer(serverType: SAPMCPServerType): Promise<ChildProcess | null> {
  const server = OFFICIAL_SAP_MCP_SERVERS.find(s => s.id === serverType)
  if (!server) return null

  // Check if already running
  if (activeProcesses.has(serverType)) {
    return activeProcesses.get(serverType) || null
  }

  try {
    const proc = spawn(server.mcpConfig.command, server.mcpConfig.args, {
      env: { ...process.env, ...server.mcpConfig.env },
      stdio: ["pipe", "pipe", "pipe"],
    })

    activeProcesses.set(serverType, proc)

    proc.on("exit", () => {
      activeProcesses.delete(serverType)
    })

    proc.on("error", (err) => {
      console.error(`MCP Server ${serverType} error:`, err)
      activeProcesses.delete(serverType)
    })

    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 1000))

    return proc
  } catch (error) {
    console.error(`Failed to start MCP Server ${serverType}:`, error)
    return null
  }
}

// Send request to MCP Server
async function sendMCPRequest(
  proc: ChildProcess,
  request: MCPRequest,
  timeout: number = 30000
): Promise<MCPResponse> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("MCP request timeout"))
    }, timeout)

    let responseData = ""

    const onData = (data: Buffer) => {
      responseData += data.toString()
      
      // Try to parse complete JSON response
      try {
        const lines = responseData.split("\n").filter(l => l.trim())
        for (const line of lines) {
          const parsed = JSON.parse(line)
          if (parsed.id === request.id) {
            clearTimeout(timer)
            proc.stdout?.off("data", onData)
            resolve(parsed)
            return
          }
        }
      } catch {
        // Not complete yet, continue buffering
      }
    }

    proc.stdout?.on("data", onData)
    proc.stdin?.write(JSON.stringify(request) + "\n")
  })
}

// POST /api/mcp/call - Call MCP Tool
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { serverType, toolName, args } = body as {
      serverType: SAPMCPServerType
      toolName: string
      args: Record<string, unknown>
    }

    // Validate server type
    const server = OFFICIAL_SAP_MCP_SERVERS.find(s => s.id === serverType)
    if (!server) {
      return NextResponse.json(
        { error: `Unknown server type: ${serverType}` },
        { status: 400 }
      )
    }

    // Validate tool
    const tool = server.tools.find(t => t.name === toolName)
    if (!tool) {
      return NextResponse.json(
        { error: `Unknown tool: ${toolName} for server ${serverType}` },
        { status: 400 }
      )
    }

    // Validate required parameters
    const required = tool.inputSchema.required || []
    for (const param of required) {
      if (args[param] === undefined) {
        return NextResponse.json(
          { error: `Missing required parameter: ${param}` },
          { status: 400 }
        )
      }
    }

    // Check if we're in development/demo mode
    const isDemoMode = process.env.MCP_DEMO_MODE === "true" || !process.env.NODE_ENV || process.env.NODE_ENV === "development"

    if (isDemoMode) {
      // Return simulated response for demo
      const simulatedResult = simulateToolCall(serverType, toolName, args)
      return NextResponse.json({
        success: true,
        result: simulatedResult,
        mode: "demo",
      })
    }

    // Production: Start real MCP Server
    const proc = await startMCPServer(serverType)
    if (!proc) {
      return NextResponse.json(
        { error: `Failed to start MCP server: ${serverType}` },
        { status: 500 }
      )
    }

    // Send MCP request
    const mcpRequest: MCPRequest = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
      },
    }

    const response = await sendMCPRequest(proc, mcpRequest)

    if (response.error) {
      return NextResponse.json(
        { error: response.error.message, code: response.error.code },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      result: response.result,
      mode: "production",
    })
  } catch (error) {
    console.error("MCP call error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

// GET /api/mcp/call - Get available tools for a server
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const serverType = searchParams.get("serverType") as SAPMCPServerType | null

  if (!serverType) {
    // Return all servers and their tools
    return NextResponse.json({
      servers: OFFICIAL_SAP_MCP_SERVERS.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        tools: s.tools,
      })),
    })
  }

  const server = OFFICIAL_SAP_MCP_SERVERS.find(s => s.id === serverType)
  if (!server) {
    return NextResponse.json(
      { error: `Unknown server type: ${serverType}` },
      { status: 400 }
    )
  }

  return NextResponse.json({
    id: server.id,
    name: server.name,
    description: server.description,
    tools: server.tools,
    requirements: server.requirements,
    installCommand: server.installCommand,
  })
}

// Simulate tool calls for demo mode
function simulateToolCall(
  serverType: SAPMCPServerType,
  toolName: string,
  args: Record<string, unknown>
): unknown {
  switch (serverType) {
    case "cap":
      return simulateCAPTool(toolName, args)
    case "ui5":
      return simulateUI5Tool(toolName, args)
    case "fiori":
      return simulateFioriTool(toolName, args)
    case "mdk":
      return simulateMDKTool(toolName, args)
    default:
      return { message: `Tool ${toolName} executed successfully` }
  }
}

function simulateCAPTool(toolName: string, args: Record<string, unknown>): unknown {
  switch (toolName) {
    case "search_model":
      return {
        results: [
          {
            type: "entity",
            name: "Books",
            file: "db/schema.cds",
            definition: `entity Books {
  key ID : UUID;
  title : String(100);
  author : Association to Authors;
  stock : Integer;
}`,
          },
          {
            type: "entity",
            name: "Authors",
            file: "db/schema.cds",
            definition: `entity Authors {
  key ID : UUID;
  name : String(100);
  books : Association to many Books on books.author = $self;
}`,
          },
        ],
        query: args.query,
      }
    case "search_docs":
      return {
        results: [
          {
            title: "Getting Started with CAP",
            content: "CAP (Cloud Application Programming) is SAP's recommended approach for building enterprise-grade services and applications.",
            relevance: 0.95,
          },
          {
            title: "CDS Modeling",
            content: "Core Data Services (CDS) is a declarative language for defining data models and services.",
            relevance: 0.88,
          },
        ],
        query: args.query,
      }
    default:
      return { success: true, tool: toolName }
  }
}

function simulateUI5Tool(toolName: string, args: Record<string, unknown>): unknown {
  switch (toolName) {
    case "create_ui5_app":
      return {
        success: true,
        projectPath: args.appName,
        files: [
          "webapp/manifest.json",
          "webapp/Component.js",
          "webapp/view/App.view.xml",
          "webapp/controller/App.controller.js",
          "ui5.yaml",
          "package.json",
        ],
        template: args.templateType,
      }
    case "get_api_reference":
      return {
        symbol: args.symbol,
        type: "class",
        description: `API reference for ${args.symbol}`,
        properties: [
          { name: "text", type: "string", description: "The text to display" },
          { name: "enabled", type: "boolean", description: "Whether the control is enabled" },
        ],
        methods: [
          { name: "setText", params: ["sText"], description: "Sets the text property" },
          { name: "getText", returns: "string", description: "Gets the text property" },
        ],
        events: [
          { name: "press", description: "Fired when the control is pressed" },
        ],
      }
    case "get_guidelines":
      return {
        topic: args.topic,
        guidelines: [
          "Use data binding instead of manual DOM manipulation",
          "Follow MVC pattern strictly",
          "Use i18n for all user-visible texts",
          "Implement proper error handling",
        ],
      }
    default:
      return { success: true, tool: toolName }
  }
}

function simulateFioriTool(toolName: string, args: Record<string, unknown>): unknown {
  switch (toolName) {
    case "search_fiori_docs":
      return {
        results: [
          {
            title: "Fiori Elements List Report",
            content: "List Report floorplan for displaying collections of items with filtering capabilities.",
            relevance: 0.92,
          },
        ],
        query: args.query,
      }
    case "generate_fiori_app":
      return {
        success: true,
        projectPath: args.projectPath,
        template: args.templateType,
        files: [
          "webapp/manifest.json",
          "webapp/Component.js",
          "webapp/localService/metadata.xml",
          "webapp/annotations/annotation.xml",
        ],
      }
    case "add_annotation":
      return {
        success: true,
        annotationType: args.annotationType,
        file: "webapp/annotations/annotation.xml",
      }
    default:
      return { success: true, tool: toolName }
  }
}

function simulateMDKTool(toolName: string, args: Record<string, unknown>): unknown {
  switch (toolName) {
    case "mdk-gen-project":
      return {
        success: true,
        projectPath: args.folderRootPath,
        template: args.templateType || "empty",
        offline: args.offline === "true",
        files: [
          "Application.app",
          "Actions/",
          "Pages/",
          "Rules/",
          "Globals/",
          "i18n/",
        ],
      }
    case "mdk-gen-entity":
      return {
        success: true,
        entitySets: args.oDataEntitySets,
        generatedPages: ["List.page", "Detail.page", "Create.page", "Edit.page"],
      }
    case "mdk-docs":
      return {
        operation: args.operation,
        results: [
          {
            title: "MDK Application Structure",
            content: "An MDK application consists of metadata files defining the UI and behavior.",
          },
        ],
      }
    default:
      return { success: true, tool: toolName }
  }
}
