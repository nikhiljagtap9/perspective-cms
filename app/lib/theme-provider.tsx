import { createContext, useContext, useState, useEffect } from "react";
import { useFetcher } from "@remix-run/react";

type Theme = "light" | "dark";
type ThemeContextType = [Theme, (theme: Theme) => void];

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const fetcher = useFetcher();

  const setThemeWithStorage = (newTheme: Theme) => {
    setTheme(newTheme);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(newTheme);
    localStorage.setItem("theme", newTheme);
  };

  useEffect(() => {
    const storedTheme = localStorage.getItem("theme") as Theme | null;
    if (storedTheme) {
      setThemeWithStorage(storedTheme);
    } else {
      setThemeWithStorage("dark");
    }
  }, []);

  return (
    <ThemeContext.Provider value={[theme, setThemeWithStorage]}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
} 