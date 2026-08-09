import { Outlet } from "react-router"
import { Sidebar } from "@/components/layout/Sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useLiveUpdates } from "@/lib/api"

function App() {
  useLiveUpdates()

  return (
    <TooltipProvider>
      <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </TooltipProvider>
  )
}

export default App
