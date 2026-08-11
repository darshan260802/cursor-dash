import { useRef } from "react"
import { Outlet, useLocation } from "react-router"
import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import { Sidebar } from "@/components/layout/Sidebar"
import { TopBar } from "@/components/layout/TopBar"
import { LiveSessionPill } from "@/components/LiveSessionPill"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useLiveUpdates } from "@/lib/api"
import { DURATION, EASE, prefersReducedMotion } from "@/lib/motion"

function App() {
  const { status } = useLiveUpdates()
  const location = useLocation()
  const outletRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    if (!outletRef.current || prefersReducedMotion()) return
    gsap.fromTo(outletRef.current, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: DURATION.base, ease: EASE.out })
  }, [location.pathname])

  return (
    <TooltipProvider>
      <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <TopBar status={status} liveSlot={<LiveSessionPill />} />
          <div ref={outletRef} className="min-h-0 flex-1">
            <Outlet />
          </div>
        </main>
      </div>
    </TooltipProvider>
  )
}

export default App
