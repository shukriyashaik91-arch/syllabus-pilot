import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Download, FileText, KeyRound } from "lucide-react";
import { AppShell } from "@/components/study/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useStudyState } from "@/lib/study/storage";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { exportPlanPdf, exportTimetablePdf } from "@/lib/study/export-pdf";
import type { NotificationPrefs } from "@/lib/study/types";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Profile, preferences & exports — Studyloop settings" },
      {
        name: "description",
        content:
          "Update your display name, change your password, choose notification preferences and export your study plan or timetable as a PDF.",
      },
      { property: "og:title", content: "Profile, preferences & exports — Studyloop settings" },
      {
        property: "og:description",
        content: "Manage your Studyloop profile, notifications and PDF exports.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

const NOTIFICATION_LABELS: { key: keyof NotificationPrefs; label: string; hint: string }[] = [
  { key: "sessionReminders", label: "Session reminders", hint: "Nudge me about today's study blocks." },
  { key: "examAlerts", label: "Exam alerts", hint: "Warn me when an exam is within a week." },
  { key: "revisionNudges", label: "Revision nudges", hint: "Remind me about pending revision blocks." },
  { key: "motivation", label: "Motivational messages", hint: "Show encouragement on the dashboard." },
];

function SettingsPage() {
  const { state, update, reset, hydrated } = useStudyState();
  const { user } = useAuth();
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  if (!hydrated) {
    return (
      <AppShell>
        <div className="h-64 animate-pulse rounded-3xl bg-secondary" />
      </AppShell>
    );
  }

  const changePassword = async () => {
    if (password.length < 8) {
      toast.error("Use at least 8 characters.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      setPassword("");
      toast.success("Password updated.");
    }
  };

  return (
    <AppShell>
      <div className="space-y-8">
        <header>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-muted-foreground">Profile, notifications and exports.</p>
        </header>

        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
            <CardDescription>{user?.email ?? "Not signed in — saved on this device only."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="display-name">Display name</Label>
              <Input
                id="display-name"
                value={state.settings.displayName}
                maxLength={60}
                placeholder="Your name"
                onChange={(e) =>
                  update((prev) => ({
                    ...prev,
                    settings: { ...prev.settings, displayName: e.target.value.slice(0, 60) },
                  }))
                }
              />
            </div>
            {user && (
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div className="min-w-0">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                  />
                </div>
                <Button onClick={() => void changePassword()} disabled={saving} className="rounded-full">
                  <KeyRound className="size-4" aria-hidden />
                  Update
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-base">Notifications</CardTitle>
            <CardDescription>Shown in-app on your dashboard.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {NOTIFICATION_LABELS.map(({ key, label, hint }) => (
              <div
                key={key}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-2xl bg-secondary/60 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{hint}</p>
                </div>
                <Switch
                  checked={state.settings.notifications[key]}
                  aria-label={label}
                  onCheckedChange={(v) =>
                    update((prev) => ({
                      ...prev,
                      settings: {
                        ...prev.settings,
                        notifications: { ...prev.settings.notifications, [key]: v },
                      },
                    }))
                  }
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-base">Export</CardTitle>
            <CardDescription>Download a formatted copy of your plan.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => {
                if (state.plan.length === 0) {
                  toast.error("Generate a plan first.");
                  return;
                }
                exportPlanPdf(state);
              }}
            >
              <FileText className="size-4" aria-hidden />
              Study plan PDF
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => {
                if (state.plan.length === 0) {
                  toast.error("Generate a plan first.");
                  return;
                }
                exportTimetablePdf(state);
              }}
            >
              <Download className="size-4" aria-hidden />
              Timetable PDF
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-destructive/30">
          <CardHeader>
            <CardTitle className="text-base">Reset workspace</CardTitle>
            <CardDescription>Deletes your subjects, exams and timetable.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              className="rounded-full"
              onClick={() => {
                reset();
                toast.success("Workspace cleared.");
              }}
            >
              Clear everything
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
