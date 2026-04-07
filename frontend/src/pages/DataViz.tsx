import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useRef, useEffect, useCallback } from "react";

const TYPE_MAP: Record<string, string> = {
  starrocks: "mysql",
  hive: "postgresql",
  mysql: "mysql",
  postgres: "postgresql",
  postgresql: "postgresql",
  mongodb: "mongodb",
};

const DataViz = () => {
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const pendingConfig = useRef<object | null>(null);

  const sendConfigToIframe = useCallback((config: object) => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "DC_DB_CONFIG", dbConfig: config },
      "http://localhost:5174"
    );
  }, []);

  useEffect(() => {
    fetch("/api/connections/fetch", { method: "POST", credentials: "include" })
      .then((r) => r.json())
      .then((connections: any[]) => {
        const active = connections.find((c) => c.type !== "airflow");
        if (!active) return;
        const config = {
          type: TYPE_MAP[active.type] ?? "postgresql",
          host: active.host ?? "localhost",
          port: Number(active.port) || 5432,
          database: "",
          username: active.username ?? "",
          password: "",
        };
        pendingConfig.current = config;
        // If iframe already loaded, send immediately
        if (iframeRef.current?.contentWindow) {
          sendConfigToIframe(config);
        }
      })
      .catch(() => {});
  }, [sendConfigToIframe]);

  const handleIframeLoad = () => {
    if (pendingConfig.current) {
      sendConfigToIframe(pendingConfig.current);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card shrink-0">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Data Commander
        </button>
      </div>
      <iframe
        ref={iframeRef}
        src="http://localhost:5174"
        title="Data Viz"
        className="flex-1 w-full border-none"
        onLoad={handleIframeLoad}
        allow="same-origin"
      />
    </div>
  );
};

export default DataViz;
