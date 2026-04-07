import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const DataMigration = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Back bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card shrink-0">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Data Commander
        </button>
      </div>

      {/* Full-height iframe */}
      <iframe
        src="http://localhost:3000"
        title="ETL Pipeline Studio"
        className="flex-1 w-full border-none"
        allow="same-origin"
      />
    </div>
  );
};

export default DataMigration;
