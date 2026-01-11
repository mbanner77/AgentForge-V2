"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Send, Bot, User, Brain, Code2, Eye, Play, Loader2, Copy, Check, Shield, Sparkles, Lightbulb, ShoppingCart, ListTodo, BarChart3, MessageSquare, Calendar, Bug, Plus, RefreshCw, Wand2, Zap, ArrowRight, HelpCircle, FileCode, Rocket, Search, Filter, Database, Users, Settings, Image, Mail } from "lucide-react"
import type { Message } from "@/lib/types"

interface BuilderChatProps {
  messages: Message[]
  onSendMessage: (content: string) => void
  isProcessing: boolean
  onImplementSuggestion?: (suggestion: string) => void
  streamingContent?: string // Live-Streaming-Inhalt
  streamingAgent?: string // Welcher Agent gerade streamt
  hasFiles?: boolean // Ob bereits Dateien generiert wurden
  lastError?: string | null // Letzter Fehler aus der Preview
}

const agentIcons: Record<string, typeof Bot> = {
  system: Bot,
  planner: Brain,
  coder: Code2,
  reviewer: Eye,
  security: Shield,
  executor: Play,
}

const agentColors: Record<string, string> = {
  system: "bg-primary",
  planner: "bg-chart-1",
  coder: "bg-chart-2",
  reviewer: "bg-chart-3",
  security: "bg-orange-500",
  executor: "bg-chart-4",
}

const agentLabels: Record<string, string> = {
  system: "AgentForge",
  planner: "Planner Agent",
  coder: "Coder Agent",
  reviewer: "Reviewer Agent",
  security: "Security Agent",
  executor: "Executor Agent",
}

// Quick Start Templates für neue Benutzer - Erweitert mit mehr Optionen
const quickStartTemplates = [
  {
    icon: ListTodo,
    title: "Todo-App",
    prompt: "Erstelle eine moderne Todo-App mit Kategorien, Prioritäten, Fälligkeitsdaten und Dark Mode. Die Aufgaben sollen lokal gespeichert werden.",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/20",
  },
  {
    icon: ShoppingCart,
    title: "E-Commerce",
    prompt: "Baue einen Produkt-Katalog mit Warenkorb-Funktion, Produktfilterung nach Kategorie und Preis, sowie einer modernen Checkout-Seite.",
    color: "text-green-500",
    bgColor: "bg-green-500/10 hover:bg-green-500/20 border-green-500/20",
  },
  {
    icon: BarChart3,
    title: "Dashboard",
    prompt: "Erstelle ein Analytics-Dashboard mit verschiedenen Charts (Linien, Balken, Pie), KPI-Cards und einer Datumsauswahl für Zeiträume.",
    color: "text-purple-500",
    bgColor: "bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/20",
  },
  {
    icon: MessageSquare,
    title: "Chat-App",
    prompt: "Entwickle eine Chat-Anwendung mit Nachrichtenverlauf, Emoji-Support, Zeitstempel und einem modernen WhatsApp-ähnlichen Design.",
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/20",
  },
  {
    icon: Calendar,
    title: "Kalender",
    prompt: "Baue einen interaktiven Kalender mit Terminverwaltung, Monats-, Wochen- und Tagesansicht, Drag-and-Drop für Events.",
    color: "text-orange-500",
    bgColor: "bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/20",
  },
  {
    icon: Lightbulb,
    title: "Notizen-App",
    prompt: "Erstelle eine Notizen-App im Notion-Stil mit Markdown-Unterstützung, Ordnerstruktur, Suchfunktion und Auto-Save.",
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10 hover:bg-yellow-500/20 border-yellow-500/20",
  },
  {
    icon: Users,
    title: "CRM System",
    prompt: "Erstelle ein Kontakt-Management-System mit Kundenübersicht, Suchfunktion, Aktivitäts-Timeline, Tags und Export-Funktion.",
    color: "text-indigo-500",
    bgColor: "bg-indigo-500/10 hover:bg-indigo-500/20 border-indigo-500/20",
  },
  {
    icon: Image,
    title: "Galerie",
    prompt: "Baue eine Bildergalerie mit Grid-Layout, Lightbox-Ansicht, Kategorien, Lazy-Loading und Drag-and-Drop Upload.",
    color: "text-pink-500",
    bgColor: "bg-pink-500/10 hover:bg-pink-500/20 border-pink-500/20",
  },
  {
    icon: Rocket,
    title: "Landing Page",
    prompt: "Erstelle eine moderne Landing Page mit Hero-Section, Features-Grid, Testimonials, Pricing-Tabelle und Kontakt-Formular.",
    color: "text-red-500",
    bgColor: "bg-red-500/10 hover:bg-red-500/20 border-red-500/20",
  },
]

