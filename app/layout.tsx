import type React from "react"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Toaster } from "sonner"
import { ErrorBoundary } from "@/components/error-boundary"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "AgentForge - KI-gestützte App-Entwicklung",
  description:
    "Baue Apps mit intelligenten Agenten. Vollständig konfigurierbare Plattform für automatisierte Entwicklung mit Planner, Coder, Reviewer und Executor Agenten.",
  keywords: ["AI", "App Builder", "Agenten", "Entwicklung", "Automatisierung", "Next.js"],
  generator: 'v0.app'
}

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="de" className="dark" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
        <Toaster 
          richColors 
          position="top-right" 
          toastOptions={{
            duration: 4000,
            classNames: {
              toast: "bg-background border-border",
              title: "text-foreground",
              description: "text-muted-foreground",
            }
          }}
        />
      </body>
    </html>
  )
}
