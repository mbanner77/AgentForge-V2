// ============================================================
// BEST PRACTICES KNOWLEDGE BASE
// Next.js, React, TypeScript Dokumentation für RAG
// ============================================================

export interface BestPractice {
  id: string
  category: 'nextjs' | 'react' | 'typescript' | 'tailwind' | 'performance' | 'security' | 'testing'
  title: string
  description: string
  doExample: string
  dontExample?: string
  keywords: string[]
  priority: 'critical' | 'important' | 'recommended'
}

export const bestPractices: BestPractice[] = [
  // ============================================================
  // NEXT.JS APP ROUTER
  // ============================================================
  {
    id: 'nextjs-app-router-structure',
    category: 'nextjs',
    title: 'App Router Dateistruktur',
    description: 'Next.js 13+ verwendet den App Router. Seiten sind in app/ Ordner, Komponenten in components/.',
    doExample: `// Korrekte Struktur:
app/
  page.tsx        // Hauptseite (/)
  layout.tsx      // Root Layout
  globals.css     // Globale Styles
components/
  Header.tsx      // Wiederverwendbare Komponenten
  Footer.tsx`,
    dontExample: `// FALSCH - Vite/CRA Struktur:
src/
  App.tsx         // ❌ Existiert nicht in Next.js
  main.tsx        // ❌ Existiert nicht in Next.js
  index.html      // ❌ Existiert nicht in Next.js`,
    keywords: ['app router', 'dateistruktur', 'next.js', 'pages', 'layout'],
    priority: 'critical'
  },
  {
    id: 'nextjs-use-client',
    category: 'nextjs',
    title: 'use client Direktive',
    description: 'Client Components benötigen "use client" als erste Zeile. Server Components sind der Default.',
    doExample: `"use client";

import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}`,
    dontExample: `// ❌ FEHLER: useState ohne "use client"
import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0); // Server Error!
}`,
    keywords: ['use client', 'client component', 'server component', 'useState', 'useEffect'],
    priority: 'critical'
  },
  {
    id: 'nextjs-metadata',
    category: 'nextjs',
    title: 'Metadata API',
    description: 'Metadata (Title, Description) wird über export const metadata definiert - nur in Server Components.',
    doExample: `// app/page.tsx (Server Component)
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Meine App',
  description: 'Beschreibung der App',
};

export default function Page() {
  return <main>...</main>;
}`,
    dontExample: `// ❌ FEHLER: metadata in Client Component
"use client";

export const metadata = { title: '...' }; // Funktioniert nicht!`,
    keywords: ['metadata', 'title', 'seo', 'head'],
    priority: 'important'
  },
  {
    id: 'nextjs-imports',
    category: 'nextjs',
    title: 'Import Alias @/',
    description: 'Next.js nutzt @/ als Alias für das Projekt-Root. Keine relativen Imports für Komponenten.',
    doExample: `// ✅ Korrekt
import { Calendar } from "@/components/Calendar";
import { useCalendar } from "@/hooks/useCalendar";`,
    dontExample: `// ❌ FALSCH
import { Calendar } from "../../components/Calendar";
import { Calendar } from "./Calendar";`,
    keywords: ['import', 'alias', '@/', 'pfad'],
    priority: 'critical'
  },
  {
    id: 'nextjs-image',
    category: 'nextjs',
    title: 'next/image für Bilder',
    description: 'Verwende next/image statt <img> für automatische Optimierung.',
    doExample: `import Image from 'next/image';

export function Avatar() {
  return (
    <Image
      src="/avatar.png"
      alt="Avatar"
      width={100}
      height={100}
    />
  );
}`,
    dontExample: `// ❌ Nicht optimiert
<img src="/avatar.png" alt="Avatar" />`,
    keywords: ['image', 'bild', 'optimierung', 'next/image'],
    priority: 'recommended'
  },
  {
    id: 'nextjs-link',
    category: 'nextjs',
    title: 'next/link für Navigation',
    description: 'Verwende next/link für interne Links - ermöglicht Client-Side Navigation.',
    doExample: `import Link from 'next/link';

export function Nav() {
  return (
    <nav>
      <Link href="/about">Über uns</Link>
      <Link href="/contact">Kontakt</Link>
    </nav>
  );
}`,
    dontExample: `// ❌ Kein Client-Side Routing
<a href="/about">Über uns</a>`,
    keywords: ['link', 'navigation', 'routing', 'next/link'],
    priority: 'important'
  },
  {
    id: 'nextjs-api-routes',
    category: 'nextjs',
    title: 'API Routes im App Router',
    description: 'API Routes sind in app/api/ und exportieren HTTP-Methoden als Funktionen.',
    doExample: `// app/api/users/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  const users = await db.users.findMany();
  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const body = await request.json();
  const user = await db.users.create({ data: body });
  return NextResponse.json(user, { status: 201 });
}`,
    dontExample: `// ❌ Pages Router Syntax (veraltet)
export default function handler(req, res) {
  res.json({ ... });
}`,
    keywords: ['api', 'route', 'endpoint', 'rest', 'fetch'],
    priority: 'important'
  },

  // ============================================================
  // REACT HOOKS & PATTERNS
  // ============================================================
  {
    id: 'react-hooks-rules',
    category: 'react',
    title: 'Rules of Hooks',
    description: 'Hooks nur auf Top-Level aufrufen, nie in Bedingungen oder Schleifen.',
    doExample: `function Component() {
  // ✅ Hooks immer am Anfang
  const [state, setState] = useState(0);
  const [data, setData] = useState(null);
  
  useEffect(() => {
    // Effect-Logik
  }, []);
  
  return <div>{state}</div>;
}`,
    dontExample: `function Component({ condition }) {
  // ❌ FEHLER: Hook in Bedingung
  if (condition) {
    const [state, setState] = useState(0);
  }
}`,
    keywords: ['hooks', 'useState', 'useEffect', 'rules'],
    priority: 'critical'
  },
  {
    id: 'react-useeffect-cleanup',
    category: 'react',
    title: 'useEffect Cleanup',
    description: 'Timer, Subscriptions und Event Listener müssen aufgeräumt werden.',
    doExample: `useEffect(() => {
  const timer = setInterval(() => {
    console.log('tick');
  }, 1000);
  
  // ✅ Cleanup Function
  return () => {
    clearInterval(timer);
  };
}, []);`,
    dontExample: `useEffect(() => {
  // ❌ Memory Leak!
  setInterval(() => {
    console.log('tick');
  }, 1000);
}, []);`,
    keywords: ['useEffect', 'cleanup', 'memory leak', 'setInterval', 'addEventListener'],
    priority: 'critical'
  },
  {
    id: 'react-state-update',
    category: 'react',
    title: 'State Updates mit vorherigem Wert',
    description: 'Bei State-Updates die auf vorherigen Wert basieren, Callback-Form nutzen.',
    doExample: `// ✅ Callback-Form für State-Updates
setCount(prevCount => prevCount + 1);

// ✅ Für Arrays
setItems(prevItems => [...prevItems, newItem]);

// ✅ Für Objects
setUser(prevUser => ({ ...prevUser, name: 'Neu' }));`,
    dontExample: `// ❌ Kann zu Race Conditions führen
setCount(count + 1);

// ❌ Bei schnellen Updates problematisch
onClick={() => {
  setCount(count + 1);
  setCount(count + 1); // Zählt nur einmal!
}}`,
    keywords: ['useState', 'setState', 'update', 'callback'],
    priority: 'important'
  },
  {
    id: 'react-key-prop',
    category: 'react',
    title: 'key Prop bei Listen',
    description: 'Bei .map() immer eine eindeutige key Prop verwenden.',
    doExample: `{items.map(item => (
  <ListItem key={item.id} item={item} />
))}

// Oder bei einfachen Arrays:
{names.map((name, index) => (
  <span key={name + index}>{name}</span>
))}`,
    dontExample: `// ❌ Index als key bei dynamischen Listen
{items.map((item, index) => (
  <ListItem key={index} item={item} />
))}`,
    keywords: ['key', 'map', 'liste', 'array'],
    priority: 'important'
  },
  {
    id: 'react-context',
    category: 'react',
    title: 'Context Pattern',
    description: 'Context + Provider + Custom Hook in einer Datei für State Management.',
    doExample: `// components/ThemeContext.tsx
"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface ThemeContextType {
  theme: string;
  setTheme: (theme: string) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState("light");
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}`,
    keywords: ['context', 'provider', 'useContext', 'state management'],
    priority: 'important'
  },

  // ============================================================
  // TYPESCRIPT
  // ============================================================
  {
    id: 'typescript-props',
    category: 'typescript',
    title: 'Props Typisierung',
    description: 'Komponenten-Props immer mit Interface typisieren.',
    doExample: `interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

export function Button({ label, onClick, variant = 'primary', disabled }: ButtonProps) {
  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={variant === 'primary' ? 'bg-blue-500' : 'bg-gray-500'}
    >
      {label}
    </button>
  );
}`,
    dontExample: `// ❌ Keine Typisierung
export function Button({ label, onClick }) {
  return <button onClick={onClick}>{label}</button>;
}`,
    keywords: ['props', 'interface', 'type', 'typescript'],
    priority: 'important'
  },
  {
    id: 'typescript-state',
    category: 'typescript',
    title: 'State Typisierung',
    description: 'useState mit generischem Typ für komplexe States.',
    doExample: `interface User {
  id: string;
  name: string;
  email: string;
}

// ✅ Typisierter State
const [user, setUser] = useState<User | null>(null);
const [items, setItems] = useState<string[]>([]);
const [loading, setLoading] = useState(false); // boolean inferiert`,
    dontExample: `// ❌ any vermeiden
const [data, setData] = useState<any>(null);`,
    keywords: ['useState', 'generic', 'type', 'state'],
    priority: 'important'
  },
  {
    id: 'typescript-event-handlers',
    category: 'typescript',
    title: 'Event Handler Typen',
    description: 'React Event-Typen für Event Handler verwenden.',
    doExample: `import { ChangeEvent, FormEvent, MouseEvent } from 'react';

function Form() {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    console.log(e.target.value);
  };
  
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
  };
  
  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    console.log('clicked');
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <input onChange={handleChange} />
      <button onClick={handleClick}>Submit</button>
    </form>
  );
}`,
    keywords: ['event', 'handler', 'onChange', 'onClick', 'onSubmit'],
    priority: 'recommended'
  },

  // ============================================================
  // TAILWIND CSS
  // ============================================================
  {
    id: 'tailwind-responsive',
    category: 'tailwind',
    title: 'Responsive Design',
    description: 'Mobile-first mit Breakpoint-Prefixen: sm:, md:, lg:, xl:',
    doExample: `<div className="
  w-full          // Mobile: volle Breite
  md:w-1/2        // Tablet: halbe Breite
  lg:w-1/3        // Desktop: Drittel
  p-4 md:p-6 lg:p-8
">
  Responsiver Content
</div>`,
    keywords: ['responsive', 'breakpoint', 'mobile', 'tailwind'],
    priority: 'recommended'
  },
  {
    id: 'tailwind-dark-mode',
    category: 'tailwind',
    title: 'Dark Mode',
    description: 'Dark Mode mit dark: Prefix.',
    doExample: `<div className="
  bg-white dark:bg-gray-900
  text-gray-900 dark:text-white
">
  Unterstützt Light und Dark Mode
</div>`,
    keywords: ['dark mode', 'theme', 'tailwind'],
    priority: 'recommended'
  },
  {
    id: 'tailwind-flexbox',
    category: 'tailwind',
    title: 'Flexbox Layout',
    description: 'Flex-Container für einfaches Layout.',
    doExample: `// Horizontal zentriert
<div className="flex items-center justify-center">

// Vertikal gestapelt mit Abstand
<div className="flex flex-col gap-4">

// Space between
<div className="flex justify-between items-center">`,
    keywords: ['flex', 'layout', 'center', 'gap'],
    priority: 'recommended'
  },

  // ============================================================
  // PERFORMANCE
  // ============================================================
  {
    id: 'perf-memo',
    category: 'performance',
    title: 'React.memo für teure Komponenten',
    description: 'Verhindert unnötige Re-Renders bei gleichen Props.',
    doExample: `import { memo } from 'react';

interface ItemProps {
  data: { id: string; name: string };
}

export const ExpensiveItem = memo(function ExpensiveItem({ data }: ItemProps) {
  // Teure Berechnung
  return <div>{data.name}</div>;
});`,
    keywords: ['memo', 'performance', 're-render', 'optimization'],
    priority: 'recommended'
  },
  {
    id: 'perf-usememo',
    category: 'performance',
    title: 'useMemo für teure Berechnungen',
    description: 'Cached Ergebnisse teurer Berechnungen.',
    doExample: `const filteredItems = useMemo(() => {
  return items.filter(item => item.active).sort((a, b) => a.name.localeCompare(b.name));
}, [items]); // Nur neu berechnen wenn items sich ändert`,
    keywords: ['useMemo', 'performance', 'cache', 'filter', 'sort'],
    priority: 'recommended'
  },
  {
    id: 'perf-usecallback',
    category: 'performance',
    title: 'useCallback für stabile Referenzen',
    description: 'Verhindert unnötige Re-Renders bei Child-Komponenten.',
    doExample: `const handleClick = useCallback((id: string) => {
  setItems(prev => prev.filter(item => item.id !== id));
}, []); // Stabile Referenz

return items.map(item => (
  <Item key={item.id} onClick={handleClick} />
));`,
    keywords: ['useCallback', 'performance', 'callback', 'stable'],
    priority: 'recommended'
  },

  // ============================================================
  // SECURITY
  // ============================================================
  {
    id: 'security-env',
    category: 'security',
    title: 'Environment Variables',
    description: 'Sensible Daten in .env, nur NEXT_PUBLIC_* im Client.',
    doExample: `// .env.local
DATABASE_URL=postgresql://...     // Nur Server
API_SECRET=secret123              // Nur Server
NEXT_PUBLIC_API_URL=https://...   // Client + Server

// Im Code:
// Server Component oder API Route:
const secret = process.env.API_SECRET;

// Client Component:
const apiUrl = process.env.NEXT_PUBLIC_API_URL;`,
    dontExample: `// ❌ Secrets im Client
"use client";
const secret = process.env.API_SECRET; // undefined!`,
    keywords: ['env', 'environment', 'secret', 'NEXT_PUBLIC'],
    priority: 'critical'
  },
  {
    id: 'security-validation',
    category: 'security',
    title: 'Input Validierung',
    description: 'Alle User-Inputs validieren, besonders in API Routes.',
    doExample: `import { z } from 'zod';

const UserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  const body = await request.json();
  
  const result = UserSchema.safeParse(body);
  if (!result.success) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  
  // Validierte Daten verwenden
  const { email, password } = result.data;
}`,
    keywords: ['validation', 'zod', 'input', 'security'],
    priority: 'critical'
  },
];

