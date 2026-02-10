"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import placeholderData from "@/data/dashboard-data.json";

type DashboardData = typeof placeholderData;

const projectGridColumns = "grid-cols-1 lg:grid-cols-3";

export default function HomePage() {
  const [data, setData] = useState<DashboardData>(placeholderData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/dashboard-data");
      if (!response.ok) {
        throw new Error("Failed to load dashboard data");
      }

      const json = (await response.json()) as DashboardData;
      setData(json);
      setLastUpdated(
        new Date().toLocaleString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          day: "2-digit",
          month: "short",
        })
      );
    } catch (error) {
      console.error("Dashboard refresh failed", error);
      setError("Unable to refresh right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchData();
    }, 30_000);

    return () => {
      clearInterval(interval);
    };
  }, [fetchData]);

  const statusMessage = error
    ? error
    : loading
    ? "Refreshing data..."
    : "Data current";

  const projects = data.projects;
  const contentItems = data.content.items ?? [];
  const trading = data.trading;
  const cronJobs = data.crons.jobs ?? [];
  const calendarEvents = data.calendar.events ?? [];
  const githubEntries = (projects.recentActivity ?? []).filter((activity) => activity.type === "github");
  const tradingStatusIntent = trading.status?.dailyStatus === "Green"
    ? "success"
    : trading.status?.dailyStatus === "Amber"
    ? "warning"
    : "default";

  return (
    <main className="main-container space-y-8">
      <header className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-slate-500">OpenClaw ops</p>
            <h1 className="text-3xl font-semibold text-white">Dashboard</h1>
          </div>
          <div className="text-right text-sm text-slate-400">
            <p>{statusMessage}</p>
            <p>
              Last updated: {lastUpdated ?? "—"}
              <span className="block text-xs text-slate-500">Auto-refresh every 30s</span>
            </p>
          </div>
        </div>
      </header>

      <section className="space-y-4">
        <div className="section-heading">
          <h2>Agent overview</h2>
          <span>{data.agents.length} agents tracked</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {data.agents.map((agent) => {
            const isActive = agent.state.toLowerCase() === "active";
            return (
              <Card key={agent.name} className="bg-slate-900/60 border-slate-800">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle>{agent.name}</CardTitle>
                    <Badge intent={isActive ? "success" : "default"}>{agent.state}</Badge>
                  </div>
                  <CardDescription className="text-slate-400 text-xs">
                    <span className="block">Model: {agent.model}</span>
                    <span className="block mt-1">{agent.sessions} sessions · {agent.tokens.toLocaleString()} tokens · £{agent.cost.toFixed(2)}</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-0">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="text-xs text-slate-500">Sessions</div>
                      <div className="text-lg font-semibold text-white">{agent.sessions}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Tokens</div>
                      <div className="text-lg font-semibold text-white">{agent.tokens.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Est. £</div>
                      <div className="text-lg font-semibold text-white">£{agent.cost.toFixed(1)}</div>
                    </div>
                  </div>
                  {agent.tasks && agent.tasks.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-400 mb-2">Current tasks</p>
                      <ul className="space-y-1">
                        {agent.tasks.map((task, idx) => (
                          <li key={idx} className="text-xs text-slate-300 flex items-start gap-2">
                            <span className="mt-0.5 h-1 w-1 rounded-full bg-slate-500 flex-shrink-0" />
                            <span>{typeof task === 'string' ? task : task.title}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <div className="section-heading">
          <h2>Projects &amp; activity</h2>
          <span>Current focus + creative output</span>
        </div>
        <div className={`grid gap-4 ${projectGridColumns}`}>
          <Card>
            <CardHeader>
              <CardTitle>Active projects</CardTitle>
              <CardDescription className="text-slate-400">Key initiatives in flight</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {projects.active.length ? (
                projects.active.map((project) => (
                  <div key={project.name} className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-white">{project.name}</p>
                      <p className="text-sm text-slate-500">Owner: {project.owner}</p>
                    </div>
                    <Badge intent={project.status === "Live monitoring" ? "success" : "default"}>
                      {project.status}
                    </Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400">No active projects available.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent activity log</CardTitle>
              <CardDescription className="text-slate-400">Signals from the last 48h</CardDescription>
            </CardHeader>
            <CardContent>
              {projects.activityLog.length ? (
                <ul className="space-y-2 text-sm text-slate-300">
                  {projects.activityLog.map((entry) => (
                    <li key={entry} className="flex items-start gap-2">
                      <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      <span>{entry}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400">No recent activity available.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Content this week</CardTitle>
              <CardDescription className="text-slate-400">Assets ready for publishing</CardDescription>
            </CardHeader>
            <CardContent>
              {contentItems.length ? (
                <div className="space-y-2 text-sm text-slate-200">
                  {contentItems.map((item) => (
                    <div key={`${item.title}-${item.date}`} className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-white">{item.title}</p>
                        <p className="text-xs text-slate-500">{item.source} · {item.date}</p>
                      </div>
                      <span className="text-xs text-slate-500">Ready</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">No content ready this week.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-4">
        <div className="section-heading">
          <h2>Operational snapshot</h2>
          <span>Systems &amp; schedule</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Cron jobs</CardTitle>
              <CardDescription className="text-slate-400">Status &amp; next run</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-200">
              {cronJobs.length ? (
                cronJobs.map((cron) => (
                  <div key={cron.name} className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-white">{cron.name}</p>
                      <p className="text-xs text-slate-500">Next: {cron.nextRun}</p>
                    </div>
                    <Badge
                      intent={
                        cron.status === "Success"
                          ? "success"
                          : cron.status === "Running"
                          ? "default"
                          : "warning"
                      }
                    >
                      {cron.status}
                    </Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400">Cron status temporarily unavailable.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>GitHub board</CardTitle>
              <CardDescription className="text-slate-400">In progress signals</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {githubEntries.length ? (
                githubEntries.map((entry, index) => (
                  <div key={`${entry.label}-${index}`} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{entry.label}</p>
                      <p className="text-xs text-slate-500">{entry.detail}</p>
                    </div>
                    <Badge intent="default">{entry.source}</Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400">No GitHub activity right now.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Next 7 days</CardTitle>
              <CardDescription className="text-slate-400">Calendar highlights</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-200">
              {calendarEvents.length ? (
                calendarEvents.map((item) => (
                  <div key={item.day} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">{item.day}</p>
                      <p className="text-xs text-slate-500">{item.event}</p>
                    </div>
                    <span className="text-xs text-slate-400">{item.time}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400">Calendar unavailable.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Trading section - Last */}
      <section className="space-y-4">
        <div className="section-heading">
          <h2>Trading</h2>
          <span>Back-to-Lay pipeline</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
              <CardDescription className="text-slate-400">Daily sentiment</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-slate-400">
                {trading.status?.statusNote ?? "Trading status unavailable."}
              </div>
              <div className="flex items-center gap-3 text-2xl font-semibold text-white">
                <Badge intent={tradingStatusIntent}>{trading.status?.dailyStatus ?? "Unknown"}</Badge>
                <span className="text-xs text-slate-500">
                  {trading.availability === "available" ? "Live" : "Data unavailable"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Qualified horses</CardTitle>
              <CardDescription className="text-slate-400">Shortlist for today</CardDescription>
            </CardHeader>
            <CardContent>
              {trading.qualifiedHorses.length ? (
                <div className="space-y-3">
                  {trading.qualifiedHorses.map((horse) => (
                    <div key={`${horse.name}-${horse.race}`} className="rounded-xl border border-slate-800/60 p-3">
                      <p className="text-sm font-semibold text-white">{horse.name}</p>
                      <p className="text-xs text-slate-500">{horse.race}</p>
                      <p className="text-xs text-slate-500">Value: {horse.value}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">No qualified horses identified today.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>B2L Pipeline</CardTitle>
              <CardDescription className="text-slate-400">Daily process stages</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {trading.pipelineStages && trading.pipelineStages.length ? (
                trading.pipelineStages.map((stage) => (
                  <div key={stage.name} className="flex items-start gap-3">
                    <div className={`mt-0.5 h-3 w-3 rounded-full flex-shrink-0 ${stage.completed ? "bg-emerald-400" : "bg-slate-600"}`} />
                    <div className="flex-1 text-sm">
                      <p className={stage.completed ? "font-semibold text-emerald-300" : "text-slate-300"}>{stage.label}</p>
                      {stage.note && <p className="text-xs text-slate-500">{stage.note}</p>}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400">Pipeline stages not yet loaded.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
