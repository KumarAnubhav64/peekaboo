import { Navigate } from "react-router-dom";
import { CircleNotch } from "@phosphor-icons/react";
import { useAuth } from "@/auth";
import AuthPage from "@/components/AuthPage";

export default function Gate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-full min-h-screen items-center justify-center">
        <CircleNotch className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) return <AuthPage />;
  return <Navigate to="/photos" replace />;
}
