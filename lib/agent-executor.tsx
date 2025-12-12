"use client"

import { useState, useCallback } from "react"
import { useAgentStore } from "./agent-store"
import type { Message, GeneratedFile } from "./types"

interface AnalysisResult {
  appType: string
  appName: string
  features: string[]
  components: string[]
  hasAuth: boolean
  hasApi: boolean
  hasDatabase: boolean
  hasDarkMode: boolean
  hasSearch: boolean
}

function analyzeRequest(request: string): AnalysisResult {
  const lower = request.toLowerCase()

  const appTypes: Record<string, string[]> = {
    todo: ["todo", "task", "aufgabe"],
    dashboard: ["dashboard", "admin", "analytics"],
    chat: ["chat", "messaging", "nachrichten"],
    ecommerce: ["shop", "store", "ecommerce", "produkt"],
    blog: ["blog", "artikel", "post"],
    landing: ["landing", "homepage", "startseite"],
  }

  let appType = "app"
  for (const [type, keywords] of Object.entries(appTypes)) {
    if (keywords.some((k) => lower.includes(k))) {
      appType = type
      break
    }
  }

  const words = request.split(/\s+/).filter((w) => w.length > 3)
  const appName = words[0] ? words[0].charAt(0).toUpperCase() + words[0].slice(1) + "App" : "GeneratedApp"

  const featureMap: Record<string, string[]> = {
    authentication: ["auth", "login", "anmeld", "user"],
    darkMode: ["dark", "theme", "dunkel"],
    search: ["such", "search", "filter"],
    notifications: ["notif", "benachricht", "alert"],
    api: ["api", "backend", "server"],
    database: ["datenbank", "database", "speicher", "persist"],
  }

  const features: string[] = []
  for (const [feature, keywords] of Object.entries(featureMap)) {
    if (keywords.some((k) => lower.includes(k))) {
      features.push(feature)
    }
  }

  return {
    appType,
    appName,
    features,
    components: getComponentsForType(appType),
    hasAuth: features.includes("authentication"),
    hasApi: features.includes("api") || lower.includes("api"),
    hasDatabase: features.includes("database"),
    hasDarkMode: features.includes("darkMode"),
    hasSearch: features.includes("search"),
  }
}

function getComponentsForType(appType: string): string[] {
  const componentMap: Record<string, string[]> = {
    todo: ["TodoList", "TodoItem", "AddTodoForm", "TodoFilter"],
    dashboard: ["StatsCard", "Chart", "DataTable", "Sidebar"],
    chat: ["MessageList", "MessageInput", "ChatSidebar", "UserAvatar"],
    ecommerce: ["ProductCard", "Cart", "Checkout", "ProductGrid"],
    blog: ["ArticleCard", "ArticleList", "CommentSection", "Author"],
    landing: ["Hero", "Features", "Pricing", "CTA", "Footer"],
    app: ["Header", "Main", "Sidebar", "Footer"],
  }
  return componentMap[appType] || componentMap.app
}

