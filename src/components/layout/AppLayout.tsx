import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { 
  Package, 
  ShoppingCart, 
  BarChart3, 
  Plus, 
  BookUser, 
  Settings, 
  FileText,
  ChevronLeft,
  ChevronRight,
  ArrowLeft
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
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Check if the user is on the root dashboard to hide the back button
  const isRootPage = location.pathname === "/" || location.pathname === "/dashboard";

  return (
    <div className="min-h-screen bg-zinc-50/30">
      
      {/* --- DESKTOP SIDEBAR --- */}
      <aside 
        className={cn(
          "hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:flex-col transition-all duration-300 ease-in-out border-r border-zinc-200/80 bg-white",
          isCollapsed ? "lg:w-20" : "lg:w-64"
        )}
      >
        <div className="flex grow flex-col gap-y-5 overflow-y-auto px-4 pb-4 hidden-scrollbar">
          
          {/* Header / Logo */}
          <div className={cn(
            "flex h-16 shrink-0 items-center transition-all duration-300",
            isCollapsed ? "justify-center" : "gap-3 px-2"
          )}>
            <img src="/logo.png" alt="Logo" className="h-8 w-8 shrink-0 object-contain" />
            {!isCollapsed && (
              <span className="text-xl font-bold text-zinc-900 tracking-tight whitespace-nowrap overflow-hidden">
                Biillo Retail
              </span>
            )}
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-1 flex-col">
            <ul className="flex flex-1 flex-col gap-y-1.5">
              {navItems.map((item) => {
                const isActive = location.pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      to={item.href}
                      title={isCollapsed ? item.label : undefined}
                      className={cn(
                        "group flex items-center rounded-lg transition-all duration-200 font-medium",
                        isCollapsed ? "justify-center p-3" : "gap-x-3 px-3 py-2.5",
                        isActive
                          ? "bg-zinc-900 text-white shadow-sm"
                          : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                      )}
                    >
                      <item.icon className={cn(
                        "shrink-0 transition-transform duration-200", 
                        isCollapsed ? "h-5 w-5 group-hover:scale-110" : "h-4 w-4",
                        isActive && !isCollapsed ? "text-white" : ""
                      )} />
                      {!isCollapsed && (
                        <span className="text-[13px] whitespace-nowrap tracking-wide">
                          {item.label}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>

            {/* Collapse Toggle Button anchored to bottom */}
            <div className="mt-auto pt-4 border-t border-zinc-100">
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className={cn(
                  "flex h-10 w-full items-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 transition-colors",
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
          "pb-24 lg:pb-0 transition-all duration-300 ease-in-out min-h-screen flex flex-col",
          isCollapsed ? "lg:pl-20" : "lg:pl-64"
        )}
      >
        {/* NATIVE ANDROID APP STYLE HEADER */}
        <div className="lg:hidden flex items-center h-14 px-4 border-b border-zinc-200/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 sticky top-0 z-40 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
           {!isRootPage && (
             <button 
               onClick={() => navigate(-1)} 
               className="mr-2 p-2 -ml-2 rounded-full active:bg-zinc-100 transition-colors text-zinc-700 outline-none tap-highlight-transparent"
               aria-label="Go back"
             >
               <ArrowLeft className="h-5 w-5" />
             </button>
           )}
           <img src="/logo.png" alt="Logo" className={cn("h-6 w-6 object-contain mr-2.5", isRootPage && "ml-1")} />
           <span className="font-semibold text-[17px] tracking-tight text-zinc-900">Biillo Retail</span>
        </div>

        {/* RESTORED PADDING HERE: px-4 (sides) and py-6 (top/bottom) */}
        <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8 w-full">
          {children}
        </div>
      </main>

      {/* --- MOBILE BOTTOM NAV --- */}
      <MobileNav />

    </div>
  );
}