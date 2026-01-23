"use client";

import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { BluetoothSerial } from "@awesome-cordova-plugins/bluetooth-serial";
import { Capacitor } from "@capacitor/core";
import { Printer, RefreshCw, Bluetooth, Check, Monitor, Laptop } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { AndroidPermissions } from "@awesome-cordova-plugins/android-permissions";
import { Toast } from '@capacitor/toast';

export default function SettingsPage() {
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<any>(null);
  
  // New State for Windows Printers
  const [winPrinters, setWinPrinters] = useState<any[]>([]);
  const [isMobile, setIsMobile] = useState(false);

  // 1. SMART TOAST WRAPPER
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

  // 2. CHECK PLATFORM & LOAD
  useEffect(() => {
    const native = Capacitor.isNativePlatform();
    setIsMobile(native);

    if (native) {
      checkMobileConnection();
    } else {
      // If on Windows/Web, try to load system printers
      loadWindowsPrinters();
      const savedWinPrinter = localStorage.getItem("windows_printer_name");
      if (savedWinPrinter) {
        setConnectedDevice({ name: savedWinPrinter, type: 'windows' });
      }
    }
  }, []);

  // --- MOBILE LOGIC ---
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

  // --- WINDOWS LOGIC ---
  const loadWindowsPrinters = async () => {
    // Check if running in Electron
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
      <div className="p-4 max-w-lg mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground text-sm">Configure Hardware</p>
        </div>

        {/* --- MOBILE VIEW --- */}
        {isMobile ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500 uppercase flex items-center gap-2">
                <Bluetooth className="h-4 w-4" /> Bluetooth Printer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={`p-4 rounded-lg border flex items-center justify-between ${connectedDevice?.type === 'bluetooth' ? 'bg-green-50 border-green-200' : 'bg-slate-50'}`}>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-slate-200 rounded-full flex items-center justify-center">
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
                <Label>Paired Devices</Label>
                <Button size="sm" variant="ghost" onClick={scanBluetoothDevices} disabled={isScanning}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${isScanning ? 'animate-spin' : ''}`} />
                  {isScanning ? 'Scanning...' : 'Scan'}
                </Button>
              </div>
              <div className="space-y-2">
                {devices.map((device, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                    <span className="text-sm font-bold">{device.name}</span>
                    <Button size="sm" variant="outline" onClick={() => connectBluetooth(device)}>Connect</Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          /* --- WINDOWS / WEB VIEW --- */
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-600 uppercase flex items-center gap-2">
                <Monitor className="h-4 w-4" /> System Printers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status Box */}
              <div className={`p-4 rounded-lg border flex items-center gap-3 ${connectedDevice?.type === 'windows' ? 'bg-blue-50 border-blue-200' : 'bg-slate-50'}`}>
                 <div className="h-10 w-10 bg-white border rounded-full flex items-center justify-center">
                    <Laptop className="h-5 w-5 text-blue-600" />
                 </div>
                 <div>
                    <p className="font-bold text-sm text-slate-900">{connectedDevice?.type === 'windows' ? connectedDevice.name : "No Printer Selected"}</p>
                    <p className="text-xs text-slate-500">Select a printer for silent printing</p>
                 </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                 <Label>Available Printers</Label>
                 <Button size="sm" variant="ghost" onClick={loadWindowsPrinters}>
                    <RefreshCw className="h-4 w-4 mr-2"/> Refresh
                 </Button>
              </div>

              {/* Printer List */}
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {winPrinters.length === 0 && (
                   <div className="text-center py-4 text-xs text-muted-foreground border border-dashed rounded-lg">
                      {(window as any).electronAPI ? "Click Refresh to load printers" : "Web Mode: Uses Browser Print Dialog"}
                   </div>
                )}
                
                {winPrinters.map((p: any) => (
                  <div key={p.name} className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50">
                    <div className="flex flex-col">
                      <span className="font-bold text-sm">{p.name}</span>
                      <span className="text-[10px] text-muted-foreground">{p.isDefault ? 'Default System Printer' : ''}</span>
                    </div>
                    {connectedDevice?.name === p.name ? (
                       <Badge className="bg-blue-600"><Check className="h-3 w-3 mr-1"/> Active</Badge>
                    ) : (
                       <Button size="sm" variant="outline" onClick={() => selectWindowsPrinter(p.name)}>Select</Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
           <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Preferences</CardTitle></CardHeader>
           <CardContent className="space-y-4">
             <div className="flex items-center justify-between"><Label>Play Sound on Order</Label><Switch /></div>
           </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}