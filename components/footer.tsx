import Link from "next/link"
import Image from "next/image"
import { Github, Twitter, Linkedin, Mail } from "lucide-react"

export function Footer() {
  return (
    <footer className="border-t border-border bg-card/30 px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center">
              <Image
                src="/images/realcore-logo.png"
                alt="RealCore Logo"
                width={140}
                height={36}
                className="h-10 w-auto"
              />
            </Link>
            <p className="mt-4 text-sm text-muted-foreground max-w-xs">
              Die vollständig konfigurierbare KI-Plattform für professionelle App-Entwicklung mit Multi-Agenten-Workflows.
            </p>
            <div className="mt-6 flex gap-4">
              <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors">
                <Github className="h-5 w-5" />
              </a>
              <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors">
                <Twitter className="h-5 w-5" />
              </a>
              <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors">
                <Linkedin className="h-5 w-5" />
              </a>
              <a href="mailto:info@realcore.de" className="text-muted-foreground hover:text-foreground transition-colors">
                <Mail className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Produkt */}
          <div>
            <h4 className="mb-4 font-semibold text-foreground">Produkt</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                <Link href="/builder" className="hover:text-foreground transition-colors">
                  Builder
                </Link>
              </li>
              <li>
                <Link href="/#features" className="hover:text-foreground transition-colors">
                  Features
                </Link>
              </li>
              <li>
                <Link href="/admin" className="hover:text-foreground transition-colors">
                  Marketplace
                </Link>
              </li>
              <li>
                <Link href="/mcp" className="hover:text-foreground transition-colors">
                  MCP Server
                </Link>
              </li>
              <li>
                <Link href="/sap" className="hover:text-foreground transition-colors">
                  SAP Integration
                </Link>
              </li>
            </ul>
          </div>

          {/* Ressourcen */}
          <div>
            <h4 className="mb-4 font-semibold text-foreground">Ressourcen</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                <Link href="/docs" className="hover:text-foreground transition-colors">
                  Dokumentation
                </Link>
              </li>
              <li>
                <Link href="/builder/workflow" className="hover:text-foreground transition-colors">
                  Workflow Designer
                </Link>
              </li>
              <li>
                <Link href="/settings" className="hover:text-foreground transition-colors">
                  Einstellungen
                </Link>
              </li>
              <li>
                <Link href="/history" className="hover:text-foreground transition-colors">
                  Verlauf
                </Link>
              </li>
              <li>
                <Link href="/logs" className="hover:text-foreground transition-colors">
                  Logs
                </Link>
              </li>
            </ul>
          </div>

          {/* Rechtliches */}
          <div>
            <h4 className="mb-4 font-semibold text-foreground">Rechtliches</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                <Link href="#" className="hover:text-foreground transition-colors">
                  Datenschutz
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-foreground transition-colors">
                  AGB
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-foreground transition-colors">
                  Impressum
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-border pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>© 2025 RealCore. Alle Rechte vorbehalten.</p>
          <p className="flex items-center gap-2">
            Made with <span className="text-red-500">❤</span> in Germany
          </p>
        </div>
      </div>
    </footer>
  )
}
