// Vorgefertigte UI-Komponenten-Bibliothek für Vibe-Coding
// Diese Komponenten werden automatisch in generierte Apps eingefügt

export interface ComponentTemplate {
  name: string
  category: 'layout' | 'form' | 'display' | 'feedback' | 'navigation'
  description: string
  code: string
  dependencies?: string[]
  usage: string
}

// Premium UI-Komponenten im shadcn/ui Style
export const componentLibrary: ComponentTemplate[] = [
  // ============================================
  // LAYOUT KOMPONENTEN
  // ============================================
  {
    name: 'Card',
    category: 'layout',
    description: 'Glassmorphism Card mit Hover-Effekt',
    code: `// filepath: components/ui/Card.tsx
"use client";

import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export function Card({ children, className = "", hover = false, onClick }: CardProps) {
  return (
    <div 
      onClick={onClick}
      style={{
        backgroundColor: "rgba(24, 24, 27, 0.5)",
        backdropFilter: "blur(8px)",
        border: "1px solid #27272a",
        borderRadius: "16px",
        padding: "24px",
        transition: "all 0.3s ease",
        cursor: onClick || hover ? "pointer" : "default",
      }}
      className={\`\${hover ? "hover:border-zinc-700 hover:shadow-xl" : ""} \${className}\`}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div style={{ marginBottom: "16px" }} className={className}>{children}</div>;
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h3 style={{ fontSize: "18px", fontWeight: "600", color: "#fafafa" }}>{children}</h3>;
}

export function CardContent({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}`,
    usage: `import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";

<Card hover>
  <CardHeader><CardTitle>Titel</CardTitle></CardHeader>
  <CardContent>Inhalt</CardContent>
</Card>`
  },
  
  {
    name: 'Container',
    category: 'layout',
    description: 'Responsive Container mit max-width',
    code: `// filepath: components/ui/Container.tsx
"use client";

import { ReactNode } from "react";

interface ContainerProps {
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
}

export function Container({ children, size = "lg" }: ContainerProps) {
  const maxWidths = {
    sm: "640px",
    md: "768px", 
    lg: "1024px",
    xl: "1280px",
    full: "100%"
  };
  
  return (
    <div style={{
      maxWidth: maxWidths[size],
      margin: "0 auto",
      padding: "0 16px",
      width: "100%"
    }}>
      {children}
    </div>
  );
}`,
    usage: `import { Container } from "@/components/ui/Container";

<Container size="lg">
  <h1>Meine App</h1>
</Container>`
  },

  // ============================================
  // FORM KOMPONENTEN
  // ============================================
  {
    name: 'Button',
    category: 'form',
    description: 'Premium Button mit Varianten',
    code: `// filepath: components/ui/Button.tsx
"use client";

import { ReactNode } from "react";

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}

export function Button({ 
  children, 
  onClick, 
  variant = "primary", 
  size = "md",
  disabled = false,
  type = "button",
  className = ""
}: ButtonProps) {
  const baseStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "600",
    borderRadius: "12px",
    transition: "all 0.2s ease",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    border: "none",
  };
  
  const variants: Record<string, React.CSSProperties> = {
    primary: {
      background: "linear-gradient(to right, #2563eb, #3b82f6)",
      color: "white",
      boxShadow: "0 4px 14px rgba(59, 130, 246, 0.25)",
    },
    secondary: {
      backgroundColor: "#27272a",
      color: "#fafafa",
      border: "1px solid #3f3f46",
    },
    ghost: {
      backgroundColor: "transparent",
      color: "#a1a1aa",
    },
    danger: {
      backgroundColor: "#dc2626",
      color: "white",
      boxShadow: "0 4px 14px rgba(220, 38, 38, 0.25)",
    }
  };
  
  const sizes: Record<string, React.CSSProperties> = {
    sm: { padding: "6px 12px", fontSize: "14px" },
    md: { padding: "10px 20px", fontSize: "14px" },
    lg: { padding: "14px 28px", fontSize: "16px" },
  };
  
  return (
    <button 
      type={type}
      onClick={onClick} 
      disabled={disabled}
      style={{ ...baseStyle, ...variants[variant], ...sizes[size] }}
      className={className}
    >
      {children}
    </button>
  );
}`,
    usage: `import { Button } from "@/components/ui/Button";

<Button variant="primary" size="lg" onClick={() => {}}>
  Klick mich
</Button>`
  },

  {
    name: 'Input',
    category: 'form',
    description: 'Styled Input mit Label und Error',
    code: `// filepath: components/ui/Input.tsx
"use client";

interface InputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "password" | "number" | "date";
  label?: string;
  error?: string;
  disabled?: boolean;
}

export function Input({ 
  value, 
  onChange, 
  placeholder, 
  type = "text", 
  label, 
  error,
  disabled = false
}: InputProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {label && (
        <label style={{ fontSize: "14px", fontWeight: "500", color: "#a1a1aa" }}>
          {label}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          width: "100%",
          padding: "12px 16px",
          backgroundColor: "#18181b",
          border: error ? "1px solid #ef4444" : "1px solid #27272a",
          borderRadius: "12px",
          color: "#fafafa",
          fontSize: "14px",
          outline: "none",
          transition: "border-color 0.2s ease",
          opacity: disabled ? 0.5 : 1,
        }}
      />
      {error && (
        <span style={{ fontSize: "12px", color: "#ef4444" }}>{error}</span>
      )}
    </div>
  );
}`,
    usage: `import { Input } from "@/components/ui/Input";

<Input 
  label="E-Mail" 
  value={email} 
  onChange={setEmail}
  placeholder="name@example.com"
/>`
  },

  {
    name: 'Select',
    category: 'form',
    description: 'Styled Select Dropdown',
    code: `// filepath: components/ui/Select.tsx
"use client";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  label?: string;
}

export function Select({ value, onChange, options, placeholder, label }: SelectProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {label && (
        <label style={{ fontSize: "14px", fontWeight: "500", color: "#a1a1aa" }}>
          {label}
        </label>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "12px 16px",
          backgroundColor: "#18181b",
          border: "1px solid #27272a",
          borderRadius: "12px",
          color: "#fafafa",
          fontSize: "14px",
          outline: "none",
          cursor: "pointer",
        }}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}`,
    usage: `import { Select } from "@/components/ui/Select";

<Select
  label="Kategorie"
  value={category}
  onChange={setCategory}
  options={[
    { value: "a", label: "Option A" },
    { value: "b", label: "Option B" }
  ]}
/>`
  },

  // ============================================
  // DISPLAY KOMPONENTEN
  // ============================================
  {
    name: 'Badge',
    category: 'display',
    description: 'Status Badge mit Varianten',
    code: `// filepath: components/ui/Badge.tsx
"use client";

import { ReactNode } from "react";

interface BadgeProps {
  children: ReactNode;
  variant?: "default" | "success" | "warning" | "error" | "info";
}

export function Badge({ children, variant = "default" }: BadgeProps) {
  const variants: Record<string, React.CSSProperties> = {
    default: { backgroundColor: "#27272a", color: "#d4d4d8", borderColor: "#3f3f46" },
    success: { backgroundColor: "rgba(34, 197, 94, 0.1)", color: "#4ade80", borderColor: "rgba(34, 197, 94, 0.2)" },
    warning: { backgroundColor: "rgba(245, 158, 11, 0.1)", color: "#fbbf24", borderColor: "rgba(245, 158, 11, 0.2)" },
    error: { backgroundColor: "rgba(239, 68, 68, 0.1)", color: "#f87171", borderColor: "rgba(239, 68, 68, 0.2)" },
    info: { backgroundColor: "rgba(59, 130, 246, 0.1)", color: "#60a5fa", borderColor: "rgba(59, 130, 246, 0.2)" },
  };
  
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      padding: "2px 10px",
      fontSize: "12px",
      fontWeight: "500",
      borderRadius: "9999px",
      border: "1px solid",
      ...variants[variant]
    }}>
      {children}
    </span>
  );
}`,
    usage: `import { Badge } from "@/components/ui/Badge";

<Badge variant="success">Aktiv</Badge>
<Badge variant="error">Fehler</Badge>`
  },

  {
    name: 'Avatar',
    category: 'display',
    description: 'User Avatar mit Fallback',
    code: `// filepath: components/ui/Avatar.tsx
"use client";

interface AvatarProps {
  src?: string;
  name?: string;
  size?: "sm" | "md" | "lg";
}

export function Avatar({ src, name, size = "md" }: AvatarProps) {
  const sizes = { sm: 32, md: 40, lg: 56 };
  const dimension = sizes[size];
  
  const initials = name
    ? name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase()
    : "?";
  
  return (
    <div style={{
      width: dimension,
      height: dimension,
      borderRadius: "50%",
      backgroundColor: "#3f3f46",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      fontSize: dimension / 2.5,
      fontWeight: "600",
      color: "#d4d4d8",
    }}>
      {src ? (
        <img src={src} alt={name || "Avatar"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        initials
      )}
    </div>
  );
}`,
    usage: `import { Avatar } from "@/components/ui/Avatar";

<Avatar name="Max Mustermann" size="lg" />
<Avatar src="/profile.jpg" />`
  },

  // ============================================
  // FEEDBACK KOMPONENTEN
  // ============================================
  {
    name: 'Modal',
    category: 'feedback',
    description: 'Modal Dialog mit Backdrop',
    code: `// filepath: components/ui/Modal.tsx
"use client";

import { ReactNode, useEffect } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => { document.body.style.overflow = "unset"; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 50,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <div 
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.6)",
          backdropFilter: "blur(4px)",
        }}
        onClick={onClose}
      />
      <div style={{
        position: "relative",
        backgroundColor: "#18181b",
        border: "1px solid #27272a",
        borderRadius: "16px",
        padding: "24px",
        maxWidth: "448px",
        width: "100%",
        margin: "16px",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#fafafa" }}>{title}</h2>
          <button 
            onClick={onClose}
            style={{
              padding: "4px",
              backgroundColor: "transparent",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              color: "#a1a1aa",
            }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}`,
    usage: `import { Modal } from "@/components/ui/Modal";

const [isOpen, setIsOpen] = useState(false);

<Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Bestätigung">
  <p>Möchten Sie fortfahren?</p>
</Modal>`
  },

  {
    name: 'Toast',
    category: 'feedback',
    description: 'Toast Notification System',
    code: `// filepath: components/ui/Toast.tsx
"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (message: string, type?: Toast["type"]) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => removeToast(id), 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const colors = {
    success: { bg: "rgba(34, 197, 94, 0.1)", border: "#22c55e", text: "#4ade80" },
    error: { bg: "rgba(239, 68, 68, 0.1)", border: "#ef4444", text: "#f87171" },
    info: { bg: "rgba(59, 130, 246, 0.1)", border: "#3b82f6", text: "#60a5fa" },
    warning: { bg: "rgba(245, 158, 11, 0.1)", border: "#f59e0b", text: "#fbbf24" },
  };

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div style={{ position: "fixed", bottom: "16px", right: "16px", zIndex: 100, display: "flex", flexDirection: "column", gap: "8px" }}>
        {toasts.map(toast => (
          <div
            key={toast.id}
            style={{
              padding: "12px 16px",
              backgroundColor: colors[toast.type].bg,
              border: \`1px solid \${colors[toast.type].border}\`,
              borderRadius: "12px",
              color: colors[toast.type].text,
              fontSize: "14px",
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
            }}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}`,
    usage: `// In layout.tsx:
import { ToastProvider } from "@/components/ui/Toast";
<ToastProvider>{children}</ToastProvider>

// In Komponenten:
import { useToast } from "@/components/ui/Toast";
const { addToast } = useToast();
addToast("Erfolgreich gespeichert!", "success");`
  },

  // ============================================
  // NAVIGATION KOMPONENTEN
  // ============================================
  {
    name: 'Tabs',
    category: 'navigation',
    description: 'Tab Navigation',
    code: `// filepath: components/ui/Tabs.tsx
"use client";

import { ReactNode, useState } from "react";

interface Tab {
  id: string;
  label: string;
  content: ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
}

export function Tabs({ tabs, defaultTab }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id);

  return (
    <div>
      <div style={{ display: "flex", gap: "4px", borderBottom: "1px solid #27272a", marginBottom: "16px" }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "8px 16px",
              backgroundColor: activeTab === tab.id ? "#27272a" : "transparent",
              color: activeTab === tab.id ? "#fafafa" : "#a1a1aa",
              border: "none",
              borderRadius: "8px 8px 0 0",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "500",
              transition: "all 0.2s ease",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div>
        {tabs.find(t => t.id === activeTab)?.content}
      </div>
    </div>
  );
}`,
    usage: `import { Tabs } from "@/components/ui/Tabs";

<Tabs tabs={[
  { id: "tab1", label: "Übersicht", content: <Overview /> },
  { id: "tab2", label: "Details", content: <Details /> },
]} />`
  },
];

