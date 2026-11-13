import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../services/auth";

export default function ProtectedRoute() {
  const { token, ready } = useAuth();
  if (!ready) return <div className="full-screen-wait">Opening your lens…</div>;
  return token ? <Outlet /> : <Navigate to="/login" replace />;
}