// ============================================================
// RAG FUNCTIONS
// ============================================================

/**
 * Findet relevante Best Practices basierend auf Keywords
 */
export function findRelevantBestPractices(
  query: string,
  categories?: BestPractice['category'][],
  limit = 5
): BestPractice[] {
  const queryLower = query.toLowerCase()
  const queryWords = queryLower.split(/\s+/)
  
  // Score jede Best Practice
  const scored = bestPractices.map(bp => {
    let score = 0
    
    // Kategorie-Filter
    if (categories && categories.length > 0 && !categories.includes(bp.category)) {
      return { bp, score: -1 }
    }
    
    // Keyword-Matching
    for (const keyword of bp.keywords) {
      if (queryLower.includes(keyword)) {
        score += 10
      }
      for (const word of queryWords) {
        if (keyword.includes(word) || word.includes(keyword)) {
          score += 5
        }
      }
    }
    
    // Titel-Matching
    if (queryLower.includes(bp.title.toLowerCase())) {
      score += 20
    }
    
    // Prioritäts-Bonus
    if (bp.priority === 'critical') score += 3
    else if (bp.priority === 'important') score += 2
    
    return { bp, score }
  })
  
  // Sortiere nach Score und limitiere
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.bp)
}

/**
 * Formatiert Best Practices für den Coder-Prompt
 */
