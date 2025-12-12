"use client"

import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Menu, X, LogIn, LogOut } from "lucide-react"
import { useState } from "react"
import { useAuth } from "@/lib/auth"

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { isAuthenticated, currentUser, logout } = useAuth()

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center">
          <Image src="/images/realcore-logo.png" alt="RealCore Logo" width={180} height={48} className="h-12 w-auto" />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          <Link href="#workflow" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            Workflow
          </Link>
          <Link href="#features" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            Features
          </Link>
          <Link href="#configure" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            Konfiguration
          </Link>
          <Link href="/builder" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            Builder
          </Link>
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {isAuthenticated ? (
            <>
              <span className="text-sm text-muted-foreground">{currentUser?.username}</span>
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
            <Link href="#workflow" className="text-sm text-muted-foreground">
              Workflow
            </Link>
            <Link href="#features" className="text-sm text-muted-foreground">
              Features
            </Link>
            <Link href="#configure" className="text-sm text-muted-foreground">
              Konfiguration
            </Link>
            <Link href="/builder" className="text-sm text-muted-foreground">
              Builder
            </Link>
            <div className="flex flex-col gap-2 pt-4">
              {isAuthenticated ? (
                <>
                  <span className="text-sm text-muted-foreground">{currentUser?.username}</span>
                  <Link href="/builder">
                    <Button size="sm" className="w-full">Zum Builder</Button>
                  </Link>
                  <Button variant="ghost" size="sm" onClick={logout}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Abmelden
                  </Button>
                </>
              ) : (
                <>
                  <Link href="/builder/login">
                    <Button variant="ghost" size="sm" className="w-full">
                      <LogIn className="h-4 w-4 mr-2" />
                      Anmelden
                    </Button>
                  </Link>
                  <Link href="/builder/login">
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
