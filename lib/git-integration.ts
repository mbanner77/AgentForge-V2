// ============================================
// GIT-INTEGRATION: Commit, Push direkt aus der App
// ============================================

export interface GitStatus {
  branch: string
  hasChanges: boolean
  staged: string[]
  unstaged: string[]
  untracked: string[]
}

export interface GitCommit {
  hash: string
  message: string
  author: string
  date: Date
}

export interface GitOperation {
  type: 'add' | 'commit' | 'push' | 'pull' | 'status' | 'diff' | 'log'
  args?: string[]
}

// Generiere Git-Befehle
export function generateGitCommand(operation: GitOperation): string {
  switch (operation.type) {
    case 'add':
      return `git add ${operation.args?.join(' ') || '.'}`
    case 'commit':
      const message = operation.args?.[0] || 'Update from AgentForge'
      return `git commit -m "${message.replace(/"/g, '\\"')}"`
    case 'push':
      return `git push ${operation.args?.join(' ') || 'origin main'}`
    case 'pull':
      return `git pull ${operation.args?.join(' ') || 'origin main'}`
    case 'status':
      return 'git status --porcelain'
    case 'diff':
      return `git diff ${operation.args?.join(' ') || ''}`
    case 'log':
      return `git log --oneline -n ${operation.args?.[0] || '10'}`
    default:
      return ''
  }
}

// Parse git status --porcelain Output
export function parseGitStatus(output: string): GitStatus {
  const lines = output.trim().split('\n').filter(l => l.trim())
  const staged: string[] = []
  const unstaged: string[] = []
  const untracked: string[] = []
  
  for (const line of lines) {
    const status = line.substring(0, 2)
    const file = line.substring(3)
    
    if (status.startsWith('?')) {
      untracked.push(file)
    } else if (status[0] !== ' ') {
      staged.push(file)
    } else if (status[1] !== ' ') {
      unstaged.push(file)
    }
  }
  
  return {
    branch: 'main', // Wird aus separatem Befehl geholt
    hasChanges: staged.length > 0 || unstaged.length > 0 || untracked.length > 0,
    staged,
    unstaged,
    untracked
  }
}

// Parse git log --oneline Output
export function parseGitLog(output: string): GitCommit[] {
  const lines = output.trim().split('\n').filter(l => l.trim())
  return lines.map(line => {
    const [hash, ...messageParts] = line.split(' ')
    return {
      hash,
      message: messageParts.join(' '),
      author: 'Unknown', // Vereinfacht
      date: new Date()
    }
  })
}

// Generiere automatische Commit-Nachricht
export function generateCommitMessage(
  changedFiles: string[],
  action: 'add' | 'update' | 'fix' | 'refactor' | 'style'
): string {
  const actionMap = {
    add: 'Add',
    update: 'Update',
    fix: 'Fix',
    refactor: 'Refactor',
    style: 'Style'
  }
  
  const prefix = actionMap[action]
  
  if (changedFiles.length === 1) {
    const fileName = changedFiles[0].split('/').pop()
    return `${prefix}: ${fileName}`
  }
  
  if (changedFiles.length <= 3) {
    const fileNames = changedFiles.map(f => f.split('/').pop()).join(', ')
    return `${prefix}: ${fileNames}`
  }
  
  // Gruppiere nach Verzeichnis
  const dirs = new Set(changedFiles.map(f => f.split('/').slice(0, -1).join('/')))
  if (dirs.size === 1) {
    const dir = [...dirs][0] || 'root'
    return `${prefix}: ${changedFiles.length} files in ${dir}`
  }
  
  return `${prefix}: ${changedFiles.length} files across ${dirs.size} directories`
}

// Prüfe ob Git-Operationen sicher sind
export function isGitOperationSafe(operation: GitOperation): boolean {
  // Diese Operationen sind immer sicher
  const safeOps = ['status', 'diff', 'log', 'add']
  if (safeOps.includes(operation.type)) {
    return true
  }
  
  // Commit ist sicher, aber prüfe Nachricht
  if (operation.type === 'commit') {
    const message = operation.args?.[0] || ''
    // Keine Shell-Injection in Commit-Nachricht
    if (message.includes('`') || message.includes('$(')) {
      return false
    }
    return true
  }
  
  // Push/Pull sind relativ sicher zu bekannten Remotes
  if (operation.type === 'push' || operation.type === 'pull') {
    const args = operation.args || ['origin', 'main']
    // Nur zu origin erlaubt
    if (args[0] && args[0] !== 'origin') {
      return false
    }
    return true
  }
  
  return false
}

// Quick Git Actions für UI
export const gitQuickActions = [
  {
    id: 'status',
    label: 'Status',
    icon: 'GitBranch',
    operation: { type: 'status' as const }
  },
  {
    id: 'add-all',
    label: 'Stage All',
    icon: 'Plus',
    operation: { type: 'add' as const, args: ['.'] }
  },
  {
    id: 'commit',
    label: 'Commit',
    icon: 'Check',
    operation: { type: 'commit' as const }
  },
  {
    id: 'push',
    label: 'Push',
    icon: 'Upload',
    operation: { type: 'push' as const }
  },
  {
    id: 'pull',
    label: 'Pull',
    icon: 'Download',
    operation: { type: 'pull' as const }
  },
]

// Erkenne Git-bezogene Fehler
export function detectGitErrors(output: string): { type: string; suggestion: string } | null {
  if (output.includes('not a git repository')) {
    return {
      type: 'not_repo',
      suggestion: 'git init'
    }
  }
  
  if (output.includes('nothing to commit')) {
    return {
      type: 'no_changes',
      suggestion: 'Keine Änderungen zum Committen'
    }
  }
  
  if (output.includes('rejected') && output.includes('push')) {
    return {
      type: 'push_rejected',
      suggestion: 'git pull --rebase origin main && git push'
    }
  }
  
  if (output.includes('CONFLICT')) {
    return {
      type: 'merge_conflict',
      suggestion: 'Merge-Konflikt manuell lösen'
    }
  }
  
  if (output.includes('Authentication failed')) {
    return {
      type: 'auth_failed',
      suggestion: 'Git-Credentials prüfen'
    }
  }
  
  return null
}
