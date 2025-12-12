import Link from "next/link"
import Image from "next/image"

export function Footer() {
  return (
    <footer className="border-t border-border bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link href="/" className="flex items-center">
              <Image
                src="/images/realcore-logo.png"
                alt="RealCore Logo"
                width={120}
                height={32}
                className="h-8 w-auto"
              />
            </Link>
            <p className="mt-4 text-sm text-muted-foreground">
              Die intelligente Plattform für KI-gestützte App-Entwicklung.
            </p>
          </div>

          <div>
            <h4 className="mb-4 font-semibold">Produkt</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="#" className="hover:text-foreground">
                  Features
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-foreground">
                  Preise
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-foreground">
                  Changelog
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-foreground">
                  Roadmap
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 font-semibold">Ressourcen</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="#" className="hover:text-foreground">
                  Dokumentation
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-foreground">
                  API Referenz
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-foreground">
                  Tutorials
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-foreground">
                  Blog
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 font-semibold">Rechtliches</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="#" className="hover:text-foreground">
                  Datenschutz
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-foreground">
                  AGB
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-foreground">
                  Impressum
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-border pt-8 text-center text-sm text-muted-foreground">
          <p>© 2025 RealCore. Alle Rechte vorbehalten.</p>
        </div>
      </div>
    </footer>
  )
}
