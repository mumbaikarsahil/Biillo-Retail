import { useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner, toast as sonnerToast } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";

// Pages
import Index from "./pages/Index";
import AddInventory from "./pages/inventory/AddInventory";
import Billing from "./pages/billing/Billing";
import Analytics from "./pages/analytics/Analytics";
import Manage from "./pages/manage/Manage";
import NotFound from "./pages/NotFound";
import Udhaar from "./pages/udhaar/Udhaar";
import Sales from "./pages/sales/Sales";
import Settings from "./pages/settings/Settings";
import InvoiceView from "./pages/invoiceview/InvoiceView";

const queryClient = new QueryClient();

// This inner component handles the Capacitor Logic & Routing
const AppRoutes = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const lastBackPressTime = useRef(0);

  useEffect(() => {
    // 1. Configure Status Bar (Black Icons on White Background)
    const configureStatusBar = async () => {
      try {
        await StatusBar.setStyle({ style: Style.Light }); // 'Light' style = Dark Icons
        await StatusBar.setBackgroundColor({ color: '#FFFFFF' }); // White background
      } catch (err) {
        console.log("Status bar not available (web mode)");
      }
    };
    configureStatusBar();

    // 2. Handle Hardware Back Button
    const setupBackButton = async () => {
      const backListener = await CapacitorApp.addListener('backButton', ({ canGoBack }) => {
        // Current Path
        const currentPath = location.pathname;

        if (currentPath === "/") {
          // Logic: If on Dashboard, double press to exit
          const now = Date.now();
          if (now - lastBackPressTime.current < 2000) {
            // Pressed twice within 2 seconds -> Exit
            CapacitorApp.exitApp();
          } else {
            // First press -> Show Warning
            lastBackPressTime.current = now;
            sonnerToast("Press back again to exit", {
              position: "bottom-center",
              duration: 2000,
            });
          }
        } else {
          // Logic: If on any other page, go to Dashboard
          navigate("/");
        }
      });

      return backListener;
    };

    const listenerPromise = setupBackButton();

    // Cleanup listener on unmount
    return () => {
      listenerPromise.then(listener => listener.remove());
    };
  }, [location, navigate]);

  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/inventory/add" element={<AddInventory />} />
      <Route path="/billing" element={<Billing />} />
      <Route path="/analytics" element={<Analytics />} />
      <Route path="/manage" element={<Manage />} />
      <Route path="/udhaar" element={<Udhaar />} />
      <Route path="/sales" element={<Sales />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<NotFound />} />
      <Route path="/invoice/:id" element={<InvoiceView />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        {/* We moved Routes into AppRoutes to access navigation hooks */}
        <AppRoutes />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;