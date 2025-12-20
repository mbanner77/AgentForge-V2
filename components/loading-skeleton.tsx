"use client"

import { cn } from "@/lib/utils"

interface SkeletonProps {
  className?: string
  style?: React.CSSProperties
}

export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted",
        className
      )}
      style={style}
    />
  )
}

// Card Skeleton
export function CardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  )
}

// Chat Message Skeleton
export function ChatMessageSkeleton() {
  return (
    <div className="flex gap-3 p-4">
      <Skeleton className="h-8 w-8 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
    </div>
  )
}

// Code Editor Skeleton
export function CodeEditorSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2">
      <div className="flex items-center gap-2 mb-4">
        <Skeleton className="h-3 w-3 rounded-full" />
        <Skeleton className="h-3 w-3 rounded-full" />
        <Skeleton className="h-3 w-3 rounded-full" />
        <Skeleton className="h-4 w-32 ml-4" />
      </div>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex gap-2">
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-3" style={{ width: `${Math.random() * 60 + 20}%` }} />
        </div>
      ))}
    </div>
  )
}

// Workflow Step Skeleton
export function WorkflowStepSkeleton() {
  return (
    <div className="flex items-center gap-4 p-3 rounded-lg border border-border">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-48" />
      </div>
      <Skeleton className="h-6 w-16 rounded-full" />
    </div>
  )
}

// Sidebar Skeleton
export function SidebarSkeleton() {
  return (
    <div className="w-80 border-r border-border p-4 space-y-4">
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <Skeleton className="h-8 w-8 rounded" />
        <Skeleton className="h-5 w-32" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ))}
    </div>
  )
}

// Table Skeleton
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="bg-secondary/50 p-3 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="p-3 flex gap-4 border-t border-border">
          {Array.from({ length: cols }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

// Full Page Loading
export function PageLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="h-14 border-b border-border px-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>
      </div>
      
      {/* Content */}
      <div className="flex">
        <SidebarSkeleton />
        <div className="flex-1 p-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-3 gap-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
          <TableSkeleton />
        </div>
      </div>
    </div>
  )
}

// Inline Loading Spinner
export function LoadingSpinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8",
  }

  return (
    <div className={cn("animate-spin rounded-full border-2 border-muted border-t-primary", sizeClasses[size])} />
  )
}

// Button Loading State
export function ButtonLoading({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <LoadingSpinner size="sm" />
      {children && <span>{children}</span>}
    </div>
  )
}
