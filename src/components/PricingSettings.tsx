import { useEffect, useState } from "react"
import { Settings2, Loader2, CloudDownload } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { usePricing, useSetPricing, useCloudSync } from "@/lib/api"
import type { PricingModelEntry } from "@/lib/types"

export function PricingSettings() {
  const [open, setOpen] = useState(false)
  const { data: pricing } = usePricing()
  const setPricing = useSetPricing()
  const cloudSync = useCloudSync()
  const [draft, setDraft] = useState<Record<string, PricingModelEntry>>({})

  useEffect(() => {
    if (pricing) setDraft(pricing.models)
  }, [pricing])

  function updateRate(model: string, field: "input" | "output", value: string) {
    const n = value === "" ? null : Number(value)
    setDraft((d) => ({ ...d, [model]: { ...d[model], [field]: Number.isFinite(n) ? n : null } }))
  }

  function save() {
    setPricing.mutate(draft, { onSuccess: () => setOpen(false) })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            <Settings2 className="size-3.5" />
            Pricing
          </button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cost estimation</DialogTitle>
          <DialogDescription>
            Cursor doesn't expose your actual bill locally — these are per-million-token rates you set, used only to
            estimate cost from token counts. They're not invoiced amounts.
          </DialogDescription>
        </DialogHeader>

        <div className="scrollbar-thin -mx-1 max-h-80 overflow-y-auto px-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">Model</th>
                <th className="w-24 pb-2 font-medium">Input $/M</th>
                <th className="w-24 pb-2 font-medium">Output $/M</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(draft).map(([model, rate]) => (
                <tr key={model} className="border-t border-border">
                  <td className="num py-1.5 pr-2 text-xs">{model}</td>
                  <td className="py-1.5 pr-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={rate.input ?? ""}
                      placeholder="unpriced"
                      onChange={(e) => updateRate(model, "input", e.target.value)}
                      className="h-7 text-xs"
                    />
                  </td>
                  <td className="py-1.5">
                    <Input
                      type="number"
                      step="0.01"
                      value={rate.output ?? ""}
                      placeholder="unpriced"
                      onChange={(e) => updateRate(model, "output", e.target.value)}
                      className="h-7 text-xs"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-md border border-border bg-muted/40 p-3">
          <div className="flex items-center gap-2 text-xs font-medium">
            <CloudDownload className="size-3.5 text-iris" /> Live usage sync (experimental)
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Optionally fetches your real spend from cursor.com using the auth token already stored locally by Cursor.
            Off by default — start cursor-dash with <span className="num">--cloud</span> to enable, then click below.
            This sends your local Cursor auth token to cursor.com.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => cloudSync.mutate()} disabled={cloudSync.isPending}>
              {cloudSync.isPending && <Loader2 className="size-3 animate-spin" />}
              Try sync
            </Button>
            {cloudSync.data && (
              <span className="text-xs text-muted-foreground">
                {cloudSync.data.ok ? "Synced." : `Unavailable (${cloudSync.data.reason}).`}
              </span>
            )}
          </div>
        </div>

        <DialogFooter>
          <Label className="mr-auto text-xs text-muted-foreground">Saved to ~/.cursor-dash/config.json</Label>
          <Button onClick={save} disabled={setPricing.isPending}>
            {setPricing.isPending && <Loader2 className="size-3.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
