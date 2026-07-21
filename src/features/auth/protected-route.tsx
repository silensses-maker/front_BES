import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/entities/user";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const loading = useAuthStore((state) => state.loading);

  if (loading) return null;

  if (!user) return <Navigate to="/" replace />;

  return children;
}
