"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Bot,
  Search,
  Plus,
  Check,
  X,
  Star,
  Download,
  ArrowLeft,
  LogOut,
  LayoutGrid,
  Code2,
  TestTube,
  Shield,
  FileText,
  Container,
  Brain,
  Puzzle,
  Zap,
  Globe,
  Database,
  Network,
  RefreshCw,
  Eye,
  Play,
  GripVertical,
  Trash2,
  Settings,
  ChevronUp,
  ChevronDown,
  Accessibility,
  Server,
  Cloud,
  MessageSquare,
  HardDrive,
  CheckSquare,
  Sparkles,
  Package,
  GitBranch,
  Monitor,
  MoreHorizontal,
  ListOrdered,
  FolderOpen,
  ExternalLink,
  Github,
  User,
  UserPlus,
  Edit,
  Lock,
  ShieldCheck,
} from "lucide-react"
import { useAuth } from "@/lib/auth"
import { marketplaceAgents, agentCategories } from "@/lib/marketplace-agents"
import { mcpServers, mcpCategories } from "@/lib/mcp-servers"
import { useAgentStore } from "@/lib/agent-store"
import type { MarketplaceAgent } from "@/lib/types"
import type { MCPServer } from "@/lib/mcp-servers"

const iconMap: Record<string, any> = {
  Brain,
  Code2,
  Eye,
  Shield,
  Play,
  TestTube,
  FileText,
  Zap,
  Globe,
  Database,
  Network,
  RefreshCw,
  Container,
  Puzzle,
  Accessibility,
  LayoutGrid,
  Server,
  Cloud,
  MessageSquare,
  HardDrive,
  CheckSquare,
  Sparkles,
  Package,
  GitBranch,
  Monitor,
  MoreHorizontal,
  ListOrdered,
  FolderOpen,
  Search,
  Github,
}

const categoryIconMap: Record<string, any> = {
  LayoutGrid,
  Code2,
  TestTube,
  Shield,
  FileText,
  Container,
  Brain,
  Puzzle,
  FolderOpen,
  Database,
  Globe,
  Search,
  Cloud,
  CheckSquare,
  MessageSquare,
  Sparkles,
  MoreHorizontal,
}

