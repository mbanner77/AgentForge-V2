"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Send, Bot, User, Brain, Code2, Eye, Play, Loader2, Copy, Check, Shield, Sparkles, Lightbulb, ShoppingCart, ListTodo, BarChart3, MessageSquare, Calendar } from "lucide-react"
import type { Message } from "@/lib/types"

interface BuilderChatProps {
  messages: Message[]
  onSendMessage: (content: string) => void
  isProcessing: boolean
  onImplementSuggestion?: (suggestion: string) => void
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

// Quick Start Templates für neue Benutzer
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

export function BuilderChat({ messages, onSendMessage, isProcessing, onImplementSuggestion }: BuilderChatProps) {
  const [input, setInput] = useState("")
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

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
          {isProcessing && (
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

      <form onSubmit={handleSubmit} className="absolute bottom-0 left-0 right-0 border-t border-border bg-background p-4">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={messages.length > 1 
              ? "Beschreibe weitere Verbesserungen... (z.B. 'Füge eine Suchfunktion hinzu')" 
              : "Beschreibe deine App... (z.B. 'Erstelle einen Todo-Manager mit Dark Mode')"}
            className="min-h-[80px] resize-none"
            disabled={isProcessing}
          />
          <Button type="submit" size="icon" className="h-[80px] w-[60px]" disabled={isProcessing || !input.trim()}>
            {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Drücke Enter zum Senden, Shift+Enter für neue Zeile</p>
      </form>
    </div>
  )
}
