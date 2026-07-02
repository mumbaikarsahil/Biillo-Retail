import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { 
  Package, 
  ShoppingCart, 
  BarChart3, 
  Plus, 
  BookUser, 
  Settings, 
  FileText,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MobileNav } from "./MobileNav"; 

const navItems = [
  { href: "/", label: "Dashboard", icon: BarChart3 },
  { href: "/inventory/add", label: "Add Stock", icon: Plus },
  { href: "/billing", label: "Billing", icon: ShoppingCart },
  { href: "/analytics", label: "Analytics", icon: Package },
  { href: "/manage", label: "Manage", icon: Package },
  { href: "/udhaar", label: "Udhaar", icon: BookUser }, 
  { href: "/sales", label: "Sales", icon: FileText },   
  { href: "/settings", label: "Settings", icon: Settings }, 
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      
      {/* --- DESKTOP SIDEBAR --- */}
      <aside 
        className={cn(
          "hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:flex-col transition-all duration-300 ease-in-out border-r border-border bg-card",
          isCollapsed ? "lg:w-20" : "lg:w-64"
        )}
      >
        <div className="flex grow flex-col gap-y-5 overflow-y-auto px-4 pb-4">
          
          {/* Header / Logo */}
          <div className={cn(
            "flex h-16 shrink-0 items-center transition-all duration-300",
            isCollapsed ? "justify-center" : "gap-3 px-2"
          )}>
            <img src="/logo.png" alt="Logo" className="h-8 w-8 shrink-0 object-contain" />
            {!isCollapsed && (
              <span className="text-xl font-bold text-foreground tracking-tight whitespace-nowrap overflow-hidden">
                Biillo Retail
              </span>
            )}
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-1 flex-col">
            <ul className="flex flex-1 flex-col gap-y-2">
              {navItems.map((item) => {
                const isActive = location.pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      to={item.href}
                      title={isCollapsed ? item.label : undefined} // Native tooltip when collapsed
                      className={cn(
                        "group flex items-center rounded-lg transition-all duration-200",
                        isCollapsed ? "justify-center p-3" : "gap-x-3 p-3",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <item.icon className={cn(
                        "shrink-0 transition-transform duration-200", 
                        isCollapsed ? "h-6 w-6 group-hover:scale-110" : "h-5 w-5"
                      )} />
                      {!isCollapsed && (
                        <span className="text-sm font-medium whitespace-nowrap">
                          {item.label}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>

            {/* Collapse Toggle Button anchored to bottom */}
            <div className="mt-auto pt-4 border-t border-border/50">
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className={cn(
                  "flex h-10 w-full items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
                  isCollapsed ? "justify-center" : "justify-end px-3"
                )}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-5 w-5" />
                ) : (
                  <ChevronLeft className="h-5 w-5" />
                )}
              </button>
            </div>
          </nav>
        </div>
      </aside>

      {/* --- MAIN CONTENT --- */}
      <main 
        className={cn(
          "pb-24 lg:pb-0 transition-all duration-300 ease-in-out",
          isCollapsed ? "lg:pl-20" : "lg:pl-64"
        )}
      >
        {/* Minimal Mobile Brand Header */}
        <div className="lg:hidden flex items-center gap-2 px-4 py-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
           <img src="/logo.png" alt="Logo" className="h-6 w-6 object-contain" />
           <span className="font-bold text-lg">Biillo Retail</span>
        </div>

        <div className="px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>

      {/* --- MOBILE BOTTOM NAV --- */}
      <MobileNav />

    </div>
  );
}