function generateTodoCode(analysis: AnalysisResult): GeneratedFile[] {
  const files: GeneratedFile[] = []

  // Main component
  const mainCode = [
    '"use client";',
    "",
    'import { useState } from "react";',
    'import { Button } from "@/components/ui/button";',
    'import { Input } from "@/components/ui/input";',
    'import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";',
    'import { Checkbox } from "@/components/ui/checkbox";',
    'import { Trash2, Plus } from "lucide-react";',
    "",
    "interface Todo {",
    "  id: string;",
    "  text: string;",
    "  completed: boolean;",
    "}",
    "",
    "export function TodoApp() {",
    "  const [todos, setTodos] = useState<Todo[]>([]);",
    '  const [input, setInput] = useState("");',
    "",
    "  const addTodo = () => {",
    "    if (!input.trim()) return;",
    "    setTodos([...todos, { id: Date.now().toString(), text: input, completed: false }]);",
    '    setInput("");',
    "  };",
    "",
    "  const toggleTodo = (id: string) => {",
    "    setTodos(todos.map(t => t.id === id ? { ...t, completed: !t.completed } : t));",
    "  };",
    "",
    "  const deleteTodo = (id: string) => {",
    "    setTodos(todos.filter(t => t.id !== id));",
    "  };",
    "",
    "  return (",
    '    <Card className="w-full max-w-md mx-auto">',
    "      <CardHeader>",
    "        <CardTitle>Todo App</CardTitle>",
    "      </CardHeader>",
    '      <CardContent className="space-y-4">',
    '        <div className="flex gap-2">',
    "          <Input",
    "            value={input}",
    "            onChange={(e) => setInput(e.target.value)}",
    '            placeholder="Add a new task..."',
    '            onKeyDown={(e) => e.key === "Enter" && addTodo()}',
    "          />",
    '          <Button onClick={addTodo}><Plus className="h-4 w-4" /></Button>',
    "        </div>",
    '        <div className="space-y-2">',
    "          {todos.map((todo) => (",
    '            <div key={todo.id} className="flex items-center gap-2 p-2 rounded border">',
    "              <Checkbox",
    "                checked={todo.completed}",
    "                onCheckedChange={() => toggleTodo(todo.id)}",
    "              />",
    '              <span className={todo.completed ? "line-through text-muted-foreground flex-1" : "flex-1"}>',
    "                {todo.text}",
    "              </span>",
    '              <Button variant="ghost" size="sm" onClick={() => deleteTodo(todo.id)}>',
    '                <Trash2 className="h-4 w-4" />',
    "              </Button>",
    "            </div>",
    "          ))}",
    "        </div>",
    "      </CardContent>",
    "    </Card>",
    "  );",
    "}",
  ].join("\n")

  files.push({
    name: "components/todo-app.tsx",
    content: mainCode,
    language: "typescript",
  })

  // Page
  const pageCode = [
    'import { TodoApp } from "@/components/todo-app";',
    "",
    "export default function Page() {",
    "  return (",
    '    <main className="min-h-screen flex items-center justify-center p-4">',
    "      <TodoApp />",
    "    </main>",
    "  );",
    "}",
  ].join("\n")

  files.push({
    name: "app/page.tsx",
    content: pageCode,
    language: "typescript",
  })

  return files
}

function generateDashboardCode(analysis: AnalysisResult): GeneratedFile[] {
  const files: GeneratedFile[] = []

  const mainCode = [
    '"use client";',
    "",
    'import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";',
    'import { Users, DollarSign, ShoppingCart, TrendingUp } from "lucide-react";',
    "",
    "const stats = [",
    '  { title: "Total Users", value: "2,543", icon: Users, change: "+12%" },',
    '  { title: "Revenue", value: "$45,231", icon: DollarSign, change: "+8%" },',
    '  { title: "Orders", value: "1,234", icon: ShoppingCart, change: "+23%" },',
    '  { title: "Growth", value: "18.2%", icon: TrendingUp, change: "+4%" },',
    "];",
    "",
    "export function Dashboard() {",
    "  return (",
    '    <div className="p-6 space-y-6">',
    '      <h1 className="text-3xl font-bold">Dashboard</h1>',
    '      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">',
    "        {stats.map((stat) => (",
    "          <Card key={stat.title}>",
    '            <CardHeader className="flex flex-row items-center justify-between pb-2">',
    '              <CardTitle className="text-sm font-medium text-muted-foreground">',
    "                {stat.title}",
    "              </CardTitle>",
    '              <stat.icon className="h-4 w-4 text-muted-foreground" />',
    "            </CardHeader>",
    "            <CardContent>",
    '              <div className="text-2xl font-bold">{stat.value}</div>',
    '              <p className="text-xs text-green-500">{stat.change} from last month</p>',
    "            </CardContent>",
    "          </Card>",
    "        ))}",
    "      </div>",
    "    </div>",
    "  );",
    "}",
  ].join("\n")

  files.push({
    name: "components/dashboard.tsx",
    content: mainCode,
    language: "typescript",
  })

  const pageCode = [
    'import { Dashboard } from "@/components/dashboard";',
    "",
    "export default function Page() {",
    "  return <Dashboard />;",
    "}",
  ].join("\n")

  files.push({
    name: "app/page.tsx",
    content: pageCode,
    language: "typescript",
  })

  return files
}

