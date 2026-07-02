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
  Building2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
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
      {/* Changed max-w-lg to max-w-5xl for a wider desktop container */}
      <div className="p-4 max-w-5xl mx-auto space-y-6 pb-20">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground text-sm">Account & Hardware Configuration</p>
        </div>

        {/* Responsive Grid: 1 Column on Mobile, 3 Columns on Desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* LEFT COLUMN: Profile & Preferences */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="border-0 shadow-md bg-white overflow-hidden rounded-2xl">
              <div className="h-24 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600"></div>
              
              <CardContent className="px-5 pb-5 pt-0 relative">
                <div className="flex justify-between items-end -mt-10 mb-4">
                  <div className="h-20 w-20 rounded-full border-4 border-white bg-slate-100 flex items-center justify-center text-3xl font-black text-slate-700 shadow-sm z-10">
                    {profile?.full_name?.charAt(0).toUpperCase() || profile?.email?.charAt(0).toUpperCase() || <UserIcon size={32} />}
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleLogout} 
                    className="rounded-full px-4 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 z-10 font-bold"
                  >
                    <LogOut className="h-4 w-4 mr-2" /> Log Out
                  </Button>
                </div>

                <div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                    {profile?.full_name || "Store Admin"}
                  </h2>
                  <p className="text-sm text-slate-500 font-medium">{profile?.email}</p>
                </div>

                <div className="flex flex-wrap gap-2 mt-4">
                  <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 px-3 py-1 flex items-center gap-1.5">
                    <Building2 className="h-3 w-3" /> {storeName}
                  </Badge>
                  <Badge variant="secondary" className="bg-slate-100 text-slate-700 px-3 py-1">
                    {profile?.role?.toUpperCase() || 'ADMIN'}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 shadow-sm">
               <CardHeader className="pb-2">
                 <CardTitle className="text-sm font-bold text-slate-500 uppercase tracking-wider">Preferences</CardTitle>
               </CardHeader>
               <CardContent className="space-y-4">
                 <div className="flex items-center justify-between">
                   <Label className="font-bold text-slate-700">Play Sound on Scan</Label>
                   <Switch defaultChecked />
                 </div>
               </CardContent>
            </Card>
          </div>

          {/* RIGHT COLUMN: Hardware / Printers */}
          <div className="lg:col-span-2 space-y-6">
            {isMobile ? (
              <Card className="rounded-2xl border-slate-200 shadow-sm h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Bluetooth className="h-4 w-4" /> Bluetooth Printer
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className={`p-4 rounded-xl border flex items-center justify-between transition-colors ${connectedDevice?.type === 'bluetooth' ? 'bg-green-50 border-green-200' : 'bg-slate-50'}`}>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-white shadow-sm border rounded-full flex items-center justify-center">
                        <Printer className="h-5 w-5 text-slate-600" />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-slate-900">{connectedDevice?.type === 'bluetooth' ? connectedDevice.name : "Not Connected"}</p>
                        <p className="text-xs text-slate-500">Tap scan to find devices</p>
                      </div>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <Label className="font-bold text-slate-700">Paired Devices</Label>
                    <Button size="sm" variant="secondary" className="rounded-full" onClick={scanBluetoothDevices} disabled={isScanning}>
                      <RefreshCw className={`h-4 w-4 mr-2 ${isScanning ? 'animate-spin' : ''}`} />
                      {isScanning ? 'Scanning...' : 'Scan'}
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {devices.map((device, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 border rounded-xl bg-white hover:bg-slate-50 transition-colors">
                        <span className="text-sm font-bold text-slate-700">{device.name}</span>
                        <Button size="sm" variant="outline" className="rounded-full" onClick={() => connectBluetooth(device)}>Connect</Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="rounded-2xl border-slate-200 shadow-sm h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold text-blue-600 uppercase tracking-wider flex items-center gap-2">
                    <Monitor className="h-4 w-4" /> System Printers
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className={`p-4 rounded-xl border flex items-center gap-3 transition-colors ${connectedDevice?.type === 'windows' ? 'bg-blue-50 border-blue-200' : 'bg-slate-50'}`}>
                     <div className="h-10 w-10 bg-white shadow-sm border rounded-full flex items-center justify-center">
                        <Laptop className="h-5 w-5 text-blue-600" />
                     </div>
                     <div>
                        <p className="font-bold text-sm text-slate-900">{connectedDevice?.type === 'windows' ? connectedDevice.name : "No Printer Selected"}</p>
                        <p className="text-xs text-slate-500">Select a printer for silent printing</p>
                     </div>
                  </div>

                  <div className="flex justify-between items-center pt-2">
                     <Label className="font-bold text-slate-700">Available Printers</Label>
                     <Button size="sm" variant="secondary" className="rounded-full" onClick={loadWindowsPrinters}>
                        <RefreshCw className="h-4 w-4 mr-2"/> Refresh
                     </Button>
                  </div>

                  <div className="space-y-2 max-h-[350px] overflow-y-auto">
                    {winPrinters.length === 0 && (
                       <div className="text-center py-6 text-xs text-muted-foreground border-2 border-dashed rounded-xl bg-slate-50">
                          {(window as any).electronAPI ? "Click Refresh to load printers" : "Web Mode: Uses Default Browser Print Dialog"}
                       </div>
                    )}
                    
                    {winPrinters.map((p: any) => (
                      <div key={p.name} className="flex items-center justify-between p-3 border rounded-xl bg-white hover:bg-slate-50 transition-colors">
                        <div className="flex flex-col">
                          <span className="font-bold text-sm text-slate-700">{p.name}</span>
                          {p.isDefault && <span className="text-[10px] text-blue-500 font-bold uppercase mt-0.5">System Default</span>}
                        </div>
                        {connectedDevice?.name === p.name ? (
                           <Badge className="bg-blue-600 rounded-full px-3"><Check className="h-3 w-3 mr-1"/> Active</Badge>
                        ) : (
                           <Button size="sm" variant="outline" className="rounded-full" onClick={() => selectWindowsPrinter(p.name)}>Select</Button>
                        )}
                      </div>
                    ))}
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