function SimpleMarkdown({ content }: { content: string }) {
  const lines = content.split("\n")
  const elements: React.ReactNode[] = []

  lines.forEach((line, index) => {
    // Headers
    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={index} className="mt-4 mb-2 text-base font-semibold">
          {line.slice(4)}
        </h3>,
      )
    } else if (line.startsWith("## ")) {
      elements.push(
        <h2 key={index} className="mt-4 mb-2 text-lg font-semibold">
          {line.slice(3)}
        </h2>,
      )
    } else if (line.startsWith("# ")) {
      elements.push(
        <h1 key={index} className="mt-4 mb-2 text-xl font-bold">
          {line.slice(2)}
        </h1>,
      )
    }
    // List items
    else if (line.startsWith("- ")) {
      elements.push(
        <li key={index} className="ml-4 list-disc">
          {formatInlineMarkdown(line.slice(2))}
        </li>,
      )
    } else if (/^\d+\.\s/.test(line)) {
      const text = line.replace(/^\d+\.\s/, "")
      elements.push(
        <li key={index} className="ml-4 list-decimal">
          {formatInlineMarkdown(text)}
        </li>,
      )
    }
    // Code blocks (inline)
    else if (line.startsWith("`") && line.endsWith("`") && line.length > 2) {
      elements.push(
        <code key={index} className="rounded bg-secondary px-1 py-0.5 font-mono text-xs">
          {line.slice(1, -1)}
        </code>,
      )
    }
    // Empty lines
    else if (line.trim() === "") {
      elements.push(<br key={index} />)
    }
    // Regular paragraphs
    else {
      elements.push(
        <p key={index} className="my-1">
          {formatInlineMarkdown(line)}
        </p>,
      )
    }
  })

  return <div className="space-y-0.5">{elements}</div>
}

function formatInlineMarkdown(text: string): React.ReactNode {
  // Handle bold **text**
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)

  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="rounded bg-secondary px-1 py-0.5 font-mono text-xs">
          {part.slice(1, -1)}
        </code>
      )
    }
    return part
  })
}

// Quick Actions für kontextuelle Aktionen - Erweitert
const quickActions = [
  {
    icon: Bug,
    label: "Bug fixen",
    prompt: "Bitte behebe den folgenden Fehler: ",
    color: "text-red-500",
    bgColor: "bg-red-500/10 hover:bg-red-500/20 border-red-500/30",
    needsInput: true,
    placeholder: "Beschreibe den Fehler oder füge die Fehlermeldung ein...",
  },
  {
    icon: Plus,
    label: "Feature",
    prompt: "Füge folgendes Feature hinzu: ",
    color: "text-green-500",
    bgColor: "bg-green-500/10 hover:bg-green-500/20 border-green-500/30",
    needsInput: true,
    placeholder: "Beschreibe das neue Feature...",
  },
  {
    icon: Wand2,
    label: "Design",
    prompt: "Verbessere das Design: Mache die App moderner und ansprechender mit besseren Farben, Animationen, Hover-Effekten und Layout.",
    color: "text-purple-500",
    bgColor: "bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/30",
    needsInput: false,
  },
  {
    icon: RefreshCw,
    label: "Refactor",
    prompt: "Refaktoriere den Code: Verbessere die Code-Struktur, extrahiere wiederverwendbare Komponenten und optimiere die Performance.",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30",
    needsInput: false,
  },
  {
    icon: Search,
    label: "Suche",
    prompt: "Füge eine Suchfunktion hinzu: Implementiere eine Echtzeit-Suche mit Filter-Optionen und Highlighting der Treffer.",
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/30",
    needsInput: false,
  },
  {
    icon: Database,
    label: "Speichern",
    prompt: "Füge Datenpersistenz hinzu: Speichere alle Daten im localStorage, sodass sie nach einem Reload erhalten bleiben.",
    color: "text-orange-500",
    bgColor: "bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/30",
    needsInput: false,
  },
  {
    icon: Filter,
    label: "Filter",
    prompt: "Füge Filter- und Sortier-Optionen hinzu: Implementiere Dropdown-Filter und Sortierung nach verschiedenen Kriterien.",
    color: "text-indigo-500",
    bgColor: "bg-indigo-500/10 hover:bg-indigo-500/20 border-indigo-500/30",
    needsInput: false,
  },
]