function generateDefaultCode(analysis: AnalysisResult): GeneratedFile[] {
  const files: GeneratedFile[] = []

  const mainCode = [
    '"use client";',
    "",
    'import { Button } from "@/components/ui/button";',
    'import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";',
    "",
    "export function " + analysis.appName + "() {",
    "  return (",
    '    <div className="min-h-screen flex items-center justify-center p-4">',
    '      <Card className="w-full max-w-lg">',
    "        <CardHeader>",
    "          <CardTitle>" + analysis.appName + "</CardTitle>",
    "          <CardDescription>Generated by AgentForge</CardDescription>",
    "        </CardHeader>",
    '        <CardContent className="space-y-4">',
    "          <p>Your " + analysis.appType + " app is ready!</p>",
    '          <div className="flex gap-2">',
    "            <Button>Get Started</Button>",
    '            <Button variant="outline">Learn More</Button>',
    "          </div>",
    "        </CardContent>",
    "      </Card>",
    "    </div>",
    "  );",
    "}",
  ].join("\n")

  files.push({
    name: "components/" + analysis.appName.toLowerCase() + ".tsx",
    content: mainCode,
    language: "typescript",
  })

  const pageCode = [
    "import { " + analysis.appName + ' } from "@/components/' + analysis.appName.toLowerCase() + '";',
    "",
    "export default function Page() {",
    "  return <" + analysis.appName + " />;",
    "}",
  ].join("\n")

  files.push({
    name: "app/page.tsx",
    content: pageCode,
    language: "typescript",
  })

  return files
}

function generateCode(analysis: AnalysisResult): GeneratedFile[] {
  switch (analysis.appType) {
    case "todo":
      return generateTodoCode(analysis)
    case "dashboard":
      return generateDashboardCode(analysis)
    default:
      return generateDefaultCode(analysis)
  }
}

function generatePlannerResponse(analysis: AnalysisResult): string {
  const lines = [
    "## Project Analysis Complete",
    "",
    "**App Type:** " + analysis.appType.charAt(0).toUpperCase() + analysis.appType.slice(1),
    "**Name:** " + analysis.appName,
    "",
    "### Identified Features:",
    ...analysis.features.map((f) => "- " + f.charAt(0).toUpperCase() + f.slice(1)),
    "",
    "### Required Components:",
    ...analysis.components.map((c) => "- " + c),
    "",
    "### Architecture:",
    "- Framework: Next.js 14 with App Router",
    "- Styling: Tailwind CSS + shadcn/ui",
    "- State: React useState/useReducer",
    analysis.hasApi ? "- API: REST endpoints in /api" : "",
    analysis.hasDatabase ? "- Database: Required for persistence" : "",
    "",
    "Ready to proceed with implementation.",
  ].filter(Boolean)

  return lines.join("\n")
}

function generateCoderResponse(analysis: AnalysisResult, files: GeneratedFile[]): string {
  const lines = [
    "## Implementation Complete",
    "",
    "Generated " + files.length + " file(s):",
    ...files.map((f) => "- `" + f.name + "`"),
    "",
    "### Features Implemented:",
    "- Responsive design with Tailwind CSS",
    "- Type-safe components with TypeScript",
    "- shadcn/ui component integration",
    analysis.hasSearch ? "- Search functionality" : "",
    analysis.hasDarkMode ? "- Dark mode support" : "",
    "",
    "Code is ready for review.",
  ].filter(Boolean)

  return lines.join("\n")
}

