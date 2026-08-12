import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth";
import AuthPage from "@/components/AuthPage";
import { CircleNotch } from "@phosphor-icons/react";

export default function Gate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <CircleNotch className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) return <AuthPage />;
  return <Navigate to="/photos" replace />;
}