export function BuilderChat({ messages, onSendMessage, isProcessing, onImplementSuggestion, streamingContent, streamingAgent, hasFiles, lastError }: BuilderChatProps) {
  const [input, setInput] = useState("")
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showQuickActions, setShowQuickActions] = useState(false)
  const [selectedAction, setSelectedAction] = useState<typeof quickActions[0] | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Smart Prompt Suggestions basierend auf Eingabe - Erweitert
  const getSmartSuggestions = (text: string): string[] => {
    const suggestions: string[] = []
    const lowerText = text.toLowerCase()
    
    // Feature-basierte Vorschläge
    if (lowerText.includes('such') || lowerText.includes('search')) {
      suggestions.push('Füge eine Suchfunktion mit Echtzeit-Filterung hinzu')
    }
    if (lowerText.includes('filter') || lowerText.includes('sort')) {
      suggestions.push('Implementiere Filter- und Sortier-Optionen')
    }
    if (lowerText.includes('login') || lowerText.includes('auth') || lowerText.includes('anmeld')) {
      suggestions.push('Füge Benutzer-Authentifizierung mit Login/Logout hinzu')
    }
    if (lowerText.includes('dark') || lowerText.includes('theme') || lowerText.includes('hell') || lowerText.includes('dunkel')) {
      suggestions.push('Implementiere Dark/Light Mode Toggle')
    }
    if (lowerText.includes('responsive') || lowerText.includes('mobil') || lowerText.includes('handy')) {
      suggestions.push('Mache das Layout vollständig responsive für Mobile')
    }
    if (lowerText.includes('speicher') || lowerText.includes('save') || lowerText.includes('persist')) {
      suggestions.push('Füge lokale Datenspeicherung (localStorage) hinzu')
    }
    if (lowerText.includes('animation') || lowerText.includes('animat') || lowerText.includes('übergang')) {
      suggestions.push('Füge flüssige Animationen und Übergänge hinzu')
    }
    if (lowerText.includes('export') || lowerText.includes('download') || lowerText.includes('herunterlad')) {
      suggestions.push('Implementiere Export-Funktion (CSV/PDF)')
    }
    if (lowerText.includes('chart') || lowerText.includes('graph') || lowerText.includes('statistik') || lowerText.includes('diagramm')) {
      suggestions.push('Füge interaktive Charts mit Recharts hinzu')
    }
    if (lowerText.includes('drag') || lowerText.includes('drop') || lowerText.includes('zieh')) {
      suggestions.push('Implementiere Drag-and-Drop Funktionalität')
    }
    // Neue Keywords
    if (lowerText.includes('modal') || lowerText.includes('dialog') || lowerText.includes('popup')) {
      suggestions.push('Füge Modal/Dialog Komponenten hinzu')
    }
    if (lowerText.includes('tab') || lowerText.includes('reiter')) {
      suggestions.push('Implementiere Tab-Navigation für bessere Struktur')
    }
    if (lowerText.includes('formular') || lowerText.includes('form') || lowerText.includes('eingabe')) {
      suggestions.push('Erstelle ein Formular mit Validierung')
    }
    if (lowerText.includes('liste') || lowerText.includes('list') || lowerText.includes('tabelle')) {
      suggestions.push('Füge eine sortierbare Tabelle/Liste hinzu')
    }
    if (lowerText.includes('benachricht') || lowerText.includes('toast') || lowerText.includes('notification')) {
      suggestions.push('Implementiere Toast-Benachrichtigungen')
    }
    if (lowerText.includes('laden') || lowerText.includes('loading') || lowerText.includes('spinner')) {
      suggestions.push('Füge Loading-States und Skeleton-Komponenten hinzu')
    }
    if (lowerText.includes('pagini') || lowerText.includes('seite') || lowerText.includes('blätter')) {
      suggestions.push('Implementiere Pagination für große Datenmengen')
    }
    if (lowerText.includes('profil') || lowerText.includes('user') || lowerText.includes('benutzer')) {
      suggestions.push('Erstelle eine Benutzer-Profil Seite')
    }
    if (lowerText.includes('einstellung') || lowerText.includes('setting') || lowerText.includes('konfig')) {
      suggestions.push('Füge eine Einstellungen-Seite hinzu')
    }
    
    return suggestions.slice(0, 3) // Max 3 Vorschläge
  }

  const smartSuggestions = input.length > 3 ? getSmartSuggestions(input) : []

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamingContent])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isProcessing) return
    onSendMessage(input)
    setInput("")
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const handleCopy = (content: string, id: string) => {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Prüft ob nur die Willkommensnachricht vorhanden ist
  const showQuickStart = messages.length <= 1 && !isProcessing

  return (
    <div className="relative flex flex-col" style={{ height: '100%' }}>
      <div ref={scrollRef} className="absolute inset-0 bottom-[140px] overflow-y-auto">
        <div className="space-y-4 p-4">
          {messages.map((message) => {
            const agentKey = message.agent || "system"
            // Robuste Icon-Auswahl mit mehreren Fallbacks
            let Icon = Bot // Default
            if (message.role === "user") {
              Icon = User
            } else if (agentIcons[agentKey]) {
              Icon = agentIcons[agentKey]
            }
            const bgColor = message.role === "user" ? "bg-secondary" : (agentColors[agentKey] || "bg-primary")

            return (
              <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}>
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className={bgColor}>
                    <Icon className="h-4 w-4 text-primary-foreground" />
                  </AvatarFallback>
                </Avatar>
                <div
                  className={`group relative max-w-[85%] rounded-lg px-4 py-3 ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {message.role === "assistant" && (
                    <div className="mb-2 flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {agentLabels[agentKey]}
                      </Badge>
                      {message.metadata?.tokensUsed && (
                        <span className="text-xs text-muted-foreground">{message.metadata.tokensUsed} Tokens</span>
                      )}
                    </div>
                  )}
                  <div className="text-sm">
                    <SimpleMarkdown content={message.content.replace(/<!-- IMPLEMENT_SUGGESTION:[^>]+ -->/g, '')} />
                  </div>
                  {/* Button zum Umsetzen von Vorschlägen */}
                  {message.content.includes('<!-- IMPLEMENT_SUGGESTION:') && onImplementSuggestion && (
                    <div className="mt-3 pt-3 border-t border-border/50">
                      <Button
                        size="sm"
                        className="gap-2"
                        onClick={() => {
                          const match = message.content.match(/<!-- IMPLEMENT_SUGGESTION:(.+?) -->/)
                          if (match) {
                            onImplementSuggestion(match[1])
                          }
                        }}
                        disabled={isProcessing}
                      >
                        <Sparkles className="h-4 w-4" />
                        Vorschlag jetzt umsetzen
                      </Button>
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs opacity-50">
                      {new Date(message.timestamp).toLocaleTimeString("de-DE", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => handleCopy(message.content, message.id)}
                    >
                      {copiedId === message.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
          {/* Streaming Message - Live-Anzeige während Generierung */}
          {streamingContent && isProcessing && (
            <div className="flex gap-3">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className={agentColors[streamingAgent || "system"] || "bg-primary"}>
                  {(() => {
                    const StreamIcon = agentIcons[streamingAgent || "system"] || Bot
                    return <StreamIcon className="h-4 w-4 text-primary-foreground" />
                  })()}
                </AvatarFallback>
              </Avatar>
              <div className="group relative max-w-[85%] rounded-lg px-4 py-3 bg-secondary text-secondary-foreground">
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {agentLabels[streamingAgent || "system"] || "Agent"}
                  </Badge>
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Generiert...</span>
                </div>
                <div className="text-sm">
                  <SimpleMarkdown content={streamingContent} />
                  <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5" />
                </div>
              </div>
            </div>
          )}
          
          {isProcessing && !streamingContent && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Agenten arbeiten...
            </div>
          )}
          
          {/* Quick Start Templates */}
          {showQuickStart && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lightbulb className="h-4 w-4 text-yellow-500" />
                <span>Schnellstart - Wähle eine Vorlage oder beschreibe deine eigene App</span>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {quickStartTemplates.map((template) => {
                  const TemplateIcon = template.icon
                  return (
                    <button
                      key={template.title}
                      onClick={() => onSendMessage(template.prompt)}
                      disabled={isProcessing}
                      className={`group flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-all ${template.bgColor} hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50`}
                    >
                      <div className="flex items-center gap-2">
                        <TemplateIcon className={`h-5 w-5 ${template.color}`} />
                        <span className="font-medium text-sm">{template.title}</span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {template.prompt.slice(0, 80)}...
                      </p>
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-center text-muted-foreground">
                Oder beschreibe deine eigene App im Textfeld unten
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 border-t border-border bg-background">
        {/* Quick Actions Panel - nur anzeigen wenn Dateien existieren */}
        {hasFiles && !isProcessing && (
          <div className="px-4 pt-3 pb-2 border-b border-border/50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Zap className="h-3 w-3 text-primary" />
                <span className="text-xs font-medium text-muted-foreground">Quick Actions</span>
              </div>
              <span className="text-xs text-muted-foreground">Klicke für schnelle Änderungen</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {quickActions.map((action) => {
                const ActionIcon = action.icon
                return (
                  <button
                    key={action.label}
                    onClick={() => {
                      if (action.needsInput) {
                        setSelectedAction(action)
                        setInput(action.prompt)
                        textareaRef.current?.focus()
                      } else {
                        onSendMessage(action.prompt)
                      }
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-all ${action.bgColor}`}
                  >
                    <ActionIcon className={`h-3.5 w-3.5 ${action.color}`} />
                    {action.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Error Banner - wenn ein Fehler erkannt wurde */}
        {lastError && hasFiles && !isProcessing && (
          <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bug className="h-4 w-4 text-red-500" />
              <span className="text-xs text-red-400">Fehler erkannt in der Preview</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-red-500/30 text-red-400 hover:bg-red-500/20"
              onClick={() => onSendMessage(`Bitte behebe diesen Fehler: ${lastError}`)}
            >
              <Wand2 className="h-3 w-3 mr-1" />
              Auto-Fix
            </Button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-4">
          <div className="flex gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                if (selectedAction && !e.target.value.startsWith(selectedAction.prompt)) {
                  setSelectedAction(null)
                }
              }}
              onKeyDown={handleKeyDown}
              placeholder={selectedAction?.placeholder || (messages.length > 1 
                ? "Beschreibe weitere Verbesserungen... (z.B. 'Füge eine Suchfunktion hinzu')" 
                : "Beschreibe deine App... (z.B. 'Erstelle einen Todo-Manager mit Dark Mode')")}
              className="min-h-[80px] resize-none"
              disabled={isProcessing}
            />
            <Button type="submit" size="icon" className="h-[80px] w-[60px]" disabled={isProcessing || !input.trim()}>
              {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </Button>
          </div>
          {/* Smart Suggestions */}
          {smartSuggestions.length > 0 && !isProcessing && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Lightbulb className="h-3 w-3 text-yellow-500" />
                <span>Vorschläge:</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {smartSuggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setInput(suggestion)}
                    className="text-xs px-2 py-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Enter zum Senden, Shift+Enter für neue Zeile</p>
            <div className="flex items-center gap-2">
              {hasFiles && (
                <button
                  type="button"
                  onClick={() => onSendMessage('Erkläre mir den aktuellen Code: Was macht die App und wie ist sie strukturiert?')}
                  className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                  title="Code erklären lassen"
                >
                  <HelpCircle className="h-3 w-3" />
                  Erklären
                </button>
              )}
              {hasFiles && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <ArrowRight className="h-3 w-3" />
                  Iteration
                </span>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
