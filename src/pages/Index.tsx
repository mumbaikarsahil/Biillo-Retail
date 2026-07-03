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
  Lightbulb
} from "lucide-react";

// IMPORTANT: Match this exactly with the email you used in SuperAdmin.tsx
const SUPER_ADMIN_EMAIL = "mumbaikarsahill@gmail.com";

const Index = () => {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [userRole, setUserRole] = useState<string>("sales");
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

  // App Launcher Options
  const baseMenuOptions = [
    { 
      href: "/billing", 
      label: "POS Billing", 
      icon: ShoppingCart, 
      description: "Checkout & Sales",
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
      label: "Advance / Due", 
      icon: BookUser, 
      description: "Pending ledgers",
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
      description: "Edit & barcodes",
      allowedRoles: ["admin", "manager"]
    },
    { 
      href: "/analytics", 
      label: "Analytics", 
      icon: BarChart3, 
      description: "Store metrics",
      allowedRoles: ["admin", "manager"]
    },
    { 
      href: "/settings", 
      label: "Settings", 
      icon: Settings, 
      description: "App config",
      allowedRoles: ["admin", "manager"]
    },
  ];

  let visibleMenu = baseMenuOptions.filter(option => option.allowedRoles.includes(userRole));

  // Inject God Mode if Super Admin
  if (isSuperAdmin) {
    visibleMenu.push({
      href: "/super-admin-secret",
      label: "God Mode",
      icon: ShieldAlert,
      description: "Client config",
      allowedRoles: ["admin"],
      primary: false
    });
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-zinc-900 border-t-transparent" />
            <p className="text-zinc-500 font-medium text-sm">Loading workspace...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="pb-24 lg:pb-8 px-4 sm:px-6 max-w-5xl mx-auto pt-4 sm:pt-8 animate-in fade-in duration-300 font-sans">
        
        {/* --- HEADER --- */}
        <div className="flex flex-col space-y-1 mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900">
            Welcome back, {userName.split(' ')[0]}
          </h1>
          <p className="text-sm font-medium text-zinc-500">
            Select an app module to manage your store.
          </p>
        </div>

        {/* --- ALERTS --- */}
        {!isSupabaseConfigured && (
          <Alert variant="destructive" className="mb-6 py-3 border-rose-200/80 bg-rose-50/50 text-rose-900 rounded-xl shadow-sm">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="text-sm font-semibold ml-2">Database Disconnected</AlertTitle>
            <AlertDescription className="text-xs ml-2 font-medium mt-1 text-rose-700/80">
              Please configure your Supabase URL and Anon Key in the environment variables to sync data.
            </AlertDescription>
          </Alert>
        )}

        {/* --- NATIVE APP GRID (2 Columns on Mobile) --- */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {visibleMenu.map((option, index) => {
            const isGodMode = option.label === "God Mode";
            
            return (
              <Link key={index} to={option.href} className="group outline-none block">
                <Card className={`h-full aspect-square sm:aspect-auto sm:h-[140px] flex flex-col items-center justify-center text-center p-3 transition-all duration-200 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] active:scale-95 
                  ${isGodMode 
                    ? 'bg-rose-50/30 border-rose-200/80 hover:border-rose-300 hover:bg-rose-50/60' 
                    : 'bg-white border-zinc-200/80 hover:border-zinc-300 hover:shadow-md'
                  }
                `}>
                  
                  {/* Big App Icon Squircle */}
                  <div className={`h-12 w-12 sm:h-14 sm:w-14 rounded-2xl flex items-center justify-center mb-3 sm:mb-4 transition-transform group-hover:-translate-y-1 shadow-sm border
                    ${isGodMode 
                      ? 'bg-rose-100 border-rose-200/80 text-rose-600' 
                      : option.primary 
                        ? 'bg-zinc-900 border-zinc-900 text-white shadow-md' 
                        : 'bg-zinc-50 border-zinc-200/80 text-zinc-700'
                    }
                  `}>
                    <option.icon className="h-6 w-6 sm:h-7 sm:w-7" />
                  </div>
                  
                  {/* Labels */}
                  <div className="w-full px-1">
                    <h3 className={`font-semibold text-[13px] sm:text-sm tracking-tight leading-tight truncate mb-0.5
                      ${isGodMode ? 'text-rose-700' : 'text-zinc-900'}
                    `}>
                      {option.label}
                    </h3>
                    <p className={`text-[10px] sm:text-[11px] font-medium truncate
                      ${isGodMode ? 'text-rose-500/80' : 'text-zinc-500'}
                    `}>
                      {option.description}
                    </p>
                  </div>
                  
                </Card>
              </Link>
            );
          })}
        </div>

        {/* --- IOS-STYLE WIDGET (Quick Tips) --- */}
        {userRole !== 'sales' && (
          <div className="mt-8 bg-zinc-50 rounded-2xl p-5 sm:p-6 border border-zinc-200/80 shadow-sm flex flex-col sm:flex-row gap-4 sm:items-start">
            <div className="h-10 w-10 bg-white border border-zinc-200/80 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
              <Lightbulb className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-zinc-900 tracking-tight mb-2">Workflow Tips</h4>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-xs font-medium text-zinc-500">
                <p>• Use <strong className="text-zinc-800">Add Stock</strong> to register barcodes for new shipments.</p>
                <p>• Use <strong className="text-zinc-800">Advance / Due</strong> to track and settle partial payments.</p>
                <p>• <strong className="text-zinc-800">Manage Stock</strong> allows you to reprint labels instantly.</p>
                <p>• Monitor <strong className="text-zinc-800">Analytics</strong> to gauge store performance.</p>
              </div>
            </div>
          </div>
        )}

      </div>
    </AppLayout>
  );
};

export default Index;