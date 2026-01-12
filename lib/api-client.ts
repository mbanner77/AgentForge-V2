// API Client für LLM-Kommunikation

interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string | VisionContent[]
}

interface VisionContent {
  type: "text" | "image_url"
  text?: string
  image_url?: {
    url: string // base64 data URL oder HTTP URL
  }
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
  
  const MAX_RETRIES = 3
  const RETRY_DELAY_BASE = 2000 // 2 Sekunden Basis-Delay
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log("[API Client] Sende Anfrage:", {
      model: options.model,
      provider: options.provider,
      messageCount: options.messages.length,
      hasApiKey: !!options.apiKey,
      attempt,
    })

    try {
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
        
        // Retry bei 502, 503, 504 (Gateway-Fehler) oder 429 (Rate Limit)
        const retryableStatuses = [502, 503, 504, 429]
        if (retryableStatuses.includes(response.status) && attempt < MAX_RETRIES) {
          const delay = RETRY_DELAY_BASE * Math.pow(2, attempt - 1) // Exponential backoff
          console.log(`[API Client] Retry ${attempt}/${MAX_RETRIES} nach ${delay}ms...`)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
        
        throw new Error(errorMessage)
      }

      return response.json()
    } catch (error) {
      // Bei Netzwerkfehlern auch retry
      if (error instanceof TypeError && error.message.includes('fetch') && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_BASE * Math.pow(2, attempt - 1)
        console.log(`[API Client] Netzwerkfehler, Retry ${attempt}/${MAX_RETRIES} nach ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      throw error
    }
  }
  
  throw new Error("Maximale Anzahl an Versuchen erreicht")
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
  { id: "anthropic/claude-3.5-sonnet:beta", name: "Claude 3.5 Sonnet Beta (OR)", provider: "openrouter" as const },
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
  { id: "claude-3-5-sonnet-latest", name: "Claude 3.5 Sonnet (Latest)", provider: "anthropic" as const },
  { id: "claude-3-sonnet-20240229", name: "Claude 3 Sonnet", provider: "anthropic" as const },
  { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku", provider: "anthropic" as const },
]

// Alle Modelle kombiniert
export const allModels = [...availableModels, ...openRouterModels]

// Streaming Chat Request - Token für Token
export interface StreamCallbacks {
  onToken: (token: string) => void
  onComplete: (fullContent: string) => void
  onError: (error: string) => void
}

export async function sendStreamingChatRequest(
  options: ChatOptions,
  callbacks: StreamCallbacks
): Promise<void> {
  if (!options.apiKey) {
    callbacks.onError("API Key fehlt. Bitte in den Einstellungen konfigurieren.")
    return
  }
  
  console.log("[API Client] Starte Streaming-Anfrage:", {
    model: options.model,
    provider: options.provider,
    messageCount: options.messages.length,
  })

  try {
    const response = await fetch("/api/chat/stream", {
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
      } catch {
        // Ignore parse error
      }
      callbacks.onError(errorMessage)
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      callbacks.onError("Keine Streaming-Response erhalten")
      return
    }

    const decoder = new TextDecoder()
    let fullContent = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split("\n").filter(line => line.trim() !== "")

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6)
          if (data === "[DONE]") {
            callbacks.onComplete(fullContent)
            return
          }

          try {
            const json = JSON.parse(data)
            if (json.content) {
              fullContent += json.content
              callbacks.onToken(json.content)
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }

    callbacks.onComplete(fullContent)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Streaming-Fehler"
    callbacks.onError(errorMessage)
  }
}

// Prompt Enhancement - verbessert vage Prompts
export async function enhancePrompt(
  userPrompt: string,
  apiKey: string,
  provider: "openai" | "anthropic" | "openrouter"
): Promise<string> {
  const enhancementPrompt = `Du bist ein Prompt-Optimizer für eine AI-Coding-App.

Analysiere den folgenden User-Prompt und verbessere ihn, um bessere Code-Generierung zu ermöglichen.

REGELN:
1. Wenn der Prompt bereits spezifisch ist, gib ihn unverändert zurück
2. Füge technische Details hinzu (Framework, Styling, Features)
3. Behalte die ursprüngliche Intention bei
4. Antworte NUR mit dem verbesserten Prompt, keine Erklärungen

BEISPIELE:
- "mach eine todo app" → "Erstelle eine React Todo-App mit TypeScript, Tailwind CSS und lokalem State. Features: Aufgaben hinzufügen, als erledigt markieren, löschen. Modernes UI mit Schatten und abgerundeten Ecken."
- "landing page für startup" → "Erstelle eine moderne Landing Page für ein Tech-Startup mit React und Tailwind CSS. Sections: Hero mit CTA-Button, Features-Grid mit Icons, Testimonials, Pricing-Tabelle, Footer. Responsive Design, sanfte Animationen."

USER-PROMPT:
${userPrompt}

VERBESSERTER PROMPT:`

  try {
    const response = await sendChatRequest({
      messages: [{ role: "user", content: enhancementPrompt }],
      model: provider === "openrouter" ? "openrouter/auto" : "gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 500,
      apiKey,
      provider,
    })
    
    const enhanced = response.content.trim()
    
    // Wenn das Original länger als 100 Zeichen war, war es wahrscheinlich schon spezifisch
    if (userPrompt.length > 100 || enhanced.length < userPrompt.length) {
      return userPrompt
    }
    
    console.log("[Prompt Enhancement] Original:", userPrompt)
    console.log("[Prompt Enhancement] Enhanced:", enhanced)
    
    return enhanced
  } catch (error) {
    console.warn("[Prompt Enhancement] Fehler, verwende Original:", error)
    return userPrompt
  }
}

// ============================================================
// SCREENSHOT TO CODE - Vision API
// ============================================================

export interface ScreenshotToCodeOptions {
  imageBase64: string // Base64 encoded image (ohne data: prefix)
  imageType: "png" | "jpeg" | "webp" | "gif"
  additionalInstructions?: string
  apiKey: string
  provider: "openai" | "anthropic" | "openrouter"
  targetEnvironment?: "sandpack" | "nextjs"
}

export async function screenshotToCode(options: ScreenshotToCodeOptions): Promise<string> {
  const { imageBase64, imageType, additionalInstructions, apiKey, provider, targetEnvironment = "nextjs" } = options
  
  const isNextJs = targetEnvironment === "nextjs"
  
  const systemPrompt = `Du bist ein Experte für UI/UX Design und React-Entwicklung.
Deine Aufgabe: Analysiere das Screenshot/Mockup und erstelle PIXEL-PERFEKTEN React-Code.

## 🎯 ANALYSE-SCHRITTE:
1. **Layout erkennen**: Grid, Flexbox, Spalten, Zeilen
2. **Komponenten identifizieren**: Header, Cards, Listen, Buttons, Forms
3. **Farben extrahieren**: Hintergrund, Text, Akzente, Borders
4. **Abstände messen**: Padding, Margin, Gap
5. **Typografie**: Schriftgrößen, Gewichte, Zeilenhöhen

## REGELN:
${isNextJs ? `
- Verwende Next.js App Router: app/page.tsx + components/*.tsx
- JEDE Komponente beginnt mit "use client";
- Imports: @/components/ComponentName
- Styling: INLINE-STYLES (style={{}}) UND Tailwind als Backup
` : `
- Verwende React: App.tsx + components/*.tsx
- Imports: ./components/ComponentName
- Styling: Inline-Styles (style={{}})
`}

## 🎨 DESIGN-GENAUIGKEIT:
- **Farben**: Verwende exakte HEX-Werte aus dem Screenshot
- **Abstände**: Schätze px-Werte basierend auf dem Layout
- **Schatten**: Repliziere Box-Shadows wenn sichtbar
- **Rundungen**: border-radius entsprechend dem Design
- **Hover-States**: Füge passende Hover-Effekte hinzu

## 📐 LAYOUT-PATTERNS:
- **Grid**: display: "grid", gridTemplateColumns: "repeat(X, 1fr)"
- **Flexbox**: display: "flex", justifyContent, alignItems, gap
- **Responsive**: Verwende relative Einheiten wo sinnvoll

## 🚫 VERBOTEN:
- Placeholder-Text wie "Lorem ipsum" (verwende sinnvolle Beispieldaten)
- Fehlende Komponenten (erstelle ALLES was sichtbar ist)
- Unstyled Elemente

## OUTPUT FORMAT:
Gib für JEDE Datei einen Code-Block aus:
\`\`\`typescript
// filepath: components/ComponentName.tsx
"use client";
// ... vollständiger Code mit Inline-Styles
\`\`\`
`

  const userContent: VisionContent[] = [
    {
      type: "text",
      text: `Analysiere dieses UI-Design und erstelle vollständigen, funktionalen React-Code.
${additionalInstructions ? `\nZusätzliche Anforderungen: ${additionalInstructions}` : ""}

Erstelle ALLE notwendigen Dateien mit vollständigem Code.`
    },
    {
      type: "image_url",
      image_url: {
        url: `data:image/${imageType};base64,${imageBase64}`
      }
    }
  ]

  // Wähle Vision-fähiges Modell
  let model = "gpt-4o" // Default: GPT-4o hat Vision
  if (provider === "anthropic") {
    model = "claude-3-5-sonnet-20241022"
  } else if (provider === "openrouter") {
    model = "openai/gpt-4o" // OpenRouter Syntax
  }

  const response = await sendChatRequest({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ],
    model,
    temperature: 0.2,
    maxTokens: 16000,
    apiKey,
    provider
  })

  return response.content
}
