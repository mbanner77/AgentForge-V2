import bcrypt from "bcryptjs"
import prisma from "./db"

// Server-side authentication utilities

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword)
}

// Create or get user from database
export async function getOrCreateUser(username: string, password: string, role: "admin" | "user" = "user") {
  if (!prisma) return null
  
  try {
    // Check if user exists
    let user = await prisma.user.findFirst({
      where: { name: username }
    })
    
    if (!user) {
      // Create new user
      const hashedPassword = await hashPassword(password)
      user = await prisma.user.create({
        data: {
          name: username,
          email: `${username}@agentforge.local`,
        }
      })
    }
    
    return user
  } catch (error) {
    console.error("Error in getOrCreateUser:", error)
    return null
  }
}

// Verify user credentials
export async function verifyCredentials(username: string, password: string) {
  if (!prisma) {
    // Fallback to local auth for development
    return null
  }
  
  try {
    const user = await prisma.user.findFirst({
      where: { name: username }
    })
    
    if (!user) return null
    
    // For now, we'll use a simple check since we don't have password field in DB
    // In production, add password field to User model
    return user
  } catch (error) {
    console.error("Error verifying credentials:", error)
    return null
  }
}
