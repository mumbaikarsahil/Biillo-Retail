"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { BluetoothSerial } from "@awesome-cordova-plugins/bluetooth-serial";
import { Capacitor } from "@capacitor/core";
import { 
  Printer, 
  RefreshCw, 
  Bluetooth, 
  Check, 
  Monitor, 
  Laptop, 
  LogOut, 
  User as UserIcon,
  Building2,
  Settings2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AndroidPermissions } from "@awesome-cordova-plugins/android-permissions";
import { Toast } from '@capacitor/toast';
import { supabase } from "@/lib/supabase"; 

export default function SettingsPage() {
  const navigate = useNavigate();
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<any>(null);
  const [winPrinters, setWinPrinters] = useState<any[]>([]);
  const [isMobile, setIsMobile] = useState(false);

  const [profile, setProfile] = useState<{ email: string; full_name: string; role: string } | null>(null);
  const [storeName, setStoreName] = useState<string>("Loading...");

  const { toast: webToast } = useToast();
  
  const showToast = async (props: { title: string; description?: string; variant?: "default" | "destructive"; duration?: number; className?: string }) => {
    if (Capacitor.isNativePlatform()) {
      await Toast.show({
        text: `${props.title}${props.description ? `\n${props.description}` : ''}`,
        duration: 'short',
        position: 'bottom', 
      });
    } else {
      webToast({ ...props, className: props.className || "py-2 px-4 min-h-0" });
    }
  };
  const toast = showToast;

  useEffect(() => {
    const native = Capacitor.isNativePlatform();
    setIsMobile(native);

    if (native) {
      checkMobileConnection();
    } else {
      loadWindowsPrinters();
      const savedWinPrinter = localStorage.getItem("windows_printer_name");
      if (savedWinPrinter) {
        setConnectedDevice({ name: savedWinPrinter, type: 'windows' });
      }
    }

    loadUserProfile();
  }, []);

  const loadUserProfile = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name, role")
        .eq("id", session.user.id)
        .single();

      const { data: tenantData } = await supabase
        .from("tenants")
        .select("tenant_name")
        .single();

      setProfile({
        email: session.user.email || "",
        full_name: profileData?.full_name || "",
        role: profileData?.role || "Admin",
      });

      if (tenantData) setStoreName(tenantData.tenant_name);

    } catch (error) {
      console.error("Error loading profile:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast({ title: "Logged out successfully" });
      navigate("/"); 
    } catch (error: any) {
      toast({ title: "Error logging out", description: error.message, variant: "destructive" });
    }
  };

  const checkMobileConnection = async () => {
    try {
      const isConnected = await BluetoothSerial.isConnected().catch(() => false);
      if (isConnected) {
        const savedName = localStorage.getItem("printer_name");
        setConnectedDevice({ name: savedName || "Unknown Bluetooth Printer", type: 'bluetooth' });
      }
    } catch (e) { console.log("Not connected"); }
  };

  const scanBluetoothDevices = async () => {
    if (!isMobile) return;
    setIsScanning(true);
    setDevices([]);
    try {
      await AndroidPermissions.requestPermissions([
        "android.permission.BLUETOOTH_SCAN",
        "android.permission.BLUETOOTH_CONNECT",
        "android.permission.ACCESS_FINE_LOCATION"
      ]);
      await BluetoothSerial.enable();
      const paired = await BluetoothSerial.list();
      setDevices(paired);
      if (paired.length === 0) toast({ title: "No Devices", description: "Pair in Android Settings first." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Scan Failed", description: "Check Permissions" });
    } finally {
      setIsScanning(false);
    }
  };

  const connectBluetooth = async (device: any) => {
    toast({ title: "Connecting..." });
    try {
      try { await BluetoothSerial.disconnect(); } catch(e) {}
      await new Promise((resolve, reject) => {
        BluetoothSerial.connect(device.address).subscribe(resolve, reject);
      });
      setConnectedDevice({ ...device, type: 'bluetooth' });
      localStorage.setItem("printer_mac", device.address);
      localStorage.setItem("printer_name", device.name);
      toast({ title: "Connected", description: "Bluetooth Printer Ready" });
    } catch (error) {
      toast({ variant: "destructive", title: "Failed", description: "Is printer ON?" });
    }
  };

  const loadWindowsPrinters = async () => {
    if ((window as any).electronAPI) {
      try {
        const printers = await (window as any).electronAPI.getPrinters();
        setWinPrinters(printers);
      } catch (e) {
        console.error("Failed to load printers", e);
      }
    }
  };

  const selectWindowsPrinter = (printerName: string) => {
    localStorage.setItem("windows_printer_name", printerName);
    setConnectedDevice({ name: printerName, type: 'windows' });
    toast({ title: "Printer Selected", description: printerName });
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6 sm:space-y-8 animate-fade-in font-sans pb-24 md:pb-8">
        
        {/* --- HEADER --- */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900">Settings</h1>
            <p className="text-muted-foreground mt-0.5 text-sm font-medium">Account preferences and hardware configuration</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* --- LEFT COLUMN: Profile & Preferences --- */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* User Profile Card */}
            <Card className="shadow-[0_1px_3px_rgba(0,0,0,0.02)] border border-zinc-200/80 bg-white rounded-2xl">
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-start justify-between gap-5">
                  <div className="flex items-center gap-4">
                    <div className="h-14 w-14 rounded-full border border-zinc-200/80 bg-zinc-50 flex items-center justify-center text-xl font-semibold text-zinc-700 shadow-sm shrink-0">
                      {profile?.full_name?.charAt(0).toUpperCase() || profile?.email?.charAt(0).toUpperCase() || <UserIcon size={24} />}
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-zinc-900 tracking-tight leading-tight">
                        {profile?.full_name || "Store Admin"}
                      </h2>
                      <p className="text-xs text-zinc-500 font-medium mt-0.5">{profile?.email}</p>
                      
                      <div className="flex flex-wrap items-center gap-2 mt-2.5">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-zinc-100 text-zinc-600 border border-zinc-200/80 uppercase">
                          <Building2 className="h-3 w-3" /> {storeName}
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-zinc-100 text-zinc-600 border border-zinc-200/80 uppercase">
                          {profile?.role || 'ADMIN'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Button 
                    variant="outline" 
                    onClick={handleLogout} 
                    className="h-10 rounded-xl w-full sm:w-auto lg:w-full border-zinc-200/80 text-rose-600 hover:bg-rose-50 hover:text-rose-700 font-semibold shadow-sm"
                  >
                    <LogOut className="h-4 w-4 mr-2" /> Log Out Session
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Application Preferences Card */}
            <Card className="shadow-[0_1px_3px_rgba(0,0,0,0.02)] border border-zinc-200/80 bg-white rounded-2xl">
               <CardHeader className="pb-4 pt-5 px-5">
                 <CardTitle className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                   <Settings2 className="h-4 w-4" /> Application Preferences
                 </CardTitle>
               </CardHeader>
               <CardContent className="px-5 pb-5 space-y-4">
                 <div className="flex items-center justify-between">
                   <Label className="font-semibold text-sm text-zinc-700">Play Beep on Barcode Scan</Label>
                   <Switch defaultChecked className="data-[state=checked]:bg-zinc-900" />
                 </div>
               </CardContent>
            </Card>

          </div>

          {/* --- RIGHT COLUMN: Hardware / Printers --- */}
          <div className="lg:col-span-2 space-y-6">
            
            {isMobile ? (
              <Card className="shadow-[0_1px_3px_rgba(0,0,0,0.02)] border border-zinc-200/80 bg-white rounded-2xl h-full">
                <CardHeader className="pb-4 pt-5 px-5 sm:px-6">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                      <Bluetooth className="h-4 w-4" /> Bluetooth Thermal Printer
                    </CardTitle>
                    <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs font-semibold border-zinc-200/80 shadow-sm" onClick={scanBluetoothDevices} disabled={isScanning}>
                      <RefreshCw className={`h-3 w-3 mr-1.5 ${isScanning ? 'animate-spin' : ''}`} />
                      {isScanning ? 'Scanning...' : 'Scan Devices'}
                    </Button>
                  </div>
                </CardHeader>
                
                <CardContent className="px-5 sm:px-6 pb-6 space-y-6">
                  
                  {/* Connected Device Status Bar */}
                  <div className="p-4 rounded-xl border border-zinc-200/80 bg-zinc-50/50 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-white shadow-sm border border-zinc-200/80 rounded-full flex items-center justify-center shrink-0">
                        <Printer className="h-4 w-4 text-zinc-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-zinc-900">
                          {connectedDevice?.type === 'bluetooth' ? connectedDevice.name : "No Printer Connected"}
                        </p>
                        <p className="text-xs text-zinc-500 font-medium mt-0.5">Active hardware output</p>
                      </div>
                    </div>
                    {connectedDevice?.type === 'bluetooth' && (
                      <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)] mr-1" />
                    )}
                  </div>

                  <div className="space-y-3">
                    <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Available Paired Devices</Label>
                    
                    {devices.length === 0 ? (
                       <div className="text-center py-8 text-xs text-zinc-400 font-medium border border-dashed border-zinc-200/80 rounded-xl bg-zinc-50/50">
                         No devices found. Ensure printer is paired in Android Settings.
                       </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {devices.map((device, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3.5 border border-zinc-200/80 rounded-xl bg-white hover:bg-zinc-50 transition-colors shadow-sm">
                            <span className="text-sm font-semibold text-zinc-700 truncate pr-2">{device.name}</span>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-8 rounded-lg text-xs font-semibold bg-white border-zinc-200/80 hover:bg-zinc-100 hover:text-zinc-900 shrink-0" 
                              onClick={() => connectBluetooth(device)}
                            >
                              Connect
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </CardContent>
              </Card>

            ) : (

              /* Desktop / Electron Printer View */
              <Card className="shadow-[0_1px_3px_rgba(0,0,0,0.02)] border border-zinc-200/80 bg-white rounded-2xl h-full">
                <CardHeader className="pb-4 pt-5 px-5 sm:px-6">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                      <Monitor className="h-4 w-4" /> System Native Printers
                    </CardTitle>
                    <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs font-semibold border-zinc-200/80 shadow-sm" onClick={loadWindowsPrinters}>
                      <RefreshCw className="h-3 w-3 mr-1.5" /> Refresh List
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="px-5 sm:px-6 pb-6 space-y-6">
                  
                  {/* Connected Device Status Bar */}
                  <div className="p-4 rounded-xl border border-zinc-200/80 bg-zinc-50/50 flex items-center justify-between shadow-sm">
                     <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-white shadow-sm border border-zinc-200/80 rounded-full flex items-center justify-center shrink-0">
                           <Laptop className="h-4 w-4 text-zinc-600" />
                        </div>
                        <div>
                           <p className="font-semibold text-sm text-zinc-900">
                             {connectedDevice?.type === 'windows' ? connectedDevice.name : "Default System Print Dialog"}
                           </p>
                           <p className="text-xs text-zinc-500 font-medium mt-0.5">Select a printer below for silent background printing</p>
                        </div>
                     </div>
                     {connectedDevice?.type === 'windows' && (
                       <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)] mr-1" />
                     )}
                  </div>

                  <div className="space-y-3">
                    <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Available OS Printers</Label>
                    
                    <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
                      {winPrinters.length === 0 && (
                         <div className="text-center py-10 text-sm font-medium text-zinc-400 border border-dashed border-zinc-200/80 rounded-xl bg-zinc-50/50 flex flex-col items-center gap-2">
                           <Monitor className="h-6 w-6 text-zinc-300" />
                           {(window as any).electronAPI ? "Click Refresh to load system printers." : "Running in Web Mode: Uses standard browser print dialog."}
                         </div>
                      )}
                      
                      {winPrinters.map((p: any) => (
                        <div key={p.name} className="flex items-center justify-between p-3.5 border border-zinc-200/80 rounded-xl bg-white hover:border-zinc-300 transition-colors shadow-sm">
                          <div className="flex flex-col min-w-0 pr-4">
                            <span className="font-semibold text-sm text-zinc-800 truncate leading-tight">{p.name}</span>
                            {p.isDefault && (
                              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mt-1">System Default</span>
                            )}
                          </div>
                          
                          {connectedDevice?.name === p.name ? (
                             <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-zinc-900 text-white shadow-sm shrink-0">
                               <Check className="h-3.5 w-3.5" /> Active
                             </span>
                          ) : (
                             <Button 
                               size="sm" 
                               variant="outline" 
                               className="h-8 rounded-lg text-xs font-semibold bg-white border-zinc-200/80 hover:bg-zinc-100 hover:text-zinc-900 shrink-0" 
                               onClick={() => selectWindowsPrinter(p.name)}
                              >
                                Select
                             </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                </CardContent>
              </Card>
            )}
          </div>

        </div>
      </div>
    </AppLayout>
  );
}