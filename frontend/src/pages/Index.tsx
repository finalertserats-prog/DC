import { useNavigate } from "react-router-dom";
import { Database, ArrowRightLeft, Layers, BarChart3, GitBranch, ExternalLink, ShieldCheck, Archive } from "lucide-react";
import { useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const tiles = [
  {
    title: "Data Profiler",
    description: "Deep-dive profiling and schema introspection.",
    icon: Database,
    url: "/data-profiler",
    available: true,
    color: "from-blue-500/20 to-blue-600/10 border-blue-500/30 hover:border-blue-400/60",
    iconColor: "text-blue-400",
  },
  {
    title: "Data Migration",
    description: "Move data across systems with zero downtime.",
    icon: ArrowRightLeft,
    url: "/data-migration",
    available: true,
    color: "from-purple-500/20 to-purple-600/10 border-purple-500/30 hover:border-purple-400/60",
    iconColor: "text-purple-400",
  },
  {
    title: "Application Layer",
    description: "Build APIs, workflows, and business logic.",
    icon: Layers,
    url: null,
    available: false,
    color: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/30",
    iconColor: "text-emerald-400",
  },
  {
    title: "Data Viz",
    description: "Transform raw data into visual stories.",
    icon: BarChart3,
    url: "/dataviz",
    available: true,
    color: "from-orange-500/20 to-orange-600/10 border-orange-500/30 hover:border-orange-400/60",
    iconColor: "text-orange-400",
  },
  {
    title: "Data Disposition",
    description: "NLP to SQL, Talk to your data.",
    icon: Archive,
    url: "/datadisposition",
    available: true,
    color: "from-rose-500/20 to-rose-600/10 border-rose-500/30 hover:border-rose-400/60",
    iconColor: "text-rose-400",
  },
];

const dataMonitor = {
  title: "Data Monitor",
  description: "Analyze and audit your data quality at scale.",
  icon: ShieldCheck,
  url: "/home",
  available: true,
  color: "from-blue-500/20 to-blue-600/10 border-blue-500/30 hover:border-blue-400/60",
  iconColor: "text-blue-400",
};

const Index = () => {
  const navigate = useNavigate();
  const [gitOpen, setGitOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-background text-foreground flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">

          {/* Header */}
          <header className="flex items-center gap-4 px-8 py-5 border-b border-border">
            <SidebarTrigger />
            <div className="flex items-center gap-3 flex-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">Data Commander</h1>
                <p className="text-xs text-muted-foreground">Command your data universe</p>
              </div>
            </div>
            {/* Data Monitor button — top-right */}
            <button
              onClick={() => navigate(dataMonitor.url!)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-gradient-to-br text-sm font-medium transition-all duration-200 hover:scale-105 hover:shadow-md ${dataMonitor.color} ${dataMonitor.iconColor}`}
            >
              <dataMonitor.icon className="h-4 w-4" />
              {dataMonitor.title}
            </button>
          </header>

          {/* Main */}
          <main className="flex-1 mx-auto w-full max-w-5xl px-8 pt-16 pb-24">
            <div className="mb-12 text-center">
              <h2 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
                Your Data, <span className="text-primary">Your Command</span>
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
                A unified platform to profile, migrate, build, and visualize — all from one place.
              </p>
            </div>

            {/* Git connect banner */}
            <div className="mx-auto mb-8 flex max-w-2xl flex-col items-center gap-3 rounded-xl border border-border bg-card p-5 text-center sm:flex-row sm:text-left">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <GitBranch className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Connect to your Git repository</p>
                <p className="text-xs text-muted-foreground">Link your existing repo or let us create one for you.</p>
              </div>
              <Button size="sm" onClick={() => setGitOpen(true)} className="gap-2 shrink-0">
                <ExternalLink className="h-4 w-4" />
                Connect
              </Button>
            </div>

            {/* Tiles grid — rows 1 & 2: first 4 tiles */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {tiles.slice(0, 4).map((tile) => (
                <div
                  key={tile.title}
                  onClick={() => tile.available && tile.url && navigate(tile.url)}
                  className={`relative flex flex-col gap-4 rounded-xl border bg-gradient-to-br p-6 transition-all duration-200 ${tile.color} ${
                    tile.available
                      ? "cursor-pointer hover:scale-[1.02] hover:shadow-lg"
                      : "opacity-60 cursor-not-allowed"
                  }`}
                >
                  {!tile.available && (
                    <span className="absolute top-3 right-3 text-[10px] font-semibold uppercase tracking-widest bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                      Coming Soon
                    </span>
                  )}
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-background/50 ${tile.iconColor}`}>
                    <tile.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">{tile.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{tile.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Row 3: Data Disposition centered */}
            <div className="mt-6 flex justify-center">
              {(() => { const t = tiles[4]; const Icon = t.icon; return (
              <div
                onClick={() => t.available && t.url && navigate(t.url!)}
                className={`relative flex flex-col gap-4 rounded-xl border bg-gradient-to-br p-6 transition-all duration-200 w-full sm:w-[calc(50%-12px)] ${t.color} cursor-pointer hover:scale-[1.02] hover:shadow-lg`}
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-background/50 ${t.iconColor}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">{t.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{t.description}</p>
                </div>
              </div>
              ); })()}
            </div>
          </main>

        </div>
      </div>

      {/* Git dialog */}
      <Dialog open={gitOpen} onOpenChange={setGitOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect Git Repository</DialogTitle>
            <DialogDescription>
              Enter your repository URL or let us set one up for you.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            <Input
              placeholder="https://github.com/your-org/your-repo.git"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="flex-1" onClick={() => setGitOpen(false)}>
                Connect Repository
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setGitOpen(false)}>
                Don't have one? Use ours
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
};

export default Index;
