// MCP Configuration - Zentrale Konfiguration für MCP Server

export type MCPMode = "demo" | "production"

export interface MCPConfig {
  mode: MCPMode
  timeout: number
  retryAttempts: number
  logLevel: "debug" | "info" | "warn" | "error"
}

// Default configuration
const defaultConfig: MCPConfig = {
  mode: "demo",
  timeout: 30000,
  retryAttempts: 3,
  logLevel: "info",
}

// Get MCP mode from environment or localStorage
export function getMCPMode(): MCPMode {
  // Server-side: Check environment variable
  if (typeof window === "undefined") {
    const envMode = process.env.MCP_MODE || process.env.NEXT_PUBLIC_MCP_MODE
    if (envMode === "production") return "production"
    if (envMode === "demo") return "demo"
    
    // Default to demo in development
    if (process.env.NODE_ENV === "development") return "demo"
    
    return "demo"
  }
  
  // Client-side: Check localStorage first, then env
  try {
    const storedMode = localStorage.getItem("mcp_mode")
    if (storedMode === "production" || storedMode === "demo") {
      return storedMode
    }
  } catch {
    // localStorage not available
  }
  
  // Fallback to environment variable
  const envMode = process.env.NEXT_PUBLIC_MCP_MODE
  if (envMode === "production") return "production"
  
  return "demo"
}

// Set MCP mode (client-side only)
export function setMCPMode(mode: MCPMode): void {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("mcp_mode", mode)
    } catch {
      // localStorage not available
    }
  }
}

// Get full MCP configuration
export function getMCPConfig(): MCPConfig {
  return {
    ...defaultConfig,
    mode: getMCPMode(),
  }
}

// Check if production mode is enabled
export function isProductionMode(): boolean {
  return getMCPMode() === "production"
}

// Check if demo mode is enabled
export function isDemoMode(): boolean {
  return getMCPMode() === "demo"
}

// MCP Server status
export interface MCPServerStatus {
  id: string
  name: string
  installed: boolean
  running: boolean
  version?: string
  error?: string
}

// Check if MCP server is installed (server-side only)
export async function checkMCPServerInstalled(npmPackage: string): Promise<{ installed: boolean; version?: string }> {
  if (typeof window !== "undefined") {
    return { installed: false }
  }
  
  try {
    const { execSync } = await import("child_process")
    const result = execSync(`npm list -g ${npmPackage} --depth=0 2>/dev/null`, { encoding: "utf-8" })
    const versionMatch = result.match(/\d+\.\d+\.\d+/)
    return { 
      installed: true, 
      version: versionMatch ? versionMatch[0] : undefined 
    }
  } catch {
    return { installed: false }
  }
}

// Environment variable documentation
export const MCP_ENV_VARS = {
  MCP_MODE: {
    name: "MCP_MODE",
    description: "MCP Betriebsmodus: 'demo' für simulierte Responses, 'production' für echte MCP Server",
    values: ["demo", "production"],
    default: "demo",
    required: false,
  },
  NEXT_PUBLIC_MCP_MODE: {
    name: "NEXT_PUBLIC_MCP_MODE",
    description: "Client-seitig verfügbarer MCP Modus",
    values: ["demo", "production"],
    default: "demo",
    required: false,
  },
  // Database connections
  POSTGRES_URL: {
    name: "POSTGRES_URL",
    description: "PostgreSQL Connection String für MCP PostgreSQL Server",
    example: "postgresql://user:password@localhost:5432/database",
    required: false,
  },
  REDIS_URL: {
    name: "REDIS_URL",
    description: "Redis Connection URL für MCP Redis Server",
    example: "redis://localhost:6379",
    required: false,
  },
  MONGODB_URI: {
    name: "MONGODB_URI",
    description: "MongoDB Connection String für MCP MongoDB Server",
    example: "mongodb://localhost:27017/database",
    required: false,
  },
  // API Keys
  BRAVE_API_KEY: {
    name: "BRAVE_API_KEY",
    description: "Brave Search API Key für Web-Suche",
    required: false,
  },
  GITHUB_TOKEN: {
    name: "GITHUB_TOKEN",
    description: "GitHub Personal Access Token für Repository-Operationen",
    required: false,
  },
  GITLAB_TOKEN: {
    name: "GITLAB_TOKEN",
    description: "GitLab Personal Access Token",
    required: false,
  },
  SLACK_TOKEN: {
    name: "SLACK_TOKEN",
    description: "Slack Bot Token für Slack-Integration",
    required: false,
  },
  LINEAR_API_KEY: {
    name: "LINEAR_API_KEY",
    description: "Linear API Key für Issue Tracking",
    required: false,
  },
  NOTION_TOKEN: {
    name: "NOTION_TOKEN",
    description: "Notion Integration Token",
    required: false,
  },
}

// Generate .env.local template
export function generateEnvTemplate(): string {
  return `# =============================================================================
# AgentForge MCP Configuration
# =============================================================================

# MCP Betriebsmodus: demo | production
# demo = Simulierte Responses (für Entwicklung)
# production = Echte MCP Server Aufrufe
MCP_MODE=production
NEXT_PUBLIC_MCP_MODE=production

# =============================================================================
# Datenbank Verbindungen (für MCP Database Server)
# =============================================================================

# PostgreSQL
# POSTGRES_URL=postgresql://user:password@localhost:5432/database

# Redis
# REDIS_URL=redis://localhost:6379

# MongoDB
# MONGODB_URI=mongodb://localhost:27017/database

# SQLite (Pfad zur Datenbankdatei)
# SQLITE_PATH=./data/database.db

# =============================================================================
# API Keys für externe Services
# =============================================================================

# Brave Search API
# BRAVE_API_KEY=your_brave_api_key

# GitHub Personal Access Token
# GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx

# GitLab Personal Access Token
# GITLAB_TOKEN=glpat-xxxxxxxxxxxxxxxxxxxx

# Slack Bot Token
# SLACK_TOKEN=xoxb-xxxxxxxxxxxxxxxxxxxx

# Linear API Key
# LINEAR_API_KEY=lin_api_xxxxxxxxxxxxxxxxxxxx

# Notion Integration Token
# NOTION_TOKEN=secret_xxxxxxxxxxxxxxxxxxxx

# =============================================================================
# SAP MCP Server Konfiguration
# =============================================================================

# CAP Projekt Pfad
# CDS_PROJECT_PATH=./sap-project

# =============================================================================
# Filesystem MCP Server
# =============================================================================

# Erlaubtes Root-Verzeichnis für Dateizugriff
# MCP_FILESYSTEM_ROOT=./workspace

# Schreibzugriff erlauben (true/false)
# MCP_FILESYSTEM_ALLOW_WRITE=true
`
}
