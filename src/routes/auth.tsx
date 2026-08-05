import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/study/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in to save your study plan — Studyloop" },
      {
        name: "description",
        content:
          "Create a free Studyloop account so your syllabus, exam dates and timetable are saved and follow you to any device.",
      },
      { property: "og:title", content: "Sign in to save your study plan — Studyloop" },
      {
        property: "og:description",
        content: "Keep your syllabus, exams and adaptive timetable saved to your account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/" });
    });
  }, [navigate]);

  const signIn = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Welcome back — your plan is loading.");
    void navigate({ to: "/" });
  };

  const signUp = async () => {
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data.session) {
      toast.success("Check your email to confirm your account.");
      return;
    }
    toast.success("Account created — your plan will be saved from now on.");
    void navigate({ to: "/" });
  };

  const signInWithGoogle = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google sign-in failed. Try again.");
      return;
    }
    if (result.redirected) return;
    void navigate({ to: "/" });
  };


  return (
    <AppShell>
      <div className="mx-auto max-w-md">
        <h1 className="text-3xl sm:text-4xl">Save your plan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in and your syllabus, exams and timetable are stored in your account — closing the
          tab no longer clears anything.
        </p>

        <Card className="mt-6 rounded-3xl">
          <CardHeader>
            <CardTitle className="text-base">Continue with</CardTitle>
            <CardDescription>Free account, no setup.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" className="w-full rounded-full" onClick={signInWithGoogle}>
              Continue with Google
            </Button>

            <Tabs defaultValue="signin">
              <TabsList className="w-full rounded-full">
                <TabsTrigger value="signin" className="flex-1 rounded-full">
                  Sign in
                </TabsTrigger>
                <TabsTrigger value="signup" className="flex-1 rounded-full">
                  Create account
                </TabsTrigger>
              </TabsList>

              <div className="mt-4 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="rounded-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="rounded-full"
                  />
                </div>
              </div>

              <TabsContent value="signin" className="mt-4">
                <Button className="w-full rounded-full" disabled={busy} onClick={signIn}>
                  Sign in
                </Button>
              </TabsContent>
              <TabsContent value="signup" className="mt-4">
                <Button className="w-full rounded-full" disabled={busy} onClick={signUp}>
                  Create account
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
