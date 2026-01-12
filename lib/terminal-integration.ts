// ============================================
// TERMINAL-INTEGRATION: Befehle ausführen
// ============================================

export interface TerminalCommand {
  command: string
  args: string[]
  cwd?: string
  env?: Record<string, string>
}

export interface CommandResult {
  success: boolean
  exitCode: number
  stdout: string
  stderr: string
  duration: number
}

export interface TerminalSession {
  id: string
  commands: { command: TerminalCommand; result?: CommandResult }[]
  status: 'idle' | 'running' | 'completed' | 'error'
}

// Vordefinierte sichere Befehle
const SAFE_COMMANDS = new Set([
  'npm',
  'npx',
  'yarn',
  'pnpm',
  'node',
  'tsc',
  'eslint',
  'prettier',
  'git',
  'ls',
  'cat',
  'echo',
  'pwd',
  'which',
])

// Gefährliche Befehle die nie ausgeführt werden sollten
const DANGEROUS_COMMANDS = new Set([
  'rm',
  'rmdir',
  'del',
  'format',
  'mkfs',
  'dd',
  'sudo',
  'su',
  'chmod',
  'chown',
  'kill',
  'pkill',
  'shutdown',
  'reboot',
])

// Prüfe ob ein Befehl sicher ist
export function isCommandSafe(command: string): { safe: boolean; reason?: string } {
  const parts = command.trim().split(/\s+/)
  const baseCommand = parts[0]
  
  // Prüfe auf gefährliche Befehle
  if (DANGEROUS_COMMANDS.has(baseCommand)) {
    return { safe: false, reason: `Befehl '${baseCommand}' ist nicht erlaubt` }
  }
  
  // Prüfe auf Shell-Injection
  if (command.includes('|') || command.includes(';') || command.includes('&&') || command.includes('`')) {
    return { safe: false, reason: 'Shell-Operatoren sind nicht erlaubt' }
  }
  
  // Prüfe auf Pfad-Traversal
  if (command.includes('..')) {
    return { safe: false, reason: 'Pfad-Traversal ist nicht erlaubt' }
  }
  
  // Prüfe ob in sicherer Liste
  if (!SAFE_COMMANDS.has(baseCommand)) {
    return { safe: false, reason: `Befehl '${baseCommand}' ist nicht in der Whitelist` }
  }
  
  return { safe: true }
}

// Parse einen Befehl in Teile
export function parseCommand(commandString: string): TerminalCommand {
  const parts = commandString.trim().split(/\s+/)
  return {
    command: parts[0],
    args: parts.slice(1)
  }
}

// Generiere npm install Befehl für fehlende Dependencies
export function generateNpmInstallCommand(packages: string[]): string {
  if (packages.length === 0) return ''
  return `npm install ${packages.join(' ')}`
}

// Häufige Befehle für Quick-Actions
export const commonCommands = {
  install: { command: 'npm', args: ['install'], label: 'npm install' },
  dev: { command: 'npm', args: ['run', 'dev'], label: 'npm run dev' },
  build: { command: 'npm', args: ['run', 'build'], label: 'npm run build' },
  lint: { command: 'npm', args: ['run', 'lint'], label: 'npm run lint' },
  test: { command: 'npm', args: ['run', 'test'], label: 'npm run test' },
  typecheck: { command: 'npx', args: ['tsc', '--noEmit'], label: 'Type Check' },
  format: { command: 'npx', args: ['prettier', '--write', '.'], label: 'Format Code' },
}

// Terminal Output Parser
export function parseTerminalOutput(output: string): {
  errors: string[]
  warnings: string[]
  info: string[]
} {
  const lines = output.split('\n')
  const errors: string[] = []
  const warnings: string[] = []
  const info: string[] = []
  
  for (const line of lines) {
    const lower = line.toLowerCase()
    if (lower.includes('error') || lower.includes('failed') || lower.includes('cannot find')) {
      errors.push(line)
    } else if (lower.includes('warning') || lower.includes('warn')) {
      warnings.push(line)
    } else if (line.trim()) {
      info.push(line)
    }
  }
  
  return { errors, warnings, info }
}

// Erkenne fehlende Module aus npm-Fehlern
export function detectMissingModules(errorOutput: string): string[] {
  const missing: string[] = []
  
  // Pattern: Cannot find module 'xxx'
  const modulePattern = /Cannot find module ['"]([^'"]+)['"]/g
  let match
  while ((match = modulePattern.exec(errorOutput)) !== null) {
    const module = match[1]
    // Nur npm Packages, keine relativen Imports
    if (!module.startsWith('.') && !module.startsWith('@/')) {
      missing.push(module.split('/')[0])
    }
  }
  
  // Pattern: Module not found: Can't resolve 'xxx'
  const resolvePattern = /Module not found: Can't resolve ['"]([^'"]+)['"]/g
  while ((match = resolvePattern.exec(errorOutput)) !== null) {
    const module = match[1]
    if (!module.startsWith('.') && !module.startsWith('@/')) {
      const packageName = module.startsWith('@') 
        ? module.split('/').slice(0, 2).join('/')
        : module.split('/')[0]
      if (!missing.includes(packageName)) {
        missing.push(packageName)
      }
    }
  }
  
  return missing
}

// Generiere Fehlerbehebungs-Vorschläge
export function suggestFixes(errorOutput: string): string[] {
  const suggestions: string[] = []
  const missing = detectMissingModules(errorOutput)
  
  if (missing.length > 0) {
    suggestions.push(`npm install ${missing.join(' ')}`)
  }
  
  if (errorOutput.includes('ENOENT') && errorOutput.includes('package.json')) {
    suggestions.push('npm init -y')
  }
  
  if (errorOutput.includes('peer dep')) {
    suggestions.push('npm install --legacy-peer-deps')
  }
  
  if (errorOutput.includes('EACCES') || errorOutput.includes('permission denied')) {
    suggestions.push('Prüfe Dateiberechtigungen')
  }
  
  return suggestions
}
