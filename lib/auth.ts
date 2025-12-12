"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"

// User Rollen
export type UserRole = "admin" | "user"

// User Interface
export interface User {
  id: string
  username: string
  password: string
  role: UserRole
  createdAt: Date
  lastLogin?: Date
}

// Default Users (in production: use proper database)
const DEFAULT_USERS: User[] = [
  {
    id: "1",
    username: "admin",
    password: "RealCore2025!",
    role: "admin",
    createdAt: new Date("2024-01-01"),
  },
  {
    id: "2",
    username: "user",
    password: "User2025!",
    role: "user",
    createdAt: new Date("2024-01-01"),
  },
]

interface AuthState {
  isAuthenticated: boolean
  currentUser: User | null
  users: User[]
  
  // Auth Actions
  login: (username: string, password: string) => boolean
  logout: () => void
  
  // User Management (Admin only)
  addUser: (username: string, password: string, role: UserRole) => boolean
  updateUser: (userId: string, updates: Partial<Pick<User, "username" | "password" | "role">>) => boolean
  deleteUser: (userId: string) => boolean
  
  // Helper
  isAdmin: () => boolean
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      currentUser: null,
      users: DEFAULT_USERS,
      
      login: (username: string, password: string) => {
        const user = get().users.find(
          u => u.username === username && u.password === password
        )
        if (user) {
          set({ 
            isAuthenticated: true, 
            currentUser: { ...user, lastLogin: new Date() }
          })
          return true
        }
        return false
      },
      
      logout: () => {
        set({ isAuthenticated: false, currentUser: null })
      },
      
      addUser: (username: string, password: string, role: UserRole) => {
        const { users, currentUser } = get()
        
        // Nur Admins dürfen User hinzufügen
        if (currentUser?.role !== "admin") return false
        
        // Username muss einzigartig sein
        if (users.some(u => u.username === username)) return false
        
        const newUser: User = {
          id: crypto.randomUUID(),
          username,
          password,
          role,
          createdAt: new Date(),
        }
        
        set({ users: [...users, newUser] })
        return true
      },
      
      updateUser: (userId: string, updates: Partial<Pick<User, "username" | "password" | "role">>) => {
        const { users, currentUser } = get()
        
        // Nur Admins dürfen User bearbeiten
        if (currentUser?.role !== "admin") return false
        
        // Username-Eindeutigkeit prüfen
        if (updates.username && users.some(u => u.username === updates.username && u.id !== userId)) {
          return false
        }
        
        set({
          users: users.map(u => 
            u.id === userId ? { ...u, ...updates } : u
          )
        })
        return true
      },
      
      deleteUser: (userId: string) => {
        const { users, currentUser } = get()
        
        // Nur Admins dürfen User löschen
        if (currentUser?.role !== "admin") return false
        
        // Kann sich nicht selbst löschen
        if (currentUser.id === userId) return false
        
        // Mindestens ein Admin muss bleiben
        const userToDelete = users.find(u => u.id === userId)
        const adminCount = users.filter(u => u.role === "admin").length
        if (userToDelete?.role === "admin" && adminCount <= 1) return false
        
        set({ users: users.filter(u => u.id !== userId) })
        return true
      },
      
      isAdmin: () => {
        return get().currentUser?.role === "admin"
      }
    }),
    {
      name: "agentforge-auth",
      // Migration für alte Auth-Daten
      migrate: (persistedState: any, version: number) => {
        console.log("Auth migration running, version:", version, "state:", persistedState)
        
        // Wenn alte Daten ohne users Array existieren, migrieren
        if (!persistedState.users || persistedState.users.length === 0) {
          console.log("Migrating: No users found, using defaults")
          return {
            ...persistedState,
            users: DEFAULT_USERS,
            currentUser: null,
            isAuthenticated: false,
          }
        }
        
        // Stelle sicher, dass alle Benutzer eine Rolle haben
        const migratedUsers = persistedState.users.map((user: any) => ({
          ...user,
          role: user.role || "user", // Default: user
        }))
        
        // Aktualisiere currentUser falls nötig
        let currentUser = persistedState.currentUser
        if (currentUser && !currentUser.role) {
          const foundUser = migratedUsers.find((u: any) => u.id === currentUser.id)
          currentUser = foundUser || { ...currentUser, role: "user" }
        }
        
        return {
          ...persistedState,
          users: migratedUsers,
          currentUser,
        }
      },
      version: 2, // Version erhöht für neue Migration
    }
  )
)

// Legacy export für Kompatibilität
export const useUsername = () => useAuth(state => state.currentUser?.username)