function generateReviewerResponse(analysis: AnalysisResult): string {
  const lines = [
    "## Code Review Complete",
    "",
    "### Quality Score: 92/100",
    "",
    "**Strengths:**",
    "- Clean component architecture",
    "- Proper TypeScript types",
    "- Consistent styling patterns",
    "- Good separation of concerns",
    "",
    "**Recommendations:**",
    "- Consider adding error boundaries",
    "- Add loading states for async operations",
    analysis.hasApi ? "- Implement proper API error handling" : "",
    "",
    "**Security:** No issues found",
    "**Performance:** Optimized for production",
    "",
    "Approved for deployment.",
  ].filter(Boolean)

  return lines.join("\n")
}

function generateExecutorResponse(analysis: AnalysisResult): string {
  const lines = [
    "## Deployment Ready",
    "",
    "### Build Status: Success",
    "",
    "**Steps Completed:**",
    "1. Dependencies installed",
    "2. TypeScript compilation passed",
    "3. Linting passed",
    "4. Build optimization complete",
    "",
    "**Output:**",
    "- Bundle size: ~85KB (gzipped)",
    "- Pages: " + (analysis.hasAuth ? "3" : "2") + " static, 0 dynamic",
    "",
    "Ready for deployment to Vercel.",
  ]

  return lines.join("\n")
}

export function useAgentExecutor() {
  const [isExecuting, setIsExecuting] = useState(false)
  const {
    agents,
    addMessage,
    addLog,
    addGeneratedFile,
    setCurrentAgent,
    clearMessages,
    clearLogs,
    clearGeneratedFiles,
  } = useAgentStore()

  const executeWorkflow = useCallback(
    async (userRequest: string) => {
      setIsExecuting(true)
      clearMessages()
      clearLogs()
      clearGeneratedFiles()

      // Add user message
      const userMsg: Message = {
        id: Date.now().toString(),
        role: "user",
        content: userRequest,
        timestamp: new Date(),
      }
      addMessage(userMsg)

      const analysis = analyzeRequest(userRequest)
      const enabledAgents = agents.filter((a) => a.enabled)

      for (const agent of enabledAgents) {
        setCurrentAgent(agent.id)

        addLog({
          id: Date.now().toString() + "-start",
          agentId: agent.id,
          agentName: agent.name,
          message: "Starting " + agent.name + "...",
          timestamp: new Date(),
          type: "info",
        })

        // Simulate processing time
        await new Promise((resolve) => setTimeout(resolve, 1500 + Math.random() * 1000))

        let responseContent = ""

        if (agent.id === "planner") {
          responseContent = generatePlannerResponse(analysis)
        } else if (agent.id === "coder") {
          const files = generateCode(analysis)
          files.forEach((file) => addGeneratedFile(file))
          responseContent = generateCoderResponse(analysis, files)
        } else if (agent.id === "reviewer") {
          responseContent = generateReviewerResponse(analysis)
        } else if (agent.id === "executor") {
          responseContent = generateExecutorResponse(analysis)
        }

        const agentMsg: Message = {
          id: Date.now().toString() + "-" + agent.id,
          role: "assistant",
          content: responseContent,
          agentId: agent.id,
          agentName: agent.name,
          timestamp: new Date(),
        }
        addMessage(agentMsg)

        addLog({
          id: Date.now().toString() + "-complete",
          agentId: agent.id,
          agentName: agent.name,
          message: agent.name + " completed successfully",
          timestamp: new Date(),
          type: "success",
        })

        await new Promise((resolve) => setTimeout(resolve, 500))
      }

      setCurrentAgent(null)
      setIsExecuting(false)
    },
    [agents, addMessage, addLog, addGeneratedFile, setCurrentAgent, clearMessages, clearLogs, clearGeneratedFiles],
  )

  return { executeWorkflow, isExecuting }
}
