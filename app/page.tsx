import { Header } from "@/components/header"
import { HeroSection } from "@/components/hero-section"
import { AgentWorkflow } from "@/components/agent-workflow"
import { FeaturesGrid } from "@/components/features-grid"
import { MarketplaceShowcase } from "@/components/marketplace-showcase"
import { ConfigurationPanel } from "@/components/configuration-panel"
import { Footer } from "@/components/footer"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <HeroSection />
        <AgentWorkflow />
        <FeaturesGrid />
        <MarketplaceShowcase />
        <ConfigurationPanel />
      </main>
      <Footer />
    </div>
  )
}
