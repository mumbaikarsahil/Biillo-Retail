import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export const ProtectedRoute = ({ 
  children, 
  allowedRoles 
}: { 
  children: JSX.Element; 
  allowedRoles: string[]; 
}) => {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setAuthorized(false);
      } else {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .single();

        // Convert roles to lowercase to prevent accidental mismatches (e.g., 'Admin' vs 'admin')
        if (profile && allowedRoles.map(r => r.toLowerCase()).includes(profile.role.toLowerCase())) {
          setAuthorized(true);
        } else {
          setAuthorized(false);
        }
      }
      setLoading(false);
    };

    checkAccess();
  }, [allowedRoles]);

  if (loading) return <div className="h-screen flex items-center justify-center text-zinc-500">Verifying access...</div>;
  
  if (!authorized) {
    // Kicks unauthorized users back to the dashboard (or login if completely unauthenticated)
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return children;
};