"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Terminal,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Circle,
  Github,
  Sparkles,
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

const FEEDBACK_OPTIONS = [
  { value: 1, label: "Excellent" },
  { value: 2, label: "Very Good" },
  { value: 3, label: "Good" },
  { value: 4, label: "Fair" },
  { value: 5, label: "Poor" },
];

export default function HomePage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");
  const [steps, setSteps] = useState(INITIAL_STEPS);
  const [validationError, setValidationError] = useState("");

  const [feedbackMode, setFeedbackMode] = useState("set-all");
  const [selectedRating, setSelectedRating] = useState(1);

  const [pendingFaculties, setPendingFaculties] = useState([]);
  const [facultyRatings, setFacultyRatings] = useState({});
  const [showFacultyRatingModal, setShowFacultyRatingModal] = useState(false);

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
    setValidationError("");
    setSteps(INITIAL_STEPS.map((s) => ({ ...s })));
    setPendingFaculties([]);
    setFacultyRatings({});
    setShowFacultyRatingModal(false);
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

  const processStream = async (reader) => {
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
        } else if (evt.type === "need_ratings") {
          setPendingFaculties(evt.faculties);
          const initialRatings = {};
          evt.faculties.forEach((faculty) => {
            initialRatings[faculty.id] = 1;
          });
          setFacultyRatings(initialRatings);
          setShowFacultyRatingModal(true);
          setIsLoading(false);
        } else if (evt.type === "error") {
          setError(evt.message || "Unknown error");
          setIsLoading(false);
        } else if (evt.type === "done") {
          if (Array.isArray(evt.logs)) setLogs(evt.logs);
          setIsLoading(false);
        }
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!username.trim() || !password.trim()) {
      setValidationError("Please enter both username and password before starting automation.");
      return;
    }

    resetUI();
    setIsLoading(true);

    try {
      const requestBody = {
        username,
        password,
        feedbackMode,
        rating: feedbackMode === "set-all" ? selectedRating : null,
      };

      const response = await fetch("/api/automate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.body) {
        throw new Error("Streaming not supported by the browser/environment.");
      }

      const reader = response.body.getReader();
      readerRef.current = reader;
      await processStream(reader);
    } catch (err) {
      setError(err.message || "Failed to connect to the server.");
      setIsLoading(false);
    } finally {
      try {
        await readerRef.current?.cancel();
      } catch {}
    }
  };

  const handleConfirmRatings = async () => {
    setShowFacultyRatingModal(false);
    setIsLoading(true);

    try {
      const requestBody = {
        username,
        password,
        feedbackMode: "custom",
        facultyRatings,
      };

      const response = await fetch("/api/automate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.body) {
        throw new Error("Streaming not supported by the browser/environment.");
      }

      const reader = response.body.getReader();
      readerRef.current = reader;
      await processStream(reader);
    } catch (err) {
      setError(err.message || "Failed to submit ratings.");
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
        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
      ) : progress > 0 ? (
        <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
      ) : (
        <Circle className="h-4 w-4 text-gray-400" />
      );

    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            {statusIcon}
            <span className="font-medium text-gray-900">{label}</span>
          </div>
          <div className="flex items-center gap-2">
            {detail && <span className="text-xs text-gray-600">{detail}</span>}
            <span className="text-xs tabular-nums font-semibold text-gray-600">
              {Math.min(progress, 100)}%
            </span>
          </div>
        </div>
        <div className="relative h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#d66d75] to-[#e29587] transition-all duration-500"
            style={{ width: `${Math.min(progress, 100)}%` }}
          ></div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 bg-gray-50">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(59, 130, 246, 0.1) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(59, 130, 246, 0.1) 1px, transparent 1px)
            `,
            backgroundSize: "20px 20px",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(59, 130, 246, 0.2) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(59, 130, 246, 0.2) 1px, transparent 1px)
            `,
            backgroundSize: "100px 100px",
          }}
        />
        <div className="absolute inset-0 opacity-[0.15]">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <pattern
              id="blueprint-marks"
              x="0"
              y="0"
              width="100"
              height="100"
              patternUnits="userSpaceOnUse"
            >
              <text x="5" y="10" className="text-[6px] fill-blue-500">
                100
              </text>
              <text x="105" y="10" className="text-[6px] fill-blue-500">
                200
              </text>
              <text x="205" y="10" className="text-[6px] fill-blue-500">
                300
              </text>

              <text x="2" y="105" className="text-[6px] fill-blue-500">
                100
              </text>
              <text x="2" y="205" className="text-[6px] fill-blue-500">
                200
              </text>
              <text x="2" y="305" className="text-[6px] fill-blue-500">
                300
              </text>

              <circle cx="100" cy="100" r="2" className="fill-blue-500/30" />
              <circle cx="200" cy="200" r="2" className="fill-blue-500/30" />
              <circle cx="300" cy="300" r="2" className="fill-blue-500/30" />
            </pattern>
            <rect width="100%" height="100%" fill="url(#blueprint-marks)" />
          </svg>
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(203,213,225,0.33),transparent_70%)]" />
      </div>

      <main className="relative flex items-center justify-center min-h-screen p-4">
        <div className="w-full max-w-6xl">
          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-[2rem] opacity-20 blur-2xl transition-opacity duration-1000"></div>

            <div className="relative backdrop-blur-2xl bg-white/30 rounded-[2rem] border border-white/20 shadow-xl overflow-hidden">
              <div className="p-8">
                <div className="flex flex-col items-center justify-center gap-3 text-center">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl blur-lg opacity-50"></div>
                  </div>
                  <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
                    Vidya Feedback Automator
                  </h1>
                </div>
              </div>

              <div className="p-8">
                <div className="grid gap-8 lg:grid-cols-2">
                  <div className="space-y-6">
                    {validationError && (
                      <Alert variant="destructive" className="backdrop-blur-xl bg-red-500/10 border-red-500/30">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Login Required</AlertTitle>
                        <AlertDescription>{validationError}</AlertDescription>
                      </Alert>
                    )}

                    <div className="relative">
                      <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-purple-500 rounded-2xl opacity-0 blur transition-opacity duration-500"></div>
                      <div className="relative backdrop-blur-xl bg-white/20 rounded-2xl border border-white/30 shadow-lg p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                          <div className="h-2 w-2 bg-emerald-400 rounded-full animate-pulse shadow-lg shadow-emerald-400/30"></div>
                          Login Credentials
                        </h2>
                        <div className="space-y-4">
                          <div className="relative">
                            <Input
                              type="text"
                              value={username}
                              onChange={(e) => {
                                setUsername(e.target.value);
                                setValidationError("");
                              }}
                              placeholder="ERP Username"
                              className="backdrop-blur-sm bg-white/30 border-white/20 text-gray-900 placeholder:text-gray-500 focus:bg-white/40 focus:border-white/30 transition-all"
                            />
                          </div>
                          <div className="relative">
                            <Input
                              type="password"
                              value={password}
                              onChange={(e) => {
                                setPassword(e.target.value);
                                setValidationError("");
                              }}
                              placeholder="ERP Password"
                              className="backdrop-blur-sm bg-white/30 border-white/20 text-gray-900 placeholder:text-gray-500 focus:bg-white/40 focus:border-white/30 transition-all"
                            />
                          </div>

                          <div className="space-y-3 pt-2">
                            <label className="text-sm font-medium text-gray-900">
                              Feedback Mode
                            </label>
                            <div className="space-y-2">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name="feedbackMode"
                                  value="set-all"
                                  checked={feedbackMode === "set-all"}
                                  onChange={(e) => setFeedbackMode(e.target.value)}
                                  className="w-4 h-4 text-blue-600"
                                />
                                <span className="text-sm text-gray-800">
                                  Set same rating for all faculties
                                </span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name="feedbackMode"
                                  value="custom"
                                  checked={feedbackMode === "custom"}
                                  onChange={(e) => setFeedbackMode(e.target.value)}
                                  className="w-4 h-4 text-blue-600"
                                />
                                <span className="text-sm text-gray-800">
                                  Customize rating for each faculty
                                </span>
                              </label>
                            </div>
                          </div>

                          {feedbackMode === "set-all" && (
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-gray-900">
                                Select Rating
                              </label>
                              <select
                                value={selectedRating}
                                onChange={(e) => setSelectedRating(Number(e.target.value))}
                                className="w-full backdrop-blur-sm bg-white/30 border border-white/20 text-gray-900 rounded-md px-3 py-2 focus:bg-white/40 focus:border-white/30 transition-all"
                              >
                                {FEEDBACK_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          <Button
                            onClick={handleSubmit}
                            className="relative w-full bg-gradient-to-r from-[#d66d75] to-[#e29587] hover:from-[#d66d75]/90 hover:to-[#e29587]/90 text-white overflow-hidden rounded-lg"
                            disabled={isLoading}
                          >
                            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>

                            {isLoading ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Automating...
                              </>
                            ) : (
                              <>Start Automation</>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="relative">
                      <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-2xl opacity-0 blur transition-opacity duration-500"></div>
                      <div className="relative backdrop-blur-xl bg-white/20 rounded-2xl border border-white/30 shadow-lg p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                          <div className="h-2 w-2 bg-blue-400 rounded-full animate-pulse shadow-lg shadow-blue-400/30"></div>
                          Progress Tracker
                        </h2>
                        <div className="space-y-3">
                          {steps.map((s) => (
                            <StepRow
                              key={s.key}
                              label={s.label}
                              progress={s.progress}
                              detail={s.detail}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    {error && (
                      <div className="relative animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-red-500 to-pink-500 rounded-2xl opacity-20 blur"></div>
                        <div className="relative backdrop-blur-xl bg-red-500/10 border border-red-500/30 rounded-2xl p-4 shadow-lg">
                          <div className="flex gap-3">
                            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                            <div>
                              <h3 className="font-semibold text-red-700 mb-1">
                                Error Occurred
                              </h3>
                              <p className="text-sm text-red-600">{error}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    {showFacultyRatingModal ? (
                      <div className="relative backdrop-blur-xl bg-white/20 rounded-2xl border border-white/30 shadow-lg overflow-hidden">
                        <div className="backdrop-blur-xl bg-white/30 border-b border-white/20 px-6 py-4">
                          <h2 className="text-gray-900 font-semibold">
                            Customize Faculty Ratings
                          </h2>
                          <p className="text-sm text-gray-600 mt-1">
                            Select a rating for each faculty below
                          </p>
                        </div>
                        <div className="p-6">
                          <ScrollArea className="h-[400px]">
                            <div className="space-y-4">
                              {pendingFaculties.map((faculty) => (
                                <div
                                  key={faculty.id}
                                  className="backdrop-blur-sm bg-white/30 rounded-lg p-4 border border-white/20"
                                >
                                  <div className="font-medium text-gray-900 mb-2">
                                    {faculty.name}
                                  </div>
                                  <div className="text-xs text-gray-600 mb-3">
                                    {faculty.course}
                                  </div>
                                  <select
                                    value={facultyRatings[faculty.id] || 1}
                                    onChange={(e) =>
                                      setFacultyRatings({
                                        ...facultyRatings,
                                        [faculty.id]: Number(e.target.value),
                                      })
                                    }
                                    className="w-full backdrop-blur-sm bg-white/30 border border-white/20 text-gray-900 rounded-md px-3 py-2 text-sm"
                                  >
                                    {FEEDBACK_OPTIONS.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                          <div className="mt-4">
                            <Button
                              onClick={handleConfirmRatings}
                              className="w-full bg-gradient-to-r from-[#d66d75] to-[#e29587] hover:from-[#d66d75]/90 hover:to-[#e29587]/90 text-white"
                            >
                              Confirm & Continue
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="relative backdrop-blur-xl bg-white/20 rounded-2xl border border-white/30 shadow-lg overflow-hidden">
                        <div className="backdrop-blur-xl bg-white/30 border-b border-white/20 px-6 py-4 flex items-center gap-3">
                          <Terminal className="h-5 w-5 text-emerald-400" />
                          <h2 className="text-gray-900 font-semibold">
                            Automation Log
                          </h2>
                          <div className="ml-auto flex gap-2">
                            <div className="h-3 w-3 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                            <div className="h-3 w-3 rounded-full bg-yellow-500 shadow-lg shadow-yellow-500/20"></div>
                            <div className="h-3 w-3 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/20"></div>
                          </div>
                        </div>
                        <div className="p-6 bg-transparent">
                          <ScrollArea className="h-[500px]" ref={logRef}>
                            <pre className="text-sm font-mono text-gray-800 whitespace-pre-wrap break-words leading-relaxed">
                              {logs.length > 0 ? (
                                logs.join("\n")
                              ) : (
                                <span className="text-gray-400">
                                  $ Waiting for automation to start...
                                </span>
                              )}
                            </pre>
                            <div ref={endOfLogsRef} />
                          </ScrollArea>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-center">
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-gray-600 to-gray-800 rounded-xl opacity-0 blur transition-opacity duration-300"></div>
              <Button
                onClick={() =>
                  window.open(
                    "https://github.com/NivinLouis/feedback-automator",
                    "_blank"
                  )
                }
                className="relative backdrop-blur-md bg-white/30 border border-white/20 text-gray-900 shadow-md hover:bg-white/40 transition-all transform hover:scale-105"
              >
                <Github className="h-4 w-4 mr-2" />
                View on GitHub
              </Button>
            </div>
          </div>
          <div className="mt-6 flex justify-center">
            <img
              src="ondotfooter.png"
              alt="App Logo"
              className="h-12 w-auto opacity-80 hover:opacity-100 transition-opacity"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
