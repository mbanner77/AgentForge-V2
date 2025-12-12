// MCP (Model Context Protocol) Server Marketplace
// Basierend auf https://github.com/modelcontextprotocol/servers

export interface MCPServer {
  id: string
  name: string
  description: string
  category: "filesystem" | "database" | "api" | "search" | "productivity" | "development" | "ai" | "cloud" | "communication" | "other"
  icon: string
  color: string
  author: string
  repository: string
  npmPackage?: string
  dockerImage?: string
  configSchema?: MCPConfigField[]
  capabilities: string[]
  isInstalled: boolean
  isOfficial: boolean
  stars: number
  version: string
}

export interface MCPConfigField {
  name: string
  type: "string" | "number" | "boolean" | "select" | "password"
  label: string
  description: string
  required: boolean
  default?: string | number | boolean
  options?: { value: string; label: string }[]
}

export interface InstalledMCPServer extends MCPServer {
  config: Record<string, string | number | boolean>
  status: "active" | "inactive" | "error"
  lastUsed?: Date
}

// Vordefinierte MCP-Server aus dem offiziellen Repository
export const mcpServers: MCPServer[] = [
  // Filesystem & Local
  {
    id: "filesystem",
    name: "Filesystem",
    description: "Sicherer Dateisystem-Zugriff mit konfigurierbaren Berechtigungen. Lesen, Schreiben und Verwalten von Dateien.",
    category: "filesystem",
    icon: "FolderOpen",
    color: "text-blue-500",
    author: "Anthropic",
    repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
    npmPackage: "@modelcontextprotocol/server-filesystem",
    capabilities: ["read_file", "write_file", "list_directory", "create_directory", "delete_file", "move_file"],
    isInstalled: false,
    isOfficial: true,
    stars: 5200,
    version: "1.0.0",
    configSchema: [
      { name: "rootPath", type: "string", label: "Root-Verzeichnis", description: "Basis-Verzeichnis für Dateizugriff", required: true, default: "./" },
      { name: "allowWrite", type: "boolean", label: "Schreibzugriff", description: "Erlaube Schreiboperationen", required: false, default: false },
    ],
  },
  {
    id: "git",
    name: "Git",
    description: "Git-Repository-Operationen: Clone, Commit, Push, Pull, Branch-Management und mehr.",
    category: "development",
    icon: "GitBranch",
    color: "text-orange-500",
    author: "Anthropic",
    repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/git",
    npmPackage: "@modelcontextprotocol/server-git",
    capabilities: ["git_clone", "git_commit", "git_push", "git_pull", "git_branch", "git_status", "git_diff"],
    isInstalled: false,
    isOfficial: true,
    stars: 4800,
    version: "1.0.0",
    configSchema: [
      { name: "repoPath", type: "string", label: "Repository-Pfad", description: "Pfad zum Git-Repository", required: true },
    ],
  },

  // Databases
  {
    id: "postgres",
    name: "PostgreSQL",
    description: "PostgreSQL-Datenbankzugriff mit Schema-Inspektion und Query-Ausführung.",
    category: "database",
    icon: "Database",
    color: "text-blue-600",
    author: "Anthropic",
    repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/postgres",
    npmPackage: "@modelcontextprotocol/server-postgres",
    capabilities: ["query", "schema_inspect", "table_list", "insert", "update", "delete"],
    isInstalled: false,
    isOfficial: true,
    stars: 3900,
    version: "1.0.0",
    configSchema: [
      { name: "connectionString", type: "password", label: "Connection String", description: "PostgreSQL Connection URL", required: true },
    ],
  },
  {
    id: "sqlite",
    name: "SQLite",
    description: "SQLite-Datenbankzugriff für lokale Datenbanken und Prototyping.",
    category: "database",
    icon: "Database",
    color: "text-cyan-500",
    author: "Anthropic",
    repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite",
    npmPackage: "@modelcontextprotocol/server-sqlite",
    capabilities: ["query", "schema_inspect", "table_list"],
    isInstalled: false,
    isOfficial: true,
    stars: 2800,
    version: "1.0.0",
    configSchema: [
      { name: "dbPath", type: "string", label: "Datenbank-Pfad", description: "Pfad zur SQLite-Datei", required: true, default: "./database.db" },
    ],
  },
  {
    id: "redis",
    name: "Redis",
    description: "Redis Key-Value Store Zugriff für Caching und Session-Management.",
    category: "database",
    icon: "Database",
    color: "text-red-500",
    author: "Community",
    repository: "https://github.com/modelcontextprotocol/servers",
    npmPackage: "@mcp/server-redis",
    capabilities: ["get", "set", "delete", "keys", "expire"],
    isInstalled: false,
    isOfficial: false,
    stars: 1200,
    version: "0.9.0",
    configSchema: [
      { name: "redisUrl", type: "password", label: "Redis URL", description: "Redis Connection URL", required: true, default: "redis://localhost:6379" },
    ],
  },
  {
    id: "mongodb",
    name: "MongoDB",
    description: "MongoDB NoSQL-Datenbankzugriff für dokumentenbasierte Daten.",
    category: "database",
    icon: "Database",
    color: "text-green-600",
    author: "Community",
    repository: "https://github.com/mcp-servers/mongodb",
    npmPackage: "@mcp/server-mongodb",
    capabilities: ["find", "insert", "update", "delete", "aggregate", "collections"],
    isInstalled: false,
    isOfficial: false,
    stars: 980,
    version: "0.8.0",
    configSchema: [
      { name: "mongoUri", type: "password", label: "MongoDB URI", description: "MongoDB Connection String", required: true },
      { name: "database", type: "string", label: "Datenbank", description: "Name der Datenbank", required: true },
    ],
  },

  // Search & Web
  {
    id: "brave-search",
    name: "Brave Search",
    description: "Web- und lokale Suche mit der Brave Search API für aktuelle Informationen.",
    category: "search",
    icon: "Search",
    color: "text-orange-600",
    author: "Anthropic",
    repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search",
    npmPackage: "@modelcontextprotocol/server-brave-search",
    capabilities: ["web_search", "local_search", "news_search"],
    isInstalled: false,
    isOfficial: true,
    stars: 3200,
    version: "1.0.0",
    configSchema: [
      { name: "apiKey", type: "password", label: "API Key", description: "Brave Search API Key", required: true },
    ],
  },
  {
    id: "fetch",
    name: "Fetch",
    description: "Web-Inhalte abrufen und in Markdown konvertieren für einfache Verarbeitung.",
    category: "api",
    icon: "Globe",
    color: "text-purple-500",
    author: "Anthropic",
    repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch",
    npmPackage: "@modelcontextprotocol/server-fetch",
    capabilities: ["fetch_url", "convert_to_markdown", "extract_links"],
    isInstalled: false,
    isOfficial: true,
    stars: 2900,
    version: "1.0.0",
    configSchema: [
      { name: "userAgent", type: "string", label: "User Agent", description: "Custom User Agent", required: false },
      { name: "maxSize", type: "number", label: "Max Size (KB)", description: "Maximale Größe in KB", required: false, default: 1024 },
    ],
  },
  {
    id: "puppeteer",
    name: "Puppeteer",
    description: "Browser-Automatisierung für Web Scraping, Screenshots und PDF-Generierung.",
    category: "api",
    icon: "Monitor",
    color: "text-teal-500",
    author: "Anthropic",
    repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer",
    npmPackage: "@modelcontextprotocol/server-puppeteer",
    capabilities: ["navigate", "screenshot", "pdf", "click", "type", "evaluate"],
    isInstalled: false,
    isOfficial: true,
    stars: 2600,
    version: "1.0.0",
    configSchema: [
      { name: "headless", type: "boolean", label: "Headless Mode", description: "Browser ohne GUI starten", required: false, default: true },
    ],
  },

  // Cloud & APIs
  {
    id: "github",
    name: "GitHub",
    description: "GitHub API Integration: Repositories, Issues, Pull Requests, Actions und mehr.",
    category: "cloud",
    icon: "Github",
    color: "text-gray-400",
    author: "Anthropic",
    repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/github",
    npmPackage: "@modelcontextprotocol/server-github",
    capabilities: ["repos", "issues", "pull_requests", "actions", "search_code", "create_issue", "create_pr"],
    isInstalled: false,
    isOfficial: true,
    stars: 4100,
    version: "1.0.0",
    configSchema: [
      { name: "token", type: "password", label: "GitHub Token", description: "Personal Access Token", required: true },
    ],
  },
  {
    id: "gitlab",
    name: "GitLab",
    description: "GitLab API Integration für Projekte, Merge Requests und CI/CD Pipelines.",
    category: "cloud",
    icon: "GitBranch",
    color: "text-orange-500",
    author: "Community",
    repository: "https://github.com/mcp-servers/gitlab",
    npmPackage: "@mcp/server-gitlab",
    capabilities: ["projects", "merge_requests", "pipelines", "issues"],
    isInstalled: false,
    isOfficial: false,
    stars: 890,
    version: "0.7.0",
    configSchema: [
      { name: "token", type: "password", label: "GitLab Token", description: "Personal Access Token", required: true },
      { name: "baseUrl", type: "string", label: "GitLab URL", description: "GitLab Instance URL", required: false, default: "https://gitlab.com" },
    ],
  },
  {
    id: "aws",
    name: "AWS",
    description: "AWS Services Zugriff: S3, Lambda, DynamoDB, EC2 und mehr.",
    category: "cloud",
    icon: "Cloud",
    color: "text-amber-500",
    author: "Community",
    repository: "https://github.com/mcp-servers/aws",
    npmPackage: "@mcp/server-aws",
    capabilities: ["s3", "lambda", "dynamodb", "ec2", "cloudwatch"],
    isInstalled: false,
    isOfficial: false,
    stars: 1500,
    version: "0.9.0",
    configSchema: [
      { name: "accessKeyId", type: "password", label: "Access Key ID", description: "AWS Access Key", required: true },
      { name: "secretAccessKey", type: "password", label: "Secret Access Key", description: "AWS Secret Key", required: true },
      { name: "region", type: "string", label: "Region", description: "AWS Region", required: true, default: "eu-central-1" },
    ],
  },
  {
    id: "google-cloud",
    name: "Google Cloud",
    description: "Google Cloud Platform Services: Storage, BigQuery, Cloud Functions.",
    category: "cloud",
    icon: "Cloud",
    color: "text-blue-500",
    author: "Community",
    repository: "https://github.com/mcp-servers/gcp",
    npmPackage: "@mcp/server-gcp",
    capabilities: ["storage", "bigquery", "functions", "pubsub"],
    isInstalled: false,
    isOfficial: false,
    stars: 1100,
    version: "0.8.0",
    configSchema: [
      { name: "projectId", type: "string", label: "Project ID", description: "GCP Project ID", required: true },
      { name: "credentials", type: "password", label: "Service Account JSON", description: "Service Account Credentials", required: true },
    ],
  },

  // Productivity
  {
    id: "slack",
    name: "Slack",
    description: "Slack Workspace Integration: Nachrichten senden, Channels verwalten, Suche.",
    category: "communication",
    icon: "MessageSquare",
    color: "text-purple-600",
    author: "Anthropic",
    repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/slack",
    npmPackage: "@modelcontextprotocol/server-slack",
    capabilities: ["send_message", "list_channels", "search_messages", "upload_file"],
    isInstalled: false,
    isOfficial: true,
    stars: 2400,
    version: "1.0.0",
    configSchema: [
      { name: "botToken", type: "password", label: "Bot Token", description: "Slack Bot OAuth Token", required: true },
    ],
  },
  {
    id: "google-drive",
    name: "Google Drive",
    description: "Google Drive Dateiverwaltung: Lesen, Schreiben, Suchen und Teilen.",
    category: "productivity",
    icon: "HardDrive",
    color: "text-yellow-500",
    author: "Anthropic",
    repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/google-drive",
    npmPackage: "@modelcontextprotocol/server-gdrive",
    capabilities: ["list_files", "read_file", "create_file", "search", "share"],
    isInstalled: false,
    isOfficial: true,
    stars: 2100,
    version: "1.0.0",
    configSchema: [
      { name: "clientId", type: "string", label: "Client ID", description: "Google OAuth Client ID", required: true },
      { name: "clientSecret", type: "password", label: "Client Secret", description: "Google OAuth Client Secret", required: true },
    ],
  },
  {
    id: "notion",
    name: "Notion",
    description: "Notion Workspace Integration: Seiten, Datenbanken, Blöcke verwalten.",
    category: "productivity",
    icon: "FileText",
    color: "text-gray-600",
    author: "Community",
    repository: "https://github.com/mcp-servers/notion",
    npmPackage: "@mcp/server-notion",
    capabilities: ["pages", "databases", "blocks", "search", "comments"],
    isInstalled: false,
    isOfficial: false,
    stars: 1800,
    version: "0.9.0",
    configSchema: [
      { name: "apiKey", type: "password", label: "Integration Token", description: "Notion Integration Token", required: true },
    ],
  },
  {
    id: "linear",
    name: "Linear",
    description: "Linear Issue Tracking: Issues, Projekte, Cycles und Teams verwalten.",
    category: "productivity",
    icon: "CheckSquare",
    color: "text-indigo-500",
    author: "Community",
    repository: "https://github.com/mcp-servers/linear",
    npmPackage: "@mcp/server-linear",
    capabilities: ["issues", "projects", "cycles", "teams", "comments"],
    isInstalled: false,
    isOfficial: false,
    stars: 950,
    version: "0.8.0",
    configSchema: [
      { name: "apiKey", type: "password", label: "API Key", description: "Linear API Key", required: true },
    ],
  },

  // AI & ML
  {
    id: "openai",
    name: "OpenAI",
    description: "OpenAI API Integration: GPT-4, DALL-E, Whisper, Embeddings.",
    category: "ai",
    icon: "Sparkles",
    color: "text-emerald-500",
    author: "Community",
    repository: "https://github.com/mcp-servers/openai",
    npmPackage: "@mcp/server-openai",
    capabilities: ["chat", "embeddings", "images", "audio", "moderation"],
    isInstalled: false,
    isOfficial: false,
    stars: 2200,
    version: "1.0.0",
    configSchema: [
      { name: "apiKey", type: "password", label: "API Key", description: "OpenAI API Key", required: true },
    ],
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    description: "Hugging Face Hub: Modelle, Datasets, Spaces und Inference API.",
    category: "ai",
    icon: "Brain",
    color: "text-yellow-600",
    author: "Community",
    repository: "https://github.com/mcp-servers/huggingface",
    npmPackage: "@mcp/server-huggingface",
    capabilities: ["models", "datasets", "inference", "spaces"],
    isInstalled: false,
    isOfficial: false,
    stars: 1400,
    version: "0.9.0",
    configSchema: [
      { name: "token", type: "password", label: "HF Token", description: "Hugging Face Token", required: true },
    ],
  },

  // Development Tools
  {
    id: "docker",
    name: "Docker",
    description: "Docker Container Management: Images, Container, Volumes, Networks.",
    category: "development",
    icon: "Container",
    color: "text-blue-500",
    author: "Community",
    repository: "https://github.com/mcp-servers/docker",
    npmPackage: "@mcp/server-docker",
    capabilities: ["containers", "images", "volumes", "networks", "exec"],
    isInstalled: false,
    isOfficial: false,
    stars: 1600,
    version: "0.9.0",
    configSchema: [
      { name: "socketPath", type: "string", label: "Docker Socket", description: "Docker Socket Pfad", required: false, default: "/var/run/docker.sock" },
    ],
  },
  {
    id: "kubernetes",
    name: "Kubernetes",
    description: "Kubernetes Cluster Management: Pods, Deployments, Services, ConfigMaps.",
    category: "development",
    icon: "Server",
    color: "text-blue-600",
    author: "Community",
    repository: "https://github.com/mcp-servers/kubernetes",
    npmPackage: "@mcp/server-kubernetes",
    capabilities: ["pods", "deployments", "services", "configmaps", "secrets", "logs"],
    isInstalled: false,
    isOfficial: false,
    stars: 1300,
    version: "0.8.0",
    configSchema: [
      { name: "kubeconfig", type: "string", label: "Kubeconfig Pfad", description: "Pfad zur kubeconfig Datei", required: false, default: "~/.kube/config" },
      { name: "context", type: "string", label: "Context", description: "Kubernetes Context", required: false },
    ],
  },
  {
    id: "npm",
    name: "NPM Registry",
    description: "NPM Package Registry: Pakete suchen, Versionen prüfen, Dependencies analysieren.",
    category: "development",
    icon: "Package",
    color: "text-red-600",
    author: "Community",
    repository: "https://github.com/mcp-servers/npm",
    npmPackage: "@mcp/server-npm",
    capabilities: ["search", "package_info", "versions", "dependencies", "vulnerabilities"],
    isInstalled: false,
    isOfficial: false,
    stars: 780,
    version: "0.7.0",
    configSchema: [],
  },

  // Memory & Context
  {
    id: "memory",
    name: "Memory",
    description: "Persistenter Speicher für Kontext und Wissen über Sessions hinweg.",
    category: "other",
    icon: "Brain",
    color: "text-pink-500",
    author: "Anthropic",
    repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
    npmPackage: "@modelcontextprotocol/server-memory",
    capabilities: ["store", "retrieve", "search", "delete", "list"],
    isInstalled: false,
    isOfficial: true,
    stars: 3100,
    version: "1.0.0",
    configSchema: [
      { name: "storagePath", type: "string", label: "Speicher-Pfad", description: "Pfad für persistenten Speicher", required: false, default: "./.memory" },
    ],
  },
  {
    id: "sequential-thinking",
    name: "Sequential Thinking",
    description: "Strukturiertes Denken und Problemlösung mit Chain-of-Thought.",
    category: "ai",
    icon: "ListOrdered",
    color: "text-violet-500",
    author: "Anthropic",
    repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking",
    npmPackage: "@modelcontextprotocol/server-sequential-thinking",
    capabilities: ["think_step", "analyze", "conclude", "revise"],
    isInstalled: false,
    isOfficial: true,
    stars: 2700,
    version: "1.0.0",
    configSchema: [],
  },
]

// MCP Server Kategorien
export const mcpCategories = [
  { id: "all", name: "Alle", icon: "LayoutGrid" },
  { id: "filesystem", name: "Dateisystem", icon: "FolderOpen" },
  { id: "database", name: "Datenbanken", icon: "Database" },
  { id: "api", name: "Web & APIs", icon: "Globe" },
  { id: "search", name: "Suche", icon: "Search" },
  { id: "cloud", name: "Cloud", icon: "Cloud" },
  { id: "productivity", name: "Produktivität", icon: "CheckSquare" },
  { id: "communication", name: "Kommunikation", icon: "MessageSquare" },
  { id: "development", name: "Entwicklung", icon: "Code2" },
  { id: "ai", name: "KI & ML", icon: "Sparkles" },
  { id: "other", name: "Sonstige", icon: "MoreHorizontal" },
]

// Helper function to get MCP server by ID
export function getMcpServerById(id: string): MCPServer | undefined {
  return mcpServers.find(server => server.id === id)
}
