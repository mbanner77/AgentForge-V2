// Prisma Client - nur wenn DATABASE_URL gesetzt ist
// Für lokale Entwicklung ohne Datenbank wird null zurückgegeben

let prisma: any = null

// Nur initialisieren wenn DATABASE_URL vorhanden
if (process.env.DATABASE_URL) {
  try {
    const { PrismaClient } = require("@prisma/client")
    
    const globalForPrisma = globalThis as unknown as {
      prisma: any | undefined
    }

    prisma = globalForPrisma.prisma ?? new PrismaClient()

    if (process.env.NODE_ENV !== "production") {
      globalForPrisma.prisma = prisma
    }
  } catch (e) {
    console.log("Prisma nicht verfügbar - lokaler Modus ohne Datenbank")
  }
}

export { prisma }
export default prisma
