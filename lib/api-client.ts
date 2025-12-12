// API Client für LLM-Kommunikation

interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

interface ChatResponse {
  content: string
  usage: {
    promptTokens: number
    completionTokens: number
  }
}

interface ChatOptions {
  messages: ChatMessage[]
  model: string
  temperature: number
  maxTokens: number
  apiKey: string
  provider: "openai" | "anthropic" | "openrouter"
}

export async function sendChatRequest(options: ChatOptions): Promise<ChatResponse> {
  // Validiere Optionen vor dem Senden
  if (!options.apiKey) {
    throw new Error("API Key fehlt. Bitte in den Einstellungen konfigurieren.")
  }
  if (!options.messages || options.messages.length === 0) {
    throw new Error("Keine Nachrichten für API-Anfrage.")
  }
  if (!options.model) {
    throw new Error("Kein Model angegeben.")
  }
  
  console.log("[API Client] Sende Anfrage:", {
    model: options.model,
    provider: options.provider,
    messageCount: options.messages.length,
    hasApiKey: !!options.apiKey,
  })

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(options),
  })

  if (!response.ok) {
    let errorMessage = `API Fehler: ${response.status}`
    try {
      const error = await response.json()
      errorMessage = error.error || errorMessage
      console.error("[API Client] Fehler:", error)
    } catch {
      console.error("[API Client] Konnte Fehler nicht parsen:", response.statusText)
    }
    throw new Error(errorMessage)
  }

  return response.json()
}

// Hilfsfunktion um Provider aus Model-Name zu ermitteln
export function getProviderFromModel(model: string): "openai" | "anthropic" | "openrouter" {
  // OpenRouter Modelle haben ein spezielles Präfix oder sind in der Liste
  if (model.startsWith("openrouter/") || openRouterModels.some(m => m.id === model)) {
    return "openrouter"
  }
  if (model.startsWith("claude") || model.includes("anthropic")) {
    return "anthropic"
  }
  return "openai"
}

// OpenRouter Modelle - aktuelle Model-IDs (Stand Dezember 2024)
// WICHTIG: Model-IDs müssen exakt mit OpenRouter übereinstimmen
export const openRouterModels = [
  { id: "openrouter/auto", name: "Auto (Best for prompt)", provider: "openrouter" as const },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet (OR)", provider: "openrouter" as const },
  { id: "anthropic/claude-3-opus", name: "Claude 3 Opus (OR)", provider: "openrouter" as const },
  { id: "openai/gpt-4o", name: "GPT-4o (OR)", provider: "openrouter" as const },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini (OR)", provider: "openrouter" as const },
  { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash (OR)", provider: "openrouter" as const },
  { id: "google/gemini-2.5-pro-preview", name: "Gemini 2.5 Pro (OR)", provider: "openrouter" as const },
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B (OR)", provider: "openrouter" as const },
  { id: "mistralai/mistral-large-2411", name: "Mistral Large (OR)", provider: "openrouter" as const },
  { id: "deepseek/deepseek-chat", name: "DeepSeek Chat (OR)", provider: "openrouter" as const },
  { id: "qwen/qwen-2.5-72b-instruct", name: "Qwen 2.5 72B (OR)", provider: "openrouter" as const },
]

// Mapping für Model-IDs die angepasst werden müssen
export function normalizeModelId(model: string): string {
  // OpenRouter Model-ID Korrekturen
  const modelMappings: Record<string, string> = {
    "google/gemini-pro-1.5": "google/gemini-pro-1.5",
    "google/gemini-flash-1.5": "google/gemini-flash-1.5", 
    "meta-llama/llama-3.1-405b-instruct": "meta-llama/llama-3.1-405b-instruct",
    "meta-llama/llama-3.1-70b-instruct": "meta-llama/llama-3.1-70b-instruct",
  }
  return modelMappings[model] || model
}

// Verfügbare Modelle (OpenAI & Anthropic direkt)
export const availableModels = [
  { id: "gpt-4o", name: "GPT-4o", provider: "openai" as const },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai" as const },
  { id: "gpt-4-turbo", name: "GPT-4 Turbo", provider: "openai" as const },
  { id: "gpt-4", name: "GPT-4", provider: "openai" as const },
  { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", provider: "openai" as const },
  { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", provider: "anthropic" as const },
  { id: "claude-3-opus-20240229", name: "Claude 3 Opus", provider: "anthropic" as const },
  { id: "claude-3-sonnet-20240229", name: "Claude 3 Sonnet", provider: "anthropic" as const },
  { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku", provider: "anthropic" as const },
]

// Alle Modelle kombiniert
export const allModels = [...availableModels, ...openRouterModels]
