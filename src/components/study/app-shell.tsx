import { Link } from "@tanstack/react-router";
import { BarChart3, BookOpen, CalendarRange, LayoutDashboard, LogIn, LogOut, Moon, Settings, Sun } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/setup", label: "Setup", icon: BookOpen },
  { to: "/plan", label: "Timetable", icon: CalendarRange },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

/** Shared chrome: brand, primary navigation, theme toggle. */
export function AppShell({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(false);
  const { user, signOut } = useAuth();

  useEffect(() => {
    const stored = window.localStorage.getItem("study-planner:theme");
    const isDark = stored === "dark";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem("study-planner:theme", next ? "dark" : "light");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <BookOpen className="size-4" aria-hidden />
            </span>
            <span className="font-display text-lg font-semibold tracking-tight">Studyloop</span>
          </Link>

          <nav aria-label="Main" className="ml-auto flex items-center gap-1">
            {NAV.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground"
                activeProps={{ className: "bg-secondary text-secondary-foreground font-medium" }}
                activeOptions={{ exact: to === "/" }}
              >
                <Icon className="size-4" aria-hidden />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            ))}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              className="ml-1 rounded-full"
            >
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            {user ? (
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full"
                onClick={() => void signOut()}
              >
                <LogOut className="size-4" aria-hidden />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            ) : (
              <Button asChild size="sm" className="rounded-full">
                <Link to="/auth">
                  <LogIn className="size-4" aria-hidden />
                  <span className="hidden sm:inline">Save my plan</span>
                </Link>
              </Button>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-muted-foreground sm:px-6">
        {user
          ? `Signed in as ${user.email ?? "your account"} — your plan is saved to the cloud.`
          : "Saved on this device only. Sign in to keep your plan across tabs and devices."}
      </footer>

    </div>
  );
}
