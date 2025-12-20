"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  ArrowLeft,
  Book,
  Bot,
  Code2,
  Database,
  GitBranch,
  Key,
  Rocket,
  Settings,
  Workflow,
  Zap,
  FileText,
  Shield,
  Play,
  Brain,
  Eye,
  ExternalLink,
} from "lucide-react"

const sections = [
  {
    id: "getting-started",
    title: "Erste Schritte",
    icon: Rocket,
    items: [
      { title: "Installation", href: "#installation" },
      { title: "API Keys konfigurieren", href: "#api-keys" },
      { title: "Erstes Projekt", href: "#first-project" },
    ]
  },
  {
    id: "agents",
    title: "Agenten",
    icon: Bot,
    items: [
      { title: "Planner Agent", href: "#planner" },
      { title: "Coder Agent", href: "#coder" },
      { title: "Reviewer Agent", href: "#reviewer" },
      { title: "Security Agent", href: "#security" },
      { title: "Executor Agent", href: "#executor" },
    ]
  },
  {
    id: "workflows",
    title: "Workflows",
    icon: Workflow,
    items: [
      { title: "Workflow Designer", href: "#workflow-designer" },
      { title: "Templates", href: "#templates" },
      { title: "Human-in-the-Loop", href: "#human-in-the-loop" },
    ]
  },
  {
    id: "knowledge-base",
    title: "Knowledge Base",
    icon: Database,
    items: [
      { title: "Dokumente hochladen", href: "#upload" },
      { title: "RAG-System", href: "#rag" },
      { title: "Agent-Zuweisung", href: "#agent-assignment" },
    ]
  },
  {
    id: "deployment",
    title: "Deployment",
    icon: GitBranch,
    items: [
      { title: "GitHub Integration", href: "#github" },
      { title: "Render.com", href: "#render" },
      { title: "Export", href: "#export" },
    ]
  },
]

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Link href="/builder">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Zurück
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Book className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">Dokumentation</h1>
            </div>
          </div>
          <Badge variant="outline">v1.0.0</Badge>
        </div>
      </header>

      <div className="flex max-w-7xl mx-auto">
        {/* Sidebar */}
        <aside className="w-64 border-r border-border p-4 sticky top-14 h-[calc(100vh-3.5rem)]">
          <ScrollArea className="h-full pr-4">
            <nav className="space-y-4">
              {sections.map((section) => {
                const Icon = section.icon
                return (
                  <div key={section.id}>
                    <h3 className="flex items-center gap-2 font-medium text-sm mb-2">
                      <Icon className="h-4 w-4" />
                      {section.title}
                    </h3>
                    <ul className="space-y-1 ml-6">
                      {section.items.map((item) => (
                        <li key={item.href}>
                          <a 
                            href={item.href}
                            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {item.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </nav>
          </ScrollArea>
        </aside>

        {/* Content */}
        <main className="flex-1 p-8">
          <div className="prose prose-invert max-w-none">
            {/* Getting Started */}
            <section id="getting-started" className="mb-12">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <Rocket className="h-6 w-6 text-primary" />
                Erste Schritte
              </h2>
              
              <Card className="mb-6" id="installation">
                <CardHeader>
                  <CardTitle>Installation</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    AgentForge kann lokal oder auf einem Server betrieben werden.
                  </p>
                  <pre className="bg-secondary p-4 rounded-lg overflow-x-auto">
                    <code>{`# Repository klonen
git clone https://github.com/your-repo/agentforge-v2.git
cd agentforge-v2

# Dependencies installieren
npm install

# Entwicklungsserver starten
npm run dev`}</code>
                  </pre>
                </CardContent>
              </Card>

              <Card className="mb-6" id="api-keys">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Key className="h-5 w-5" />
                    API Keys konfigurieren
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Für die Nutzung der KI-Agenten benötigst du mindestens einen API Key:
                  </p>
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2">
                      <Badge>OpenAI</Badge>
                      <span className="text-sm">Für GPT-4o und GPT-4-Turbo Modelle</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Badge>Anthropic</Badge>
                      <span className="text-sm">Für Claude 3.5 Sonnet und Claude 3 Opus</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Badge>OpenRouter</Badge>
                      <span className="text-sm">Zugang zu vielen Modellen über eine API</span>
                    </li>
                  </ul>
                  <p className="text-sm text-muted-foreground">
                    Konfiguriere die Keys unter <Link href="/settings" className="text-primary hover:underline">Einstellungen → API Keys</Link>
                  </p>
                </CardContent>
              </Card>

              <Card id="first-project">
                <CardHeader>
                  <CardTitle>Erstes Projekt erstellen</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                    <li>Klicke auf <strong>"Neues Projekt"</strong> im Builder</li>
                    <li>Gib einen Namen und optionale Beschreibung ein</li>
                    <li>Beschreibe im Chat, was du bauen möchtest</li>
                    <li>Die Agenten analysieren, planen und implementieren</li>
                    <li>Prüfe das Ergebnis in der Live-Vorschau</li>
                  </ol>
                </CardContent>
              </Card>
            </section>

            {/* Agents */}
            <section id="agents" className="mb-12">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <Bot className="h-6 w-6 text-primary" />
                Agenten
              </h2>

              <div className="grid md:grid-cols-2 gap-4">
                <Card id="planner">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Brain className="h-5 w-5 text-blue-500" />
                      Planner Agent
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Analysiert Anforderungen und erstellt einen strukturierten Entwicklungsplan 
                      mit Tasks, Prioritäten und Abhängigkeiten.
                    </p>
                  </CardContent>
                </Card>

                <Card id="coder">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Code2 className="h-5 w-5 text-green-500" />
                      Coder Agent
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Generiert vollständigen, lauffähigen Code basierend auf dem Plan. 
                      Unterstützt React, TypeScript und moderne Frameworks.
                    </p>
                  </CardContent>
                </Card>

                <Card id="reviewer">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Eye className="h-5 w-5 text-purple-500" />
                      Reviewer Agent
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Prüft den generierten Code auf Qualität, Best Practices, 
                      Performance und gibt Verbesserungsvorschläge.
                    </p>
                  </CardContent>
                </Card>

                <Card id="security">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-orange-500" />
                      Security Agent
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Scannt auf Sicherheitslücken wie XSS, SQL Injection, 
                      hardcodierte Secrets und mehr.
                    </p>
                  </CardContent>
                </Card>

                <Card id="executor">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Play className="h-5 w-5 text-cyan-500" />
                      Executor Agent
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Führt Tests aus, erstellt Builds und bereitet das 
                      Deployment vor.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* Workflows */}
            <section id="workflows" className="mb-12">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <Workflow className="h-6 w-6 text-primary" />
                Workflows
              </h2>

              <Card className="mb-6" id="workflow-designer">
                <CardHeader>
                  <CardTitle>Workflow Designer</CardTitle>
                  <CardDescription>Erstelle komplexe Workflows visuell</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Der Workflow Designer ermöglicht es dir, die Reihenfolge und Bedingungen 
                    für die Agent-Ausführung visuell zu definieren.
                  </p>
                  <div className="flex gap-2">
                    <Link href="/builder/workflow">
                      <Button size="sm">
                        <Workflow className="h-4 w-4 mr-2" />
                        Workflow Designer öffnen
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>

              <Card className="mb-6" id="templates">
                <CardHeader>
                  <CardTitle>Workflow Templates</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li><strong>Standard Workflow:</strong> Planner → Coder → Reviewer → Executor</li>
                    <li><strong>Security-Fokus:</strong> Mit zusätzlichem Security-Agent</li>
                    <li><strong>Schnell-Modus:</strong> Nur Planner und Coder</li>
                    <li><strong>Review-Loop:</strong> Mit Human-in-the-Loop Entscheidungen</li>
                  </ul>
                </CardContent>
              </Card>

              <Card id="human-in-the-loop">
                <CardHeader>
                  <CardTitle>Human-in-the-Loop</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Füge Entscheidungspunkte in deinen Workflow ein, an denen du manuell 
                    eingreifen kannst. Der Workflow pausiert und wartet auf deine Auswahl.
                  </p>
                </CardContent>
              </Card>
            </section>

            {/* Knowledge Base */}
            <section id="knowledge-base" className="mb-12">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <Database className="h-6 w-6 text-primary" />
                Knowledge Base
              </h2>

              <Card className="mb-6" id="upload">
                <CardHeader>
                  <CardTitle>Dokumente hochladen</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">
                    Lade Dokumentation, Code-Beispiele oder andere relevante Dateien hoch, 
                    die die Agenten als Kontext nutzen können.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Unterstützte Formate: PDF, TXT, MD, JSON, DOCX
                  </p>
                </CardContent>
              </Card>

              <Card className="mb-6" id="rag">
                <CardHeader>
                  <CardTitle>RAG-System</CardTitle>
                  <CardDescription>Retrieval-Augmented Generation</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Die Knowledge Base nutzt ein RAG-System, um relevante Informationen 
                    aus deinen Dokumenten zu extrahieren und den Agenten bereitzustellen.
                  </p>
                </CardContent>
              </Card>
            </section>

            {/* Deployment */}
            <section id="deployment" className="mb-12">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <GitBranch className="h-6 w-6 text-primary" />
                Deployment
              </h2>

              <Card className="mb-6" id="github">
                <CardHeader>
                  <CardTitle>GitHub Integration</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Pushe dein generiertes Projekt direkt zu einem neuen GitHub Repository. 
                    Konfiguriere deinen GitHub Token unter Einstellungen.
                  </p>
                </CardContent>
              </Card>

              <Card className="mb-6" id="render">
                <CardHeader>
                  <CardTitle>Render.com Deployment</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Nach dem Push zu GitHub kann das Projekt automatisch auf Render.com 
                    deployed werden. One-Click Deployment mit Blueprint-Unterstützung.
                  </p>
                </CardContent>
              </Card>

              <Card id="export">
                <CardHeader>
                  <CardTitle>Export</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Exportiere dein Projekt als ZIP-Datei oder Markdown-Bundle 
                    mit allen Dateien und Setup-Anweisungen.
                  </p>
                </CardContent>
              </Card>
            </section>
          </div>
        </main>
      </div>
    </div>
  )
}
