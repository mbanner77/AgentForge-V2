"use client"

import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Menu, X, LogIn, LogOut, Book, Settings, History, Server, Building2 } from "lucide-react"
import { useState } from "react"
import { useAuth } from "@/lib/auth"
import { ThemeToggle } from "@/components/theme-toggle"

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { isAuthenticated, currentUser, logout } = useAuth()

  const handleSmoothScroll = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault()
    const element = document.getElementById(targetId)
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" })
    }
    setMobileMenuOpen(false)
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center">
          <Image src="/images/realcore-logo.png" alt="RealCore Logo" width={180} height={48} className="h-12 w-auto" />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          <a 
            href="#workflow" 
            onClick={(e) => handleSmoothScroll(e, "workflow")}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
          >
            Workflow
          </a>
          <a 
            href="#features" 
            onClick={(e) => handleSmoothScroll(e, "features")}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
          >
            Features
          </a>
          <a 
            href="#configure" 
            onClick={(e) => handleSmoothScroll(e, "configure")}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
          >
            Konfiguration
          </a>
          <Link href="/builder" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            Builder
          </Link>
          <Link href="/docs" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            Docs
          </Link>
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <ThemeToggle />
          {isAuthenticated ? (
            <>
              <span className="text-sm text-muted-foreground">{currentUser?.username}</span>
              <Link href="/mcp">
                <Button variant="ghost" size="icon" title="MCP Server">
                  <Server className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/sap">
                <Button variant="ghost" size="icon" title="SAP Integration">
                  <Building2 className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/settings">
                <Button variant="ghost" size="icon" title="Einstellungen">
                  <Settings className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/history">
                <Button variant="ghost" size="icon" title="Verlauf">
                  <History className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/builder">
                <Button size="sm">Zum Builder</Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={logout}>
                <LogOut className="h-4 w-4 mr-2" />
                Abmelden
              </Button>
            </>
          ) : (
            <>
              <Link href="/builder/login">
                <Button variant="ghost" size="sm">
                  <LogIn className="h-4 w-4 mr-2" />
                  Anmelden
                </Button>
              </Link>
              <Link href="/builder/login">
                <Button size="sm">Jetzt starten</Button>
              </Link>
            </>
          )}
        </div>

        <button className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="border-t border-border bg-background px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-4">
            <a 
              href="#workflow" 
              onClick={(e) => handleSmoothScroll(e, "workflow")}
              className="text-sm text-muted-foreground"
            >
              Workflow
            </a>
            <a 
              href="#features" 
              onClick={(e) => handleSmoothScroll(e, "features")}
              className="text-sm text-muted-foreground"
            >
              Features
            </a>
            <a 
              href="#configure" 
              onClick={(e) => handleSmoothScroll(e, "configure")}
              className="text-sm text-muted-foreground"
            >
              Konfiguration
            </a>
            <Link href="/builder" className="text-sm text-muted-foreground" onClick={() => setMobileMenuOpen(false)}>
              Builder
            </Link>
            <Link href="/docs" className="text-sm text-muted-foreground" onClick={() => setMobileMenuOpen(false)}>
              Dokumentation
            </Link>
            {isAuthenticated && (
              <>
                <Link href="/mcp" className="text-sm text-muted-foreground" onClick={() => setMobileMenuOpen(false)}>
                  MCP Server
                </Link>
                <Link href="/sap" className="text-sm text-muted-foreground" onClick={() => setMobileMenuOpen(false)}>
                  SAP Integration
                </Link>
                <Link href="/settings" className="text-sm text-muted-foreground" onClick={() => setMobileMenuOpen(false)}>
                  Einstellungen
                </Link>
                <Link href="/history" className="text-sm text-muted-foreground" onClick={() => setMobileMenuOpen(false)}>
                  Verlauf
                </Link>
                <Link href="/logs" className="text-sm text-muted-foreground" onClick={() => setMobileMenuOpen(false)}>
                  Logs
                </Link>
              </>
            )}
            <div className="flex flex-col gap-2 pt-4 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Theme</span>
                <ThemeToggle />
              </div>
              {isAuthenticated ? (
                <>
                  <span className="text-sm text-muted-foreground">{currentUser?.username}</span>
                  <Link href="/builder" onClick={() => setMobileMenuOpen(false)}>
                    <Button size="sm" className="w-full">Zum Builder</Button>
                  </Link>
                  <Button variant="ghost" size="sm" onClick={() => { logout(); setMobileMenuOpen(false); }}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Abmelden
                  </Button>
                </>
              ) : (
                <>
                  <Link href="/builder/login" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="ghost" size="sm" className="w-full">
                      <LogIn className="h-4 w-4 mr-2" />
                      Anmelden
                    </Button>
                  </Link>
                  <Link href="/builder/login" onClick={() => setMobileMenuOpen(false)}>
                    <Button size="sm" className="w-full">Jetzt starten</Button>
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
