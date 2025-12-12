import { NextRequest, NextResponse } from "next/server"

export const runtime = "edge"

interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

interface ChatRequest {
  messages: ChatMessage[]
  model: string
  temperature: number
  maxTokens: number
  apiKey: string
  provider: "openai" | "anthropic" | "openrouter"
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json()
    const { messages, model, temperature, maxTokens, apiKey, provider } = body

    // Validierung
    if (!apiKey) {
      console.error("Chat API: API Key fehlt")
      return NextResponse.json(
        { error: "API Key fehlt. Bitte in den Einstellungen konfigurieren." },
        { status: 400 }
      )
    }
    
    if (!messages || messages.length === 0) {
      console.error("Chat API: Keine Nachrichten")
      return NextResponse.json(
        { error: "Keine Nachrichten in der Anfrage." },
        { status: 400 }
      )
    }
    
    if (!model) {
      console.error("Chat API: Kein Model angegeben")
      return NextResponse.json(
        { error: "Kein Model angegeben." },
        { status: 400 }
      )
    }

    if (provider === "anthropic" || model.startsWith("claude")) {
      // Anthropic API
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: model,
          max_tokens: maxTokens,
          messages: messages.filter((m) => m.role !== "system").map((m) => ({
            role: m.role,
            content: m.content,
          })),
          system: messages.find((m) => m.role === "system")?.content || "",
          temperature: temperature,
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        console.error("Anthropic API Error:", error)
        return NextResponse.json(
          { error: `Anthropic API Fehler: ${response.status}` },
          { status: response.status }
        )
      }

      const data = await response.json()
      return NextResponse.json({
        content: data.content[0]?.text || "",
        usage: {
          promptTokens: data.usage?.input_tokens || 0,
          completionTokens: data.usage?.output_tokens || 0,
        },
      })
    } else if (provider === "openrouter") {
      // OpenRouter API - kompatibel mit OpenAI Format
      console.log("[OpenRouter] Sende Anfrage an Model:", model)
      console.log("[OpenRouter] Messages count:", messages.length)
      console.log("[OpenRouter] Max tokens:", maxTokens)
      
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "https://agentforge.dev",
          "X-Title": "AgentForge",
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          temperature: temperature,
          max_tokens: maxTokens,
        }),
      })

      console.log("[OpenRouter] Response status:", response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error("[OpenRouter] API Error:", errorText)
        
        // Parse error for better message
        let errorMessage = `OpenRouter API Fehler: ${response.status}`
        try {
          const errorJson = JSON.parse(errorText)
          if (errorJson.error?.message) {
            errorMessage = `OpenRouter: ${errorJson.error.message}`
          }
        } catch {
          // Use raw error text if not JSON
          if (errorText.length < 200) {
            errorMessage = `OpenRouter: ${errorText}`
          }
        }
        
        return NextResponse.json(
          { error: errorMessage },
          { status: response.status }
        )
      }

      const data = await response.json()
      console.log("[OpenRouter] Response received, choices:", data.choices?.length)
      
      // Check for empty response
      const content = data.choices?.[0]?.message?.content
      if (!content) {
        console.error("[OpenRouter] Empty response:", JSON.stringify(data))
        return NextResponse.json(
          { error: "OpenRouter hat keine Antwort zurückgegeben. Bitte versuche es erneut oder wähle ein anderes Modell." },
          { status: 500 }
        )
      }
      
      return NextResponse.json({
        content: content,
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
        },
      })
    } else {
      // OpenAI API
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          temperature: temperature,
          max_tokens: maxTokens,
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        console.error("OpenAI API Error:", error)
        return NextResponse.json(
          { error: `OpenAI API Fehler: ${response.status}` },
          { status: response.status }
        )
      }

      const data = await response.json()
      return NextResponse.json({
        content: data.choices[0]?.message?.content || "",
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
        },
      })
    }
  } catch (error) {
    console.error("Chat API Error:", error)
    return NextResponse.json(
      { error: "Interner Server-Fehler" },
      { status: 500 }
    )
  }
}
