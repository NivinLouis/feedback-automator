// File: src/app/page.js

"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  Terminal,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Circle,
} from "lucide-react";

const INITIAL_STEPS = [
  { key: "login", label: "Login", progress: 0, detail: "" },
  { key: "batch", label: "Fetch Batch", progress: 0, detail: "" },
  { key: "semester", label: "Fetch Semester", progress: 0, detail: "" },
  { key: "config", label: "Fetch Config", progress: 0, detail: "" },
  { key: "pending", label: "Find Pending Forms", progress: 0, detail: "" },
  {
    key: "submit",
    label: "Submit Feedback",
    progress: 0,
    detail: "0/0",
    total: 0,
    completed: 0,
  },
];

export default function HomePage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");
  const [steps, setSteps] = useState(INITIAL_STEPS);
  const readerRef = useRef(null);

  const logRef = useRef(null);
  const endOfLogsRef = useRef(null);

  useEffect(() => {
    if (endOfLogsRef.current) {
      endOfLogsRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);
  const resetUI = () => {
    setLogs([]);
    setError("");
    setSteps(INITIAL_STEPS.map((s) => ({ ...s })));
  };

  const updateStep = (evt) => {
    setSteps((prev) =>
      prev.map((s) =>
        s.key === evt.step
          ? {
              ...s,
              progress:
                typeof evt.progress === "number" ? evt.progress : s.progress,
              detail:
                evt.step === "submit" &&
                evt.total != null &&
                evt.completed != null
                  ? `${evt.completed}/${evt.total}`
                  : evt.message ?? s.detail,
              total: evt.total ?? s.total,
              completed: evt.completed ?? s.completed,
            }
          : s
      )
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    resetUI();
    setIsLoading(true);

    try {
      const response = await fetch("/api/automate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.body) {
        throw new Error("Streaming not supported by the browser/environment.");
      }

      const reader = response.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let evt;
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }

          if (evt.type === "status") {
            updateStep(evt);
            if (evt.message) {
              setLogs((l) => [...l, evt.message]);
            }
          } else if (evt.type === "log") {
            setLogs((l) => [...l, evt.message]);
          } else if (evt.type === "error") {
            setError(evt.message || "Unknown error");
            setIsLoading(false);
          } else if (evt.type === "done") {
            if (Array.isArray(evt.logs)) setLogs(evt.logs);
            setIsLoading(false);
          }
        }
      }
    } catch (err) {
      setError(err.message || "Failed to connect to the server.");
      setIsLoading(false);
    } finally {
      try {
        await readerRef.current?.cancel();
      } catch {}
    }
  };

  const StepRow = ({ label, progress, detail }) => {
    const statusIcon =
      progress >= 100 ? (
        <CheckCircle2 className="h-4 w-4" />
      ) : progress > 0 ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Circle className="h-4 w-4" />
      );

    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            {statusIcon}
            <span className="font-medium">{label}</span>
          </div>
          <span className="text-xs tabular-nums">
            {Math.min(progress, 100)}%
          </span>
        </div>
        <Progress value={Math.min(progress, 100)} />
        {detail ? (
          <div className="text-xs text-muted-foreground">{detail}</div>
        ) : null}
      </div>
    );
  };

  return (
    <main className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 p-4">
      <Card className="w-full max-w-2xl shadow-lg">
        <CardHeader>
          <CardTitle className="text-center text-2xl">
            Vidya Feedback Automator
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          {/* Left: Form + Steps */}
          <div className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-3">
              <Input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ERP Username"
                required
              />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="ERP Password"
                required
              />
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Automating...
                  </>
                ) : (
                  "Start Automation"
                )}
              </Button>
            </form>

            {/* Steps */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Progress</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {steps.map((s) => (
                  <StepRow
                    key={s.key}
                    label={s.label}
                    progress={s.progress}
                    detail={s.detail}
                  />
                ))}
              </CardContent>
            </Card>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          {/* Right: Logs */}
          <div>
            <Card className="bg-gray-900 text-gray-100 h-full">
              <CardHeader className="flex flex-row items-center space-x-2 pb-2">
                <Terminal className="h-4 w-4" />
                <CardTitle className="text-gray-200 text-base">
                  Automation Log
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-80 text-sm font-mono" ref={logRef}>
                  <pre className="whitespace-pre-wrap break-words leading-6">
                    {logs.join("\n")}
                  </pre>
                  <div ref={endOfLogsRef} />
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
