import { useCallback, useEffect, useState } from "react"

export type Theme = "dark" | "light"

function readInitialTheme(): Theme {
  if (typeof document === "undefined") return "dark"
  return document.documentElement.dataset.theme === "light" ? "light" : "dark"
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readInitialTheme)

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme !== "light")
    document.documentElement.dataset.theme = theme
    localStorage.setItem("cursor-dash-theme", theme)
  }, [theme])

  const toggle = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"))
  }, [])

  return { theme, setTheme, toggle }
}
