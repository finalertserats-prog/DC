import React from "react";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/context/ToastContext";

// Pages
import Index from "./pages/Index";
// @ts-ignore
import Login from "./pages/Login";
// @ts-ignore
import Signup from "./pages/Signup";
// @ts-ignore
import About from "./pages/About";
// @ts-ignore
import Home from "./pages/Home";
// @ts-ignore
import Connections from "./pages/Connections";
// @ts-ignore
import Explore from "./pages/Explore";
// @ts-ignore
import Audit from "./pages/Audit";
// @ts-ignore
import AdminUsers from "./pages/AdminUsers";
import DataViz from "./pages/DataViz";
import DataMigration from "./pages/DataMigration";
import DataProfiler from "./pages/DataProfiler";
import DataDisposition from "./pages/DataDisposition";
// @ts-ignore
import Sidebar from "./components/Sidebar";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = localStorage.getItem("user");
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const rawUser = localStorage.getItem("user");
  if (!rawUser) return <Navigate to="/login" replace />;
  try {
    const user = JSON.parse(rawUser);
    if (user.role !== "admin") return <Navigate to="/" replace />;
  } catch {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-background font-sans text-foreground">
      <Sidebar />
      <main className="flex-1 overflow-hidden bg-background flex flex-col">
        {children}
      </main>
    </div>
  );
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ToastProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/about" element={<About />} />

            {/* Landing — 4 tiles, no sidebar */}
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />

            {/* Data Profiler routes — old sidebar */}
            <Route path="/home" element={<ProtectedRoute><AppLayout><Home /></AppLayout></ProtectedRoute>} />
            <Route path="/connections" element={<ProtectedRoute><AppLayout><Connections /></AppLayout></ProtectedRoute>} />
            <Route path="/explore" element={<ProtectedRoute><AppLayout><Explore /></AppLayout></ProtectedRoute>} />
            <Route path="/audit" element={<ProtectedRoute><AppLayout><Audit /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/users" element={<AdminRoute><AppLayout><AdminUsers /></AppLayout></AdminRoute>} />

            {/* Data Viz — embedded superset dashboard builder */}
            <Route path="/dataviz" element={<ProtectedRoute><DataViz /></ProtectedRoute>} />

            {/* Data Migration — embedded ETL Pipeline Studio */}
            <Route path="/data-migration" element={<ProtectedRoute><DataMigration /></ProtectedRoute>} />

            {/* Data Profiler — embedded SDP Metadata Platform */}
            <Route path="/data-profiler" element={<ProtectedRoute><DataProfiler /></ProtectedRoute>} />

            {/* Data Disposition — embedded NLP-SQL app */}
            <Route path="/datadisposition" element={<ProtectedRoute><DataDisposition /></ProtectedRoute>} />

            <Route path="/datawizz" element={<Navigate to="/dataviz" replace />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;
