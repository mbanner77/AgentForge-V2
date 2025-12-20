import { NextRequest, NextResponse } from "next/server"
import { mcpServers } from "@/lib/mcp-servers"
import { getMCPMode } from "@/lib/mcp-config"
import { execSync } from "child_process"

// Call real MCP server via npx or local node_modules (Production mode)
async function callRealMCPServer(
  npmPackage: string,
  capability: string,
  args: Record<string, unknown>,
  config: Record<string, unknown>
): Promise<unknown> {
  // Build environment variables from config
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const [key, value] of Object.entries(config)) {
    env[`MCP_${key.toUpperCase()}`] = String(value)
  }

  // Build MCP request
  const request = {
    jsonrpc: "2.0",
    id: Date.now(),
    method: "tools/call",
    params: {
      name: capability,
      arguments: args,
    },
  }

  try {
    const requestJson = JSON.stringify(request)
    
    // Try local node_modules first (for Render deployment), then npx
    let command: string
    const isRender = process.env.RENDER === "true" || process.env.IS_PULL_REQUEST !== undefined
    
    if (isRender) {
      // On Render: Use local node_modules (installed via optionalDependencies)
      command = `echo '${requestJson.replace(/'/g, "'\\''")}' | node node_modules/${npmPackage}/dist/index.js 2>/dev/null || echo '${requestJson.replace(/'/g, "'\\''")}' | npx -y ${npmPackage}`
    } else {
      // Local development: Use npx
      command = `echo '${requestJson.replace(/'/g, "'\\''")}' | npx -y ${npmPackage}`
    }
    
    const result = execSync(command, {
      env,
      timeout: 30000,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024, // 10MB
      shell: "/bin/bash",
    })

    // Parse response
    const lines = result.split("\n").filter(l => l.trim())
    for (const line of lines) {
      try {
        const response = JSON.parse(line)
        if (response.result) {
          return response.result
        }
        if (response.error) {
          throw new Error(response.error.message || "MCP error")
        }
      } catch {
        // Not valid JSON, continue
      }
    }

    // Return raw output if no JSON response
    return { raw: result }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`MCP server error: ${error.message}`)
    }
    throw error
  }
}

// Simulate tool calls for demo mode
function simulateToolCall(serverId: string, capability: string, args: Record<string, unknown>): unknown {
  switch (serverId) {
    case "filesystem":
      return simulateFilesystem(capability, args)
    case "git":
      return simulateGit(capability, args)
    case "postgres":
    case "sqlite":
    case "mongodb":
      return simulateDatabase(serverId, capability, args)
    case "github":
      return simulateGitHub(capability, args)
    case "slack":
      return simulateSlack(capability, args)
    case "brave-search":
    case "fetch":
      return simulateSearch(serverId, capability, args)
    case "puppeteer":
      return simulatePuppeteer(capability, args)
    default:
      return { success: true, message: `${capability} executed on ${serverId}`, args }
  }
}

function simulateFilesystem(capability: string, args: Record<string, unknown>): unknown {
  switch (capability) {
    case "read_file":
      return {
        path: args.path,
        content: `// Simulated content of ${args.path}\nconsole.log("Hello World");`,
        size: 45,
      }
    case "write_file":
      return { success: true, path: args.path, bytesWritten: String(args.content || "").length }
    case "list_directory":
      return {
        path: args.path,
        entries: [
          { name: "src", type: "directory" },
          { name: "package.json", type: "file", size: 1024 },
          { name: "README.md", type: "file", size: 2048 },
        ],
      }
    case "create_directory":
      return { success: true, path: args.path }
    case "delete_file":
      return { success: true, path: args.path }
    default:
      return { success: true, capability }
  }
}

function simulateGit(capability: string, args: Record<string, unknown>): unknown {
  switch (capability) {
    case "git_status":
      return {
        branch: "main",
        staged: ["src/index.ts"],
        modified: ["README.md"],
        untracked: ["temp.log"],
      }
    case "git_commit":
      return {
        success: true,
        commitHash: "abc123def456",
        message: args.message,
        filesChanged: 3,
      }
    case "git_push":
      return { success: true, remote: "origin", branch: "main" }
    case "git_pull":
      return { success: true, filesUpdated: 2, conflicts: [] }
    case "git_branch":
      return {
        current: "main",
        branches: ["main", "develop", "feature/new-ui"],
      }
    case "git_diff":
      return {
        files: [
          { path: "src/index.ts", additions: 10, deletions: 3 },
        ],
      }
    default:
      return { success: true, capability }
  }
}

function simulateDatabase(serverId: string, capability: string, args: Record<string, unknown>): unknown {
  switch (capability) {
    case "query":
      return {
        rows: [
          { id: 1, name: "Item 1", created_at: "2024-01-01" },
          { id: 2, name: "Item 2", created_at: "2024-01-02" },
        ],
        rowCount: 2,
        duration: "12ms",
      }
    case "schema_inspect":
      return {
        tables: [
          { name: "users", columns: ["id", "email", "name", "created_at"] },
          { name: "orders", columns: ["id", "user_id", "total", "status"] },
        ],
      }
    case "table_list":
      return { tables: ["users", "orders", "products", "categories"] }
    case "insert":
      return { success: true, insertedId: 123 }
    case "update":
      return { success: true, affectedRows: 1 }
    case "delete":
      return { success: true, affectedRows: 1 }
    default:
      return { success: true, capability, database: serverId }
  }
}

