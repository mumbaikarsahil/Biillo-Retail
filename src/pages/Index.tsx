import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Link } from "react-router-dom";
import { isSupabaseConfigured } from "@/lib/supabase";
import { 
  LayoutDashboard, 
  PlusCircle, 
  ShoppingCart, 
  BarChart3, 
  Boxes, 
  BookUser, 
  Settings, 
  TrendingUp,
  AlertCircle
} from "lucide-react";

const Index = () => {
  
  // Define all menu options in one array for cleaner rendering
  const menuOptions = [
    { 
      href: "/billing", 
      label: "Start Billing", 
      icon: ShoppingCart, 
      color: "text-primary",
      bg: "bg-primary/10",
      description: "New Sale"
    },
    { 
      href: "/inventory/add", 
      label: "Add Stock", 
      icon: PlusCircle, 
      color: "text-green-600",
      bg: "bg-green-100 dark:bg-green-900/20",
      description: "New Items" 
    },
    { 
      href: "/udhaar", 
      label: "Udhaar", 
      icon: BookUser, 
      color: "text-orange-600",
      bg: "bg-orange-100 dark:bg-orange-900/20",
      description: "Credit Book"
    },
    { 
      href: "/sales", 
      label: "Sales History", 
      icon: TrendingUp, 
      color: "text-blue-600",
      bg: "bg-blue-100 dark:bg-blue-900/20",
      description: "Transactions"
    },
    { 
      href: "/manage", 
      label: "Manage Stock", 
      icon: Boxes, 
      color: "text-purple-600",
      bg: "bg-purple-100 dark:bg-purple-900/20",
      description: "Edit Items"
    },
    { 
      href: "/analytics", 
      label: "Analytics", 
      icon: BarChart3, 
      color: "text-pink-600",
      bg: "bg-pink-100 dark:bg-pink-900/20",
      description: "Reports"
    },
    { 
      href: "/settings", 
      label: "Settings", 
      icon: Settings, 
      color: "text-slate-600",
      bg: "bg-slate-100 dark:bg-slate-800",
      description: "App Config"
    },
    { 
      href: "/", 
      label: "Dashboard", 
      icon: LayoutDashboard, 
      color: "text-slate-600",
      bg: "bg-slate-100 dark:bg-slate-800",
      description: "Overview"
    },
  ];

  return (
    <AppLayout>
      <div className="space-y-6 pb-20"> {/* pb-20 adds space at bottom for scrolling */}
        
        {/* Compact Header */}
        <div className="flex flex-col space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Quick access to store operations</p>
        </div>

        {/* Connection Status - Compact */}
        {!isSupabaseConfigured && (
          <Alert variant="destructive" className="py-2">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="text-sm font-semibold ml-2">DB Disconnected</AlertTitle>
            <AlertDescription className="text-xs ml-2">
              Configure Supabase secrets.
            </AlertDescription>
          </Alert>
        )}

        {/* MOBILE OPTIMIZED GRID */}
        {/* grid-cols-2 makes it 2 items per row on mobile (easy to reach) */}
        {/* md:grid-cols-4 makes it 4 items per row on desktop */}
        <div className="grid grid-cols-2 gap-3 md:gap-4 md:grid-cols-4">
          {menuOptions.map((option, index) => (
            <Link key={index} to={option.href}>
              <Card className="h-full hover:shadow-md transition-all border-muted active:scale-95">
                <CardContent className="flex flex-col items-center justify-center p-4 text-center space-y-3 h-full">
                  
                  {/* Icon Circle */}
                  <div className={`p-3 rounded-full ${option.bg}`}>
                    <option.icon className={`h-6 w-6 ${option.color}`} />
                  </div>
                  
                  {/* Labels */}
                  <div>
                    <h3 className="font-semibold text-sm md:text-base leading-none">
                      {option.label}
                    </h3>
                    <p className="text-[10px] md:text-xs text-muted-foreground mt-1">
                      {option.description}
                    </p>
                  </div>

                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Info Section - Collapsed/Compact for Mobile */}
        <div className="bg-muted/20 rounded-lg p-4 border border-dashed text-xs text-muted-foreground">
          <p className="font-medium text-foreground mb-2">Did you know?</p>
          <ul className="list-disc list-inside space-y-1">
             <li>Tap <strong>Billing</strong> to start a new sale instantly.</li>
             <li>Use <strong>Udhaar</strong> to track customer credits.</li>
             <li>Check <strong>Analytics</strong> for daily sales reports.</li>
          </ul>
        </div>
      </div>
    </AppLayout>
  );
};

export default Index;