// Funktion um Komponenten nach Kategorie zu filtern
export function getComponentsByCategory(category: ComponentTemplate['category']): ComponentTemplate[] {
  return componentLibrary.filter(c => c.category === category);
}

// Funktion um alle Komponenten-Codes für ein Projekt zu generieren
export function generateComponentFiles(componentNames: string[]): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = [];
  
  for (const name of componentNames) {
    const component = componentLibrary.find(c => c.name === name);
    if (component) {
      // Extrahiere filepath und content aus dem Code
      const match = component.code.match(/\/\/ filepath: (.+)\n([\s\S]+)/);
      if (match) {
        files.push({
          path: match[1],
          content: match[2].trim()
        });
      }
    }
  }
  
  return files;
}

// Funktion um empfohlene Komponenten basierend auf App-Typ zu erhalten
export function getRecommendedComponents(appType: string): string[] {
  const recommendations: Record<string, string[]> = {
    'crm': ['Card', 'Button', 'Input', 'Badge', 'Avatar', 'Modal', 'Tabs', 'Toast'],
    'dashboard': ['Card', 'Button', 'Badge', 'Container', 'Tabs', 'Toast'],
    'calendar': ['Card', 'Button', 'Modal', 'Badge', 'Toast'],
    'chat': ['Card', 'Button', 'Input', 'Avatar', 'Toast'],
    'todo': ['Card', 'Button', 'Input', 'Badge', 'Modal', 'Toast'],
    'ecommerce': ['Card', 'Button', 'Input', 'Badge', 'Select', 'Modal', 'Toast'],
    'default': ['Card', 'Button', 'Input', 'Modal', 'Toast'],
  };
  
  return recommendations[appType.toLowerCase()] || recommendations['default'];
}

// Export der Komponenten-Liste für UI
export const componentCategories = [
  { id: 'layout', name: 'Layout', icon: '📐' },
  { id: 'form', name: 'Formulare', icon: '📝' },
  { id: 'display', name: 'Anzeige', icon: '👁️' },
  { id: 'feedback', name: 'Feedback', icon: '💬' },
  { id: 'navigation', name: 'Navigation', icon: '🧭' },
] as const;
