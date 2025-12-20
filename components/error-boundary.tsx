"use client"

import React, { Component, ErrorInfo, ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, RefreshCw, Home, Bug } from "lucide-react"

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo)
    this.setState({ errorInfo })
    
    // In production, send to error tracking service
    // trackError(error, errorInfo)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleGoHome = () => {
    window.location.href = "/"
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <Card className="max-w-lg w-full">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
              <CardTitle>Etwas ist schiefgelaufen</CardTitle>
              <CardDescription>
                Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {this.state.error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  <p className="text-sm font-mono text-red-500 break-all">
                    {this.state.error.message}
                  </p>
                </div>
              )}

              {process.env.NODE_ENV === "development" && this.state.errorInfo && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    <Bug className="h-3 w-3 inline mr-1" />
                    Stack Trace
                  </summary>
                  <pre className="mt-2 p-2 bg-secondary rounded overflow-auto max-h-48 text-xs">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}

              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={this.handleReset}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Erneut versuchen
                </Button>
                <Button variant="outline" onClick={this.handleReload}>
                  Seite neu laden
                </Button>
                <Button onClick={this.handleGoHome}>
                  <Home className="h-4 w-4 mr-2" />
                  Zur Startseite
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}

// Hook for functional components
export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null)

  React.useEffect(() => {
    if (error) {
      throw error
    }
  }, [error])

  return setError
}

// HOC for wrapping components
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ReactNode
) {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    )
  }
}
