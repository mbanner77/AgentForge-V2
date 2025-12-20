import NextAuth, { NextAuthOptions, User } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"

type UserRole = "admin" | "user"

interface StoredUser {
  id: string
  username: string
  password: string
  role: UserRole
}

// In-memory user store (in production, use database)
const users: StoredUser[] = [
  {
    id: "1",
    username: "admin",
    password: "$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYDHpkHLJpHi", // RealCore2025!
    role: "admin",
  },
  {
    id: "2", 
    username: "user",
    password: "$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi", // User2025!
    role: "user",
  },
]

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials): Promise<User | null> {
        if (!credentials?.username || !credentials?.password) {
          return null
        }

        const user = users.find(u => u.username === credentials.username)
        if (!user) {
          return null
        }

        const isValid = await bcrypt.compare(credentials.password, user.password)
        if (!isValid) {
          return null
        }

        return {
          id: user.id,
          name: user.username,
          email: `${user.username}@agentforge.local`,
          role: user.role,
        }
      }
    })
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role
        session.user.id = token.id
      }
      return session
    }
  },
  pages: {
    signIn: "/builder/login",
    error: "/builder/login",
  },
  secret: process.env.NEXTAUTH_SECRET || "agentforge-secret-key-change-in-production",
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