export function AdminDashboard() {
  const router = useRouter()
  const { logout, currentUser, isAdmin, users, addUser, updateUser, deleteUser } = useAuth()
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  
  // Verwende globalen Store für Marketplace State
  const {
    installedAgents,
    workflowOrder,
    installedMcpServers,
    installAgent: storeInstallAgent,
    uninstallAgent: storeUninstallAgent,
    setWorkflowOrder: storeSetWorkflowOrder,
    installMcpServer: storeInstallMcpServer,
    uninstallMcpServer: storeUninstallMcpServer,
  } = useAgentStore()
  
  // MCP Server State
  const [activeTab, setActiveTab] = useState<"agents" | "mcp" | "users">("agents")
  const [mcpSearchQuery, setMcpSearchQuery] = useState("")
  const [mcpSelectedCategory, setMcpSelectedCategory] = useState("all")
  
  // User Management State
  const [newUsername, setNewUsername] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [newRole, setNewRole] = useState<"admin" | "user">("user")
  const [editingUser, setEditingUser] = useState<string | null>(null)
  const [editUsername, setEditUsername] = useState("")
  const [editPassword, setEditPassword] = useState("")
  const [editRole, setEditRole] = useState<"admin" | "user">("user")
  
  const userIsAdmin = isAdmin()

  const handleLogout = () => {
    logout()
    router.push("/builder/login")
  }

  const filteredAgents = marketplaceAgents.filter(agent => {
    const matchesSearch = agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = selectedCategory === "all" || agent.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  const installAgent = (agentId: string) => {
    if (!userIsAdmin) return // Nur Admins dürfen Agenten installieren
    storeInstallAgent(agentId)
  }

  const uninstallAgent = (agentId: string) => {
    if (!userIsAdmin) return // Nur Admins dürfen Agenten entfernen
    storeUninstallAgent(agentId)
  }

  const moveAgentUp = (agentId: string) => {
    if (!userIsAdmin) return // Nur Admins dürfen Workflow ändern
    const index = workflowOrder.indexOf(agentId)
    if (index > 0) {
      const newOrder = [...workflowOrder]
      ;[newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]]
      storeSetWorkflowOrder(newOrder)
    }
  }

  const moveAgentDown = (agentId: string) => {
    if (!userIsAdmin) return // Nur Admins dürfen Workflow ändern
    const index = workflowOrder.indexOf(agentId)
    if (index < workflowOrder.length - 1) {
      const newOrder = [...workflowOrder]
      ;[newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]]
      storeSetWorkflowOrder(newOrder)
    }
  }

  const getAgentById = (id: string) => marketplaceAgents.find(a => a.id === id)

  // MCP Server Functions
  const filteredMcpServers = mcpServers.filter(server => {
    const matchesSearch = server.name.toLowerCase().includes(mcpSearchQuery.toLowerCase()) ||
      server.description.toLowerCase().includes(mcpSearchQuery.toLowerCase())
    const matchesCategory = mcpSelectedCategory === "all" || server.category === mcpSelectedCategory
    return matchesSearch && matchesCategory
  })

  const installMcpServer = (serverId: string) => {
    if (!userIsAdmin) return // Nur Admins dürfen MCP Server installieren
    storeInstallMcpServer(serverId)
  }

  const uninstallMcpServer = (serverId: string) => {
    if (!userIsAdmin) return // Nur Admins dürfen MCP Server entfernen
    storeUninstallMcpServer(serverId)
  }

  const getMcpServerById = (id: string) => mcpServers.find(s => s.id === id)

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Link href="/builder" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm">Zurück zum Builder</span>
            </Link>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <span className="font-semibold">Admin</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex gap-1">
              <Button
                variant={activeTab === "agents" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("agents")}
              >
                <Bot className="h-4 w-4 mr-2" />
                Agenten
              </Button>
              <Button
                variant={activeTab === "mcp" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("mcp")}
              >
                <Server className="h-4 w-4 mr-2" />
                MCP Server
              </Button>
              {userIsAdmin && (
                <Button
                  variant={activeTab === "users" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActiveTab("users")}
                >
                  <User className="h-4 w-4 mr-2" />
                  Benutzer
                </Button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {currentUser?.username}
              {currentUser?.role === "admin" && (
                <Badge variant="secondary" className="ml-2 text-xs">Admin</Badge>
              )}
            </span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Sidebar - Workflow */}
        <div className="w-80 border-r border-border bg-card p-4">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Aktiver Workflow
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            Ziehe Agenten um die Reihenfolge zu ändern
          </p>
          
          <ScrollArea className="h-[calc(100vh-200px)]">
            <div className="space-y-2">
              {workflowOrder.map((agentId, index) => {
                const agent = getAgentById(agentId)
                if (!agent) return null
                const Icon = iconMap[agent.icon] || Brain
                
                return (
                  <div
                    key={agentId}
                    className="flex items-center gap-2 p-3 rounded-lg border border-border bg-background hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => moveAgentUp(agentId)}
                        disabled={index === 0}
                        className="p-0.5 hover:bg-secondary rounded disabled:opacity-30"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => moveAgentDown(agentId)}
                        disabled={index === workflowOrder.length - 1}
                        className="p-0.5 hover:bg-secondary rounded disabled:opacity-30"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>
                    
                    <div className={`p-2 rounded-md bg-secondary ${agent.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{agent.name}</div>
                      <div className="text-xs text-muted-foreground">Schritt {index + 1}</div>
                    </div>
                    
                    {!agent.isCore && (
                      <button
                        onClick={() => uninstallAgent(agentId)}
                        className="p-1 hover:bg-destructive/20 rounded text-destructive"
                        title="Aus Workflow entfernen"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    {agent.isCore && (
                      <Badge variant="secondary" className="text-xs">Core</Badge>
                    )}
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Main - Marketplace */}
        <div className="flex-1 p-6 overflow-auto">
          <div className="max-w-5xl mx-auto">
            {activeTab === "agents" && (
              <>
                <div className="mb-6">
                  <h1 className="text-2xl font-bold mb-2">Agent Marketplace</h1>
                  <p className="text-muted-foreground">
                    Erweitere deinen Workflow mit spezialisierten Agenten
                  </p>
                </div>

                {/* Search & Filter */}
                <div className="flex gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Agenten suchen..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                {/* Categories */}
                <div className="flex gap-2 mb-6 flex-wrap">
                  {agentCategories.map(category => {
                    const Icon = categoryIconMap[category.icon] || LayoutGrid
                    return (
                      <Button
                        key={category.id}
                        variant={selectedCategory === category.id ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedCategory(category.id)}
                        className="gap-2"
                      >
                        <Icon className="h-4 w-4" />
                        {category.name}
                      </Button>
                    )
                  })}
                </div>

                {/* Agent Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredAgents.map(agent => {
                    const Icon = iconMap[agent.icon] || Brain
                    const isInstalled = installedAgents.includes(agent.id)
                    
                    return (
                      <div
                        key={agent.id}
                        className={`p-4 rounded-lg border transition-all ${
                          isInstalled 
                            ? "border-primary/50 bg-primary/5" 
                            : "border-border bg-card hover:border-primary/30"
                        }`}
                      >
                        <div className="flex items-start gap-3 mb-3">
                          <div className={`p-2 rounded-lg bg-secondary ${agent.color}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold truncate">{agent.name}</h3>
                              {agent.isCore && (
                                <Badge variant="secondary" className="text-xs">Core</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                                {agent.rating}
                              </span>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Download className="h-3 w-3" />
                                {agent.downloads.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                          {agent.description}
                        </p>
                        
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-xs">
                            {agent.category}
                          </Badge>
                          
                          {isInstalled ? (
                            agent.isCore ? (
                              <Badge className="bg-green-500/20 text-green-500 border-green-500/30">
                                <Check className="h-3 w-3 mr-1" />
                                Installiert
                              </Badge>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => uninstallAgent(agent.id)}
                                className="text-destructive hover:bg-destructive/10"
                              >
                                <X className="h-4 w-4 mr-1" />
                                Entfernen
                              </Button>
                            )
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => installAgent(agent.id)}
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              Installieren
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {filteredAgents.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Puzzle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Keine Agenten gefunden</p>
                  </div>
                )}
              </>
            )}

            {activeTab === "mcp" && (
              <>
                {/* MCP Server Marketplace */}
                <div className="mb-6">
                  <h1 className="text-2xl font-bold mb-2">MCP Server Marketplace</h1>
                  <p className="text-muted-foreground">
                    Verbinde externe Tools und Services mit deinen Agenten über das Model Context Protocol
                  </p>
                </div>

                {/* Search & Filter */}
                <div className="flex gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="MCP Server suchen..."
                      value={mcpSearchQuery}
                      onChange={(e) => setMcpSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                {/* Categories */}
                <div className="flex gap-2 mb-6 flex-wrap">
                  {mcpCategories.map(category => {
                    const Icon = categoryIconMap[category.icon] || LayoutGrid
                    return (
                      <Button
                        key={category.id}
                        variant={mcpSelectedCategory === category.id ? "default" : "outline"}
                        size="sm"
                        onClick={() => setMcpSelectedCategory(category.id)}
                        className="gap-2"
                      >
                        <Icon className="h-4 w-4" />
                        {category.name}
                      </Button>
                    )
                  })}
                </div>

                {/* Installed MCP Servers */}
                {installedMcpServers.length > 0 && (
                  <div className="mb-8">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Check className="h-5 w-5 text-green-500" />
                      Installierte Server ({installedMcpServers.length})
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {installedMcpServers.map(serverId => {
                        const server = getMcpServerById(serverId)
                        if (!server) return null
                        const Icon = iconMap[server.icon] || Server
                        
                        return (
                          <div
                            key={server.id}
                            className="p-4 rounded-lg border border-green-500/50 bg-green-500/5"
                          >
                            <div className="flex items-start gap-3 mb-3">
                              <div className={`p-2 rounded-lg bg-secondary ${server.color}`}>
                                <Icon className="h-5 w-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold truncate">{server.name}</h3>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  {server.isOfficial && (
                                    <Badge variant="secondary" className="text-xs">Official</Badge>
                                  )}
                                  <span>v{server.version}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge className="bg-green-500/20 text-green-500 text-xs">
                                  Aktiv
                                </Badge>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => uninstallMcpServer(server.id)}
                                className="text-destructive hover:bg-destructive/10"
                              >
                                <X className="h-4 w-4 mr-1" />
                                Entfernen
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Available MCP Servers */}
                <h2 className="text-lg font-semibold mb-4">
                  Verfügbare Server ({filteredMcpServers.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredMcpServers.map(server => {
                    const Icon = iconMap[server.icon] || Server
                    const isInstalled = installedMcpServers.includes(server.id)
                    
                    return (
                      <div
                        key={server.id}
                        className={`p-4 rounded-lg border transition-all ${
                          isInstalled 
                            ? "border-green-500/50 bg-green-500/5" 
                            : "border-border bg-card hover:border-primary/30"
                        }`}
                      >
                        <div className="flex items-start gap-3 mb-3">
                          <div className={`p-2 rounded-lg bg-secondary ${server.color}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold truncate">{server.name}</h3>
                              {server.isOfficial && (
                                <Badge variant="secondary" className="text-xs">Official</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                                {server.stars.toLocaleString()}
                              </span>
                              <span>•</span>
                              <span>v{server.version}</span>
                              <span>•</span>
                              <span>{server.author}</span>
                            </div>
                          </div>
                        </div>
                        
                        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                          {server.description}
                        </p>

                        {/* Capabilities */}
                        <div className="flex flex-wrap gap-1 mb-3">
                          {server.capabilities.slice(0, 3).map(cap => (
                            <Badge key={cap} variant="outline" className="text-xs">
                              {cap}
                            </Badge>
                          ))}
                          {server.capabilities.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{server.capabilities.length - 3}
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <a
                            href={server.repository}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                          >
                            <Github className="h-3 w-3" />
                            Repository
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          
                          {isInstalled ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => uninstallMcpServer(server.id)}
                              className="text-destructive hover:bg-destructive/10"
                            >
                              <X className="h-4 w-4 mr-1" />
                              Entfernen
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => installMcpServer(server.id)}
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              Installieren
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {filteredMcpServers.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Server className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Keine MCP Server gefunden</p>
                  </div>
                )}
              </>
            )}

            {/* User Management Tab */}
            {activeTab === "users" && userIsAdmin && (
              <>
                <div className="mb-6">
                  <h1 className="text-2xl font-bold mb-2">Benutzerverwaltung</h1>
                  <p className="text-muted-foreground">
                    Verwalte Benutzer und deren Berechtigungen
                  </p>
                </div>

                {/* Add New User */}
                <div className="mb-8 p-4 rounded-lg border border-border bg-card">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <UserPlus className="h-5 w-5" />
                    Neuen Benutzer anlegen
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="text-sm text-muted-foreground mb-1 block">Benutzername</label>
                      <Input
                        placeholder="Benutzername"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground mb-1 block">Passwort</label>
                      <Input
                        type="password"
                        placeholder="Passwort"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground mb-1 block">Rolle</label>
                      <select
                        className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value as "admin" | "user")}
                      >
                        <option value="user">Benutzer</option>
                        <option value="admin">Administrator</option>
                      </select>
                    </div>
                    <div className="flex items-end">
                      <Button
                        onClick={() => {
                          if (newUsername && newPassword) {
                            const success = addUser(newUsername, newPassword, newRole)
                            if (success) {
                              setNewUsername("")
                              setNewPassword("")
                              setNewRole("user")
                            }
                          }
                        }}
                        disabled={!newUsername || !newPassword}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Hinzufügen
                      </Button>
                    </div>
                  </div>
                </div>

                {/* User List */}
                <h2 className="text-lg font-semibold mb-4">
                  Benutzer ({(users || []).length})
                </h2>
                <div className="space-y-3">
                  {(users || []).map(user => (
                    <div
                      key={user.id}
                      className={`p-4 rounded-lg border transition-all ${
                        user.id === currentUser?.id
                          ? "border-primary/50 bg-primary/5"
                          : "border-border bg-card"
                      }`}
                    >
                      {editingUser === user.id ? (
                        // Edit Mode
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div>
                            <label className="text-sm text-muted-foreground mb-1 block">Benutzername</label>
                            <Input
                              value={editUsername}
                              onChange={(e) => setEditUsername(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="text-sm text-muted-foreground mb-1 block">Neues Passwort</label>
                            <Input
                              type="password"
                              placeholder="Leer = unverändert"
                              value={editPassword}
                              onChange={(e) => setEditPassword(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="text-sm text-muted-foreground mb-1 block">Rolle</label>
                            <select
                              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                              value={editRole}
                              onChange={(e) => setEditRole(e.target.value as "admin" | "user")}
                            >
                              <option value="user">Benutzer</option>
                              <option value="admin">Administrator</option>
                            </select>
                          </div>
                          <div className="flex items-end gap-2">
                            <Button
                              size="sm"
                              onClick={() => {
                                const updates: any = { role: editRole }
                                if (editUsername !== user.username) updates.username = editUsername
                                if (editPassword) updates.password = editPassword
                                updateUser(user.id, updates)
                                setEditingUser(null)
                              }}
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Speichern
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingUser(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        // View Mode
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className={`p-2 rounded-lg ${user.role === "admin" ? "bg-amber-500/20" : "bg-secondary"}`}>
                              {user.role === "admin" ? (
                                <ShieldCheck className="h-5 w-5 text-amber-500" />
                              ) : (
                                <User className="h-5 w-5 text-muted-foreground" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{user.username}</span>
                                {user.id === currentUser?.id && (
                                  <Badge variant="outline" className="text-xs">Du</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant={user.role === "admin" ? "default" : "secondary"} className="text-xs">
                                  {user.role === "admin" ? "Administrator" : "Benutzer"}
                                </Badge>
                                <span>•</span>
                                <span>Erstellt: {new Date(user.createdAt).toLocaleDateString("de-DE")}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingUser(user.id)
                                setEditUsername(user.username)
                                setEditPassword("")
                                setEditRole(user.role)
                              }}
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              Bearbeiten
                            </Button>
                            {user.id !== currentUser?.id && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => deleteUser(user.id)}
                                className="text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Info Box */}
                <div className="mt-8 p-4 rounded-lg border border-amber-500/30 bg-amber-500/5">
                  <div className="flex items-start gap-3">
                    <Lock className="h-5 w-5 text-amber-500 mt-0.5" />
                    <div>
                      <h3 className="font-medium text-amber-500">Berechtigungen</h3>
                      <ul className="mt-2 text-sm text-muted-foreground space-y-1">
                        <li>• <strong>Administratoren</strong> können Agenten und MCP Server installieren/entfernen und Benutzer verwalten</li>
                        <li>• <strong>Benutzer</strong> können den Builder nutzen, aber keine Systemkonfiguration ändern</li>
                        <li>• Mindestens ein Administrator muss immer vorhanden sein</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