function simulateGitHub(capability: string, args: Record<string, unknown>): unknown {
  switch (capability) {
    case "create_repo":
      return {
        success: true,
        name: args.name,
        url: `https://github.com/user/${args.name}`,
        private: args.private || false,
      }
    case "create_issue":
      return {
        success: true,
        number: 42,
        title: args.title,
        url: `https://github.com/user/repo/issues/42`,
      }
    case "create_pr":
      return {
        success: true,
        number: 15,
        title: args.title,
        url: `https://github.com/user/repo/pull/15`,
      }
    case "list_repos":
      return {
        repos: [
          { name: "project-a", stars: 120, language: "TypeScript" },
          { name: "project-b", stars: 45, language: "Python" },
        ],
      }
    case "search_code":
      return {
        results: [
          { file: "src/index.ts", line: 42, match: args.query },
        ],
      }
    default:
      return { success: true, capability }
  }
}

function simulateSlack(capability: string, args: Record<string, unknown>): unknown {
  switch (capability) {
    case "send_message":
      return {
        success: true,
        channel: args.channel,
        timestamp: Date.now().toString(),
        messageId: "msg_123",
      }
    case "list_channels":
      return {
        channels: [
          { id: "C123", name: "general" },
          { id: "C456", name: "development" },
        ],
      }
    case "get_thread":
      return {
        messages: [
          { user: "U123", text: "Hello", timestamp: "1234567890" },
        ],
      }
    default:
      return { success: true, capability }
  }
}

function simulateSearch(serverId: string, capability: string, args: Record<string, unknown>): unknown {
  switch (capability) {
    case "web_search":
      return {
        query: args.query,
        results: [
          { title: "Result 1", url: "https://example.com/1", snippet: "..." },
          { title: "Result 2", url: "https://example.com/2", snippet: "..." },
        ],
      }
    case "fetch_url":
      return {
        url: args.url,
        title: "Page Title",
        content: "# Markdown Content\n\nThis is the page content...",
        links: ["https://example.com/link1", "https://example.com/link2"],
      }
    default:
      return { success: true, capability, serverId }
  }
}

function simulatePuppeteer(capability: string, args: Record<string, unknown>): unknown {
  switch (capability) {
    case "screenshot":
      return {
        success: true,
        url: args.url,
        path: `/tmp/screenshot_${Date.now()}.png`,
        dimensions: { width: 1920, height: 1080 },
      }
    case "navigate":
      return { success: true, url: args.url, title: "Page Title" }
    case "click":
      return { success: true, selector: args.selector }
    case "type":
      return { success: true, selector: args.selector, text: args.text }
    case "evaluate":
      return { success: true, result: "Evaluated result" }
    default:
      return { success: true, capability }
  }
}

// POST /api/mcp/general - Call any MCP Tool
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { serverId, capability, args, config } = body as {
      serverId: string
      capability: string
      args: Record<string, unknown>
      config?: Record<string, unknown>
    }

    // Find server
    const server = mcpServers.find(s => s.id === serverId)
    if (!server) {
      return NextResponse.json(
        { error: `Unknown server: ${serverId}` },
        { status: 400 }
      )
    }

    // Validate capability
    if (!server.capabilities.includes(capability)) {
      return NextResponse.json(
        { error: `Unknown capability: ${capability} for server ${serverId}. Available: ${server.capabilities.join(", ")}` },
        { status: 400 }
      )
    }

    // Check MCP mode
    const mcpMode = getMCPMode()
    
    if (mcpMode === "demo") {
      // Demo mode: Use simulated responses
      const result = simulateToolCall(serverId, capability, args || {})
      return NextResponse.json({
        success: true,
        result,
        mode: "demo",
        server: server.name,
        capability,
        npmPackage: server.npmPackage,
        hint: server.npmPackage 
          ? `Für Production: npm install -g ${server.npmPackage}` 
          : "Kein npm Package verfügbar",
      })
    }
    
    // Production mode: Call real MCP server
    if (!server.npmPackage) {
      return NextResponse.json(
        { error: `Server ${serverId} hat kein npm Package für Production` },
        { status: 400 }
      )
    }
    
    try {
      const result = await callRealMCPServer(server.npmPackage, capability, args || {}, config || {})
      return NextResponse.json({
        success: true,
        result,
        mode: "production",
        server: server.name,
        capability,
      })
    } catch (error) {
      // Fallback to demo mode on error
      console.error(`MCP Production Error for ${serverId}:`, error)
      const result = simulateToolCall(serverId, capability, args || {})
      return NextResponse.json({
        success: true,
        result,
        mode: "demo",
        server: server.name,
        capability,
        warning: `Production-Aufruf fehlgeschlagen, Demo-Mode verwendet: ${error instanceof Error ? error.message : "Unknown error"}`,
      })
    }
  } catch (error) {
    console.error("MCP call error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

// GET /api/mcp/general - List all servers and their capabilities
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const serverId = searchParams.get("serverId")
  const category = searchParams.get("category")

  if (serverId) {
    const server = mcpServers.find(s => s.id === serverId)
    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 })
    }
    return NextResponse.json({
      id: server.id,
      name: server.name,
      description: server.description,
      category: server.category,
      capabilities: server.capabilities,
      configSchema: server.configSchema,
      npmPackage: server.npmPackage,
      isOfficial: server.isOfficial,
    })
  }

  let servers = mcpServers
  if (category) {
    servers = servers.filter(s => s.category === category)
  }

  return NextResponse.json({
    servers: servers.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      category: s.category,
      capabilities: s.capabilities,
      isOfficial: s.isOfficial,
    })),
    categories: [...new Set(mcpServers.map(s => s.category))],
    totalServers: mcpServers.length,
  })
}
