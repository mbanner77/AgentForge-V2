import { NextRequest } from "next/server"

export const runtime = "edge"

interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

interface StreamRequest {
  messages: ChatMessage[]
  model: string
  temperature: number
  maxTokens: number
  apiKey: string
  provider: "openai" | "anthropic" | "openrouter"
}

export async function POST(request: NextRequest) {
  try {
    const body: StreamRequest = await request.json()
    const { messages, model, temperature, maxTokens, apiKey, provider } = body

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API Key fehlt" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      })
    }

    // Create streaming response based on provider
    if (provider === "openai" || (!provider && !model.startsWith("claude"))) {
      // OpenAI Streaming
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          stream: true,
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        return new Response(JSON.stringify({ error: `OpenAI API Fehler: ${response.status}` }), {
          status: response.status,
          headers: { "Content-Type": "application/json" }
        })
      }

      // Stream the response
      const encoder = new TextEncoder()
      const decoder = new TextDecoder()

      const stream = new ReadableStream({
        async start(controller) {
          const reader = response.body?.getReader()
          if (!reader) {
            controller.close()
            return
          }

          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              const chunk = decoder.decode(value)
              const lines = chunk.split("\n").filter(line => line.trim() !== "")

              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  const data = line.slice(6)
                  if (data === "[DONE]") {
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"))
                    continue
                  }

                  try {
                    const json = JSON.parse(data)
                    const content = json.choices?.[0]?.delta?.content
                    if (content) {
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`))
                    }
                  } catch (e) {
                    // Skip invalid JSON
                  }
                }
              }
            }
          } finally {
            reader.releaseLock()
            controller.close()
          }
        }
      })

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        }
      })

    } else if (provider === "anthropic" || model.startsWith("claude")) {
      // Anthropic Streaming
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: messages.filter(m => m.role !== "system").map(m => ({
            role: m.role,
            content: m.content,
          })),
          system: messages.find(m => m.role === "system")?.content || "",
          temperature,
          stream: true,
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        return new Response(JSON.stringify({ error: `Anthropic API Fehler: ${response.status}` }), {
          status: response.status,
          headers: { "Content-Type": "application/json" }
        })
      }

      const encoder = new TextEncoder()
      const decoder = new TextDecoder()

      const stream = new ReadableStream({
        async start(controller) {
          const reader = response.body?.getReader()
          if (!reader) {
            controller.close()
            return
          }

          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              const chunk = decoder.decode(value)
              const lines = chunk.split("\n").filter(line => line.trim() !== "")

              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  const data = line.slice(6)
                  try {
                    const json = JSON.parse(data)
                    if (json.type === "content_block_delta" && json.delta?.text) {
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: json.delta.text })}\n\n`))
                    } else if (json.type === "message_stop") {
                      controller.enqueue(encoder.encode("data: [DONE]\n\n"))
                    }
                  } catch (e) {
                    // Skip invalid JSON
                  }
                }
              }
            }
          } finally {
            reader.releaseLock()
            controller.close()
          }
        }
      })

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        }
      })

    } else if (provider === "openrouter") {
      // OpenRouter Streaming
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "https://agentforge.dev",
          "X-Title": "AgentForge",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          stream: true,
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        return new Response(JSON.stringify({ error: `OpenRouter API Fehler: ${response.status}` }), {
          status: response.status,
          headers: { "Content-Type": "application/json" }
        })
      }

      const encoder = new TextEncoder()
      const decoder = new TextDecoder()

      const stream = new ReadableStream({
        async start(controller) {
          const reader = response.body?.getReader()
          if (!reader) {
            controller.close()
            return
          }

          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              const chunk = decoder.decode(value)
              const lines = chunk.split("\n").filter(line => line.trim() !== "")

              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  const data = line.slice(6)
                  if (data === "[DONE]") {
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"))
                    continue
                  }

                  try {
                    const json = JSON.parse(data)
                    const content = json.choices?.[0]?.delta?.content
                    if (content) {
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`))
                    }
                  } catch (e) {
                    // Skip invalid JSON
                  }
                }
              }
            }
          } finally {
            reader.releaseLock()
            controller.close()
          }
        }
      })

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        }
      })
    }

    return new Response(JSON.stringify({ error: "Unbekannter Provider" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    })

  } catch (error) {
    console.error("Stream API Error:", error)
    return new Response(JSON.stringify({ error: "Interner Server-Fehler" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    })
  }
}