export function formatBestPracticesForPrompt(practices: BestPractice[]): string {
  if (practices.length === 0) return ''
  
  let output = '\n## 📚 RELEVANTE BEST PRACTICES:\n\n'
  
  for (const bp of practices) {
    const priorityEmoji = bp.priority === 'critical' ? '🔴' : bp.priority === 'important' ? '🟡' : '🟢'
    
    output += `### ${priorityEmoji} ${bp.title}\n`
    output += `${bp.description}\n\n`
    output += `**✅ DO:**\n\`\`\`typescript\n${bp.doExample}\n\`\`\`\n`
    
    if (bp.dontExample) {
      output += `\n**❌ DON'T:**\n\`\`\`typescript\n${bp.dontExample}\n\`\`\`\n`
    }
    
    output += '\n'
  }
  
  return output
}

/**
 * Analysiert User-Request und findet passende Best Practices
 */
export function getBestPracticesForRequest(userRequest: string): string {
  // Erkenne Kategorien aus dem Request
  const categories: BestPractice['category'][] = []
  const requestLower = userRequest.toLowerCase()
  
  if (requestLower.includes('next') || requestLower.includes('app router') || requestLower.includes('page')) {
    categories.push('nextjs')
  }
  if (requestLower.includes('react') || requestLower.includes('hook') || requestLower.includes('component') || requestLower.includes('state')) {
    categories.push('react')
  }
  if (requestLower.includes('type') || requestLower.includes('typescript') || requestLower.includes('interface')) {
    categories.push('typescript')
  }
  if (requestLower.includes('style') || requestLower.includes('css') || requestLower.includes('tailwind') || requestLower.includes('design')) {
    categories.push('tailwind')
  }
  if (requestLower.includes('performance') || requestLower.includes('speed') || requestLower.includes('optimize')) {
    categories.push('performance')
  }
  if (requestLower.includes('security') || requestLower.includes('auth') || requestLower.includes('env')) {
    categories.push('security')
  }
  
  // Wenn keine Kategorie erkannt, alle durchsuchen
  const relevantPractices = findRelevantBestPractices(
    userRequest,
    categories.length > 0 ? categories : undefined,
    5
  )
  
  return formatBestPracticesForPrompt(relevantPractices)
}

/**
 * Holt kritische Best Practices die immer gelten
 */
export function getCriticalBestPractices(): string {
  const critical = bestPractices.filter(bp => bp.priority === 'critical')
  
  let output = '\n## 🔴 KRITISCHE REGELN (IMMER BEFOLGEN):\n\n'
  
  for (const bp of critical) {
    output += `- **${bp.title}**: ${bp.description}\n`
  }
  
  return output
}
