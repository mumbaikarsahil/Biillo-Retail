import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Link } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "@/lib/supabase"; 
import { 
  PlusCircle, 
  ShoppingCart, 
  BarChart3, 
  Boxes, 
  BookUser, 
  Settings, 
  TrendingUp,
  AlertCircle,
  ShieldAlert,
  ChevronRight
} from "lucide-react";

// IMPORTANT: Match this exactly with the email you used in SuperAdmin.tsx
const SUPER_ADMIN_EMAIL = "mumbaikarsahill@gmail.com";

const Index = () => {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [userRole, setUserRole] = useState<string>("sales"); // Default to lowest privilege
  const [userName, setUserName] = useState<string>("User");
  const [isLoading, setIsLoading] = useState(true);

  // Initialize User Profile & Roles
  useEffect(() => {
    const initializeUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          if (session.user.email === SUPER_ADMIN_EMAIL) {
            setIsSuperAdmin(true);
          }

          const { data: profile } = await supabase
            .from("profiles")
            .select("role, full_name")
            .eq("id", session.user.id)
            .single();

          if (profile) {
            setUserRole(profile.role?.toLowerCase() || "sales");
            setUserName(profile.full_name || "User");
          }
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    initializeUser();
  }, []);

  // Define standard menu options with explicit role requirements
  const baseMenuOptions = [
    { 
      href: "/billing", 
      label: "Start Billing", 
      icon: ShoppingCart, 
      description: "Point of Sale",
      allowedRoles: ["admin", "manager", "sales"],
      primary: true
    },
    { 
      href: "/inventory/add", 
      label: "Add Stock", 
      icon: PlusCircle, 
      description: "Inward new items",
      allowedRoles: ["admin", "manager"] 
    },
    { 
      href: "/udhaar", 
      label: "Udhaar Book", 
      icon: BookUser, 
      description: "Manage credit",
      allowedRoles: ["admin", "manager"]
    },
    { 
      href: "/sales", 
      label: "Sales History", 
      icon: TrendingUp, 
      description: "Past transactions",
      allowedRoles: ["admin", "manager"]
    },
    { 
      href: "/manage", 
      label: "Manage Stock", 
      icon: Boxes, 
      description: "Edit & print barcodes",
      allowedRoles: ["admin", "manager"]
    },
    { 
      href: "/analytics", 
      label: "Analytics", 
      icon: BarChart3, 
      description: "Performance metrics",
      allowedRoles: ["admin", "manager"]
    },
    { 
      href: "/settings", 
      label: "Settings", 
      icon: Settings, 
      description: "Hardware & app config",
      allowedRoles: ["admin", "manager"]
    },
  ];

  // Filter menu based on user role
  let visibleMenu = baseMenuOptions.filter(option => option.allowedRoles.includes(userRole));

  // Inject God Mode if Super Admin
  if (isSuperAdmin) {
    visibleMenu.push({
      href: "/super-admin-secret",
      label: "God Mode",
      icon: ShieldAlert,
      description: "Provision Clients",
      allowedRoles: ["admin"],
      primary: false
    });
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="h-screen flex items-center justify-center">
          <p className="text-zinc-400 font-medium text-sm">Loading workspace...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 pb-24 lg:pb-8 px-2 sm:px-4 max-w-6xl mx-auto pt-2 lg:pt-6 animate-in fade-in duration-300">
        
        {/* Vercel-style Header */}
        <div className="flex flex-col space-y-1.5 mb-8 border-b border-zinc-200 pb-6">
          <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight text-zinc-900">
            Welcome back, {userName.split(' ')[0]}
          </h1>
          <p className="text-sm font-medium text-zinc-500">
            Select an action below to manage your store operations.
          </p>
        </div>

        {/* Connection Status */}
        {!isSupabaseConfigured && (
          <Alert variant="destructive" className="py-3 border-red-200 bg-red-50 text-red-900 rounded-md">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="text-sm font-semibold ml-2">Database Disconnected</AlertTitle>
            <AlertDescription className="text-xs ml-2 font-medium">
              Please configure your Supabase URL and Anon Key in the environment variables.
            </AlertDescription>
          </Alert>
        )}

        {/* LINEAR/VERCEL STYLE GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {visibleMenu.map((option, index) => {
            const isGodMode = option.label === "God Mode";
            
            return (
              <Link key={index} to={option.href} className="group outline-none">
                <Card className={`h-full transition-all duration-200 border rounded-lg shadow-sm 
                  ${isGodMode 
                    ? 'bg-red-50/30 border-red-200 hover:border-red-300 hover:bg-red-50/50' 
                    : 'bg-white border-zinc-200 hover:border-zinc-300 hover:shadow-md'
                  }
                  ${option.primary ? 'ring-1 ring-zinc-900/5' : ''}
                `}>
                  <CardContent className="flex flex-col items-start p-5 h-full relative overflow-hidden">
                    
                    {/* Top Row: Icon & Arrow */}
                    <div className="flex items-center justify-between w-full mb-4">
                      <div className={`h-10 w-10 rounded-md flex items-center justify-center border 
                        ${isGodMode 
                          ? 'bg-red-100 border-red-200 text-red-600' 
                          : option.primary 
                            ? 'bg-zinc-900 border-zinc-900 text-white' 
                            : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                        }
                      `}>
                        <option.icon className="h-5 w-5" />
                      </div>
                      
                      <ChevronRight className={`h-4 w-4 transition-transform duration-200 group-hover:translate-x-1 
                        ${isGodMode ? 'text-red-300' : 'text-zinc-300 group-hover:text-zinc-600'}
                      `} />
                    </div>
                    
                    {/* Text Content */}
                    <div className="mt-auto w-full">
                      <h3 className={`font-semibold text-base tracking-tight mb-1
                        ${isGodMode ? 'text-red-700' : 'text-zinc-900'}
                      `}>
                        {option.label}
                      </h3>
                      <p className={`text-xs font-medium
                        ${isGodMode ? 'text-red-500/80' : 'text-zinc-500'}
                      `}>
                        {option.description}
                      </p>
                    </div>

                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

        {/* Minimal Info Section */}
        {userRole !== 'sales' && (
          <div className="mt-8 bg-zinc-50 rounded-lg p-5 border border-zinc-200">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3">Quick Tips</h4>
            <div className="grid sm:grid-cols-3 gap-4 text-sm font-medium text-zinc-600">
              <p>• Use <strong className="text-zinc-900">Add Stock</strong> when receiving new shipments from suppliers.</p>
              <p>• <strong className="text-zinc-900">Manage Stock</strong> allows you to quickly adjust quantities and print barcodes.</p>
              <p>• Check <strong className="text-zinc-900">Analytics</strong> daily to monitor store performance and pending udhaar.</p>
            </div>
          </div>
        )}

      </div>
    </AppLayout>
  );
};

export default Index;