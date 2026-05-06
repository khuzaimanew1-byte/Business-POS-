import { useLocation } from "wouter";
import { AlertCircle, ArrowLeft } from "lucide-react";
import NebulaBackground from "@/components/NebulaBackground";

export default function NotFound() {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-screen w-full bg-background text-foreground flex items-center justify-center">
      <NebulaBackground />
      <div className="relative z-[2] flex flex-col items-center text-center px-6">
        <div className="w-14 h-14 rounded-2xl bg-danger/10 border border-danger/25 flex items-center justify-center mb-5">
          <AlertCircle className="w-7 h-7 text-danger" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground mb-1">404</h1>
        <p className="text-base font-medium text-muted-foreground mb-1">Page not found</p>
        <p className="text-sm text-muted-foreground/70 max-w-[260px] mb-7">
          Did you forget to add the page to the router?
        </p>
        <button
          onClick={() => setLocation("/")}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <ArrowLeft size={15} />
          Back to POS
        </button>
      </div>
    </div>
  );
}
