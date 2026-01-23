import { useState, useEffect, useRef, useCallback } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { 
  Camera,
  CameraOff,
  Minus,
  Plus,
  Trash2,
  ShoppingCart,
  Printer,
  MessageCircle,
  Percent,
  DollarSign,
  User,
  Phone,
  Search,
  X,
  ChevronUp,
  ChevronDown,
  CreditCard,
  ArrowLeft,
} from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Toast } from '@capacitor/toast'; 
import { supabase, CartItem, Item } from "@/lib/supabase";
import { Capacitor } from "@capacitor/core";
import { BluetoothSerial } from "@awesome-cordova-plugins/bluetooth-serial";
import { useNavigate } from "react-router-dom";

export default function Billing() {
  const navigate = useNavigate();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [manualCode, setManualCode] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isReturnMode, setIsReturnMode] = useState(false);
  
  // --- NEW UDHAAR STATE ---
  const [isUdhaar, setIsUdhaar] = useState(false);
  const [customerName, setCustomerName] = useState("");
  // ------------------------

// Store the user's desired final amount as a string to handle empty states easily
  const [manualFinalAmount, setManualFinalAmount] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [completedBill, setCompletedBill] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchResults, setSearchResults] = useState<Item[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [packItemModal, setPackItemModal] = useState<{
    open: boolean;
    item: Item | null;
    piecesPerBox: number;
  }>({ open: false, item: null, piecesPerBox: 1 });
  
  const [editQuantityModal, setEditQuantityModal] = useState<{
    open: boolean;
    item: CartItem | null;
    newQuantity: string;
  }>({ open: false, item: null, newQuantity: '' });
  const scannerRef = useRef<Html5Qrcode | null>(null);
  // Tracks the last code scanned to prevent duplicates
const lastScannedRef = useRef<{ code: string; time: number }>({ code: "", time: 0 });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { toast: webToast } = useToast();

  // FIX: Explicitly add 'duration' and 'className' to the type definition
  const showToast = async (props: { 
    title: string; 
    description?: string; 
    variant?: "default" | "destructive";
    duration?: number; 
    className?: string;
  }) => {
    if (Capacitor.isNativePlatform()) {
      // --- MOBILE: Native System Toast ---
      await Toast.show({
        text: `${props.title}${props.description ? `\n${props.description}` : ''}`,
        // Map milliseconds to 'short' or 'long' for native
        duration: (props.duration || 0) > 2000 ? 'long' : 'short',
        position: 'bottom', 
      });
    } else {
      // --- WEB: Shadcn Toast ---
      webToast({
        ...props,
        // Use the passed className OR fall back to the small style
        className: props.className || "py-2 px-4 min-h-0", 
      });
    }
  };
  
  const toast = showToast;
  // Debounce search function
  const searchItems = useCallback(async (query: string) => {
    if (!query) {
      setSearchResults([]);
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .or(`item_code.ilike.%${query}%,item_name.ilike.%${query}%`)
        .limit(5);
        
      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error('Error searching items:', error);
      setSearchResults([]);
    }
  }, []);

  const subtotal = cart.reduce((sum, item) => sum + item.selling_price * item.cartQuantity, 0);
  
  // If user entered a value, use it. Otherwise, Final = Subtotal.
  const finalTotal = manualFinalAmount === "" ? subtotal : parseFloat(manualFinalAmount);
  
  // Calculate the discount needed to reach that final total
  const discountAmount = Math.max(0, subtotal - finalTotal);
  
  // Calculate percentage (for display/printing purposes if needed)
  const calculatedDiscountPercent = subtotal > 0 ? ((discountAmount / subtotal) * 100).toFixed(1) : "0";

  const handleAddToCart = (item: Item, quantity: number) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      const totalQuantity = existing ? existing.cartQuantity + quantity : quantity;
      
      if (!isReturnMode && totalQuantity > item.quantity) {
        toast({
          title: "Stock Limit",
          description: `Cannot add more than available stock (${item.quantity} available)`,
          variant: "destructive",
        });
        return prev;
      }

      if (existing) {
        return prev.map((i) =>
          i.id === item.id 
            ? { ...i, cartQuantity: i.cartQuantity + quantity } 
            : i
        );
      }
      return [...prev, { ...item, cartQuantity: quantity }];
    });

    toast({
      title: isReturnMode ? "Return Added" : "Item Added",
      description: `${item.item_name} - ${quantity} × ₹${item.selling_price}`,
    });
  };

  const addToCart = useCallback(
    async (itemCode: string, closeDropdown = true) => {
      if (closeDropdown) {
        setShowDropdown(false);
        setSearchResults([]);
      }
      try {
        const { data: item, error } = await supabase
          .from("items")
          .select("*")
          .eq("item_code", itemCode.toUpperCase())
          .maybeSingle();

        if (error) throw error;
        if (!item) {
          toast({
            title: "Item Not Found",
            description: `No item with code: ${itemCode}`,
            variant: "destructive",
          });
          return;
        }

        if (item.pieces_per_box > 1) {
          setPackItemModal({
            open: true,
            item,
            piecesPerBox: item.pieces_per_box
          });
          return;
        }

        handleAddToCart(item, 1);
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message || "Failed to add item",
          variant: "destructive",
        });
      }
    },
    [isReturnMode, toast]
  );

  const handleManualCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setManualCode(value);
    
    if (value.length > 1) {
      searchItems(value);
      setShowDropdown(true);
    } else {
      setSearchResults([]);
      setShowDropdown(false);
    }
  };
  
  const handleSelectItem = (item: Item) => {
    setManualCode(item.item_code);
    setShowDropdown(false);
    addToCart(item.item_code);
  };
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchInputRef.current && !searchInputRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const updateQuantity = (itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === itemId) {
            const newQty = item.cartQuantity + delta;
            if (newQty <= 0) return null as any;
            if (!isReturnMode && newQty > item.quantity) {
              toast({
                title: "Stock Limit",
                description: `Cannot exceed available stock (${item.quantity} available)`,
                variant: "destructive",
              });
              return item;
            }
            return { ...item, cartQuantity: newQty };
          }
          return item;
        })
        .filter(Boolean)
    );
  };

  const handleEditQuantity = (item: CartItem) => {
    setEditQuantityModal({
      open: true,
      item,
      newQuantity: item.cartQuantity.toString(),
    });
  };

  const saveEditedQuantity = () => {
    if (!editQuantityModal.item) return;
    
    const newQuantity = parseInt(editQuantityModal.newQuantity, 10);
    if (isNaN(newQuantity) || newQuantity <= 0) {
      toast({
        title: "Invalid Quantity",
        description: "Please enter a valid positive number",
        variant: "destructive",
      });
      return;
    }

    if (!isReturnMode && newQuantity > editQuantityModal.item.quantity) {
      toast({
        title: "Stock Limit",
        description: `Cannot exceed available stock (${editQuantityModal.item.quantity} available)`,
        variant: "destructive",
      });
      return;
    }

    setCart((prev) =>
      prev.map((item) =>
        item.id === editQuantityModal.item?.id 
          ? { ...item, cartQuantity: newQuantity }
          : item
      )
    );

    setEditQuantityModal({ open: false, item: null, newQuantity: '' });
    toast({
      title: "Quantity Updated",
      description: `Updated quantity to ${newQuantity}`,
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== itemId));
  };

  const clearCart = () => {
    setCart([]);
    setManualFinalAmount("");
    setCustomerPhone("");
    setCustomerName(""); // Reset Name
    setIsUdhaar(false);  // Reset Udhaar
    setManualCode("");
    setSearchResults([]);
  };

  const completeSale = async () => {
    if (cart.length === 0) {
      toast({
        title: "Empty Cart",
        description: "Add items before completing sale",
        variant: "destructive",
      });
      return;
    }

    // --- UDHAAR VALIDATION ---
    if (isUdhaar && (!customerName || !customerPhone)) {
      toast({
        title: "Details Required",
        description: "Customer Name and Phone are required for Udhaar.",
        variant: "destructive",
      });
      return;
    }
    // -------------------------

    setIsProcessing(true);
    try {
      // Create bill
      const { data: bill, error: billError } = await supabase
        .from("bills")
        .insert({
          total_amount: isReturnMode ? -subtotal : subtotal,
          discount_amount: isReturnMode ? 0 : discountAmount,
          final_amount: isReturnMode ? -finalTotal : finalTotal,
          customer_phone: customerPhone || null,
          customer_name: customerName || null, // Saving Name
          payment_status: isUdhaar ? 'pending' : 'paid', // 'pending' for udhaar
          payment_method: isUdhaar ? 'udhaar' : 'cash',
          is_udhaar: isUdhaar // Optional flag if your DB has it
        })
        .select()
        .single();

      if (billError) throw billError;

      // Create bill items
      const billItems = cart.map((item) => ({
        bill_id: bill.id,
        item_id: item.id,
        quantity: isReturnMode ? -item.cartQuantity : item.cartQuantity,
        price_at_sale: item.selling_price,
      }));

      const { error: itemsError } = await supabase.from("bill_items").insert(billItems);
      if (itemsError) throw itemsError;

      // Update stock
      for (const item of cart) {
        const newQuantity = isReturnMode
          ? item.quantity + item.cartQuantity
          : item.quantity - item.cartQuantity;

        const { error: updateError } = await supabase
          .from("items")
          .update({ quantity: newQuantity })
          .eq("id", item.id);

        if (updateError) throw updateError;
      }

      setCompletedBill({ ...bill, items: cart });
      setShowSuccessModal(true);
      clearCart();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to complete sale",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // --- OPTIMIZED BLUETOOTH PRINT (App Only) ---
 // --- MOBILE APP PRINTING (Bluetooth) ---
// --- MOBILE APP PRINTING (Bluetooth) ---
// --- HELPER: MOBILE BLUETOOTH PRINT ---
const printViaBluetooth = async () => {
  // 1. If not mobile, return false immediately to trigger Web/Windows Print
  if (!Capacitor.isNativePlatform()) return false;

  const printerMac = localStorage.getItem("printer_mac");
  if (!printerMac) {
    toast({ 
      variant: "destructive", 
      title: "No Printer Found", 
      description: "Go to Settings > Default Printer to pair." 
    });
    return false; 
  }

  toast({ title: "Printing...", duration: 2000 });

  try {
    const isConnected = await BluetoothSerial.isConnected().catch(() => false);
    if (!isConnected) {
      await new Promise((resolve, reject) => {
        BluetoothSerial.connect(printerMac).subscribe(resolve, reject);
      });
    }

    // --- ESC/POS COMMANDS ---
    // (Keep your existing receipt generation logic here)
    let receipt = "";
    receipt += "\x1B\x40";       
    receipt += "\x1B\x61\x01";   
    receipt += "\x1B\x45\x01";   
    receipt += "SAKHI COLLECTIONS\n";
    receipt += "\x1B\x45\x00";   
    receipt += "Retail Invoice\n";
    receipt += "--------------------------------\n";
    // ... rest of your loop for items ...
    
    // Footer
    receipt += "\n\n\n"; 

    // Send
    await BluetoothSerial.write(receipt);
    toast({ title: "Printed Successfully", className: "bg-green-600 text-white" });
    
    return true; // <--- IMPORTANT: Return true on success

  } catch (error) {
    console.error("BT Print Error:", error);
    toast({ variant: "destructive", title: "Printer Error", description: "Could not connect." });
    return false; // <--- Return false on failure
  }
};

// --- MAIN HANDLER: UNIVERSAL PRINT ---
const printBill = async () => {
  if (!completedBill) return;

  // STEP 1: Try Mobile Bluetooth First
  if (Capacitor.isNativePlatform()) {
     const success = await printViaBluetooth();
     if (success) return; // If bluetooth worked, stop here.
  }

  // --- PREPARE HTML CONTENT (For Windows & Web) ---
  const billId = completedBill.id ? String(completedBill.id) : 'N/A';
  const billDate = new Date(completedBill.created_at).toLocaleDateString();
  const isUdhaarBill = completedBill.payment_status === 'pending';

  const printContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Bill #${billId}</title>
      <style>
        body { font-family: 'Courier New', monospace; margin: 0; padding: 5px; width: 300px; color: black; }
        .center { text-align: center; }
        .right { text-align: right; }
        .bold { font-weight: bold; }
        .divider { border-top: 1px dashed #000; margin: 5px 0; }
        .table { width: 100%; font-size: 12px; border-collapse: collapse; }
        .table td { vertical-align: top; }
        .udhaar-badge { border: 1px solid #000; padding: 2px 4px; font-size: 10px; display: inline-block; margin-top: 5px; }
      </style>
    </head>
    <body>
      <div class="center">
        <h2 style="margin:0; font-size: 18px;">SAKHI COLLECTIONS</h2>
        <p style="margin:5px 0; font-size:12px;">Retail Invoice</p>
        ${isUdhaarBill ? '<div class="udhaar-badge">UDHAAR / CREDIT</div>' : ''}
      </div>
      
      <div class="divider"></div>
      <div style="display:flex; justify-content:space-between; font-size:12px;">
        <span>${billDate}</span><span>#${billId.slice(0, 8)}</span>
      </div>
      ${completedBill.customer_name ? `<div style="font-size:12px;">Cust: ${completedBill.customer_name}</div>` : ''}
      
      <div class="divider"></div>
      <table class="table">
        ${completedBill.items.map((item: any) => `
          <tr><td colspan="2" style="padding-bottom: 2px;">${item.item_name}</td></tr>
          <tr>
            <td class="right" style="padding-bottom: 5px; color: #444;">${item.cartQuantity} x ${item.selling_price}</td>
            <td class="right bold" style="padding-bottom: 5px;">= ${(item.selling_price * item.cartQuantity).toFixed(2)}</td>
          </tr>
        `).join('')}
      </table>
      
      <div class="divider"></div>
      <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:16px;">
        <span>TOTAL</span><span>Rs.${Math.abs(completedBill.final_amount).toFixed(2)}</span>
      </div>
      <div class="center" style="margin-top:20px; font-size:12px;">Thank You!<br>Visit Again</div>
    </body>
    </html>
  `;

  // STEP 2: CHECK FOR WINDOWS (ELECTRON)
  // If running in Electron, use the silent print bridge
  if ((window as any).electronAPI) {
      const printerName = localStorage.getItem("windows_printer_name");
      
      if (!printerName) {
         toast({ variant: "destructive", title: "No Printer", description: "Select a printer in Settings first." });
         // Fallback to standard web print if no printer selected
      } else {
         toast({ title: "Printing..." });
         try {
            // Send to Electron Bridge
            await (window as any).electronAPI.printComponent(printContent, printerName);
            toast({ title: "Sent to Printer", className: "bg-green-600 text-white" });
            return; // Stop here on success
         } catch (e) {
            console.error(e);
            toast({ variant: "destructive", title: "Print Failed" });
         }
      }
  }

  // STEP 3: WEB FALLBACK (Standard Browser Print)
  // Runs if: 1. Not Mobile, 2. Not Electron, OR 3. Electron failed
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    toast({ title: "Error", description: "Allow popups to print", variant: "destructive" });
    return;
  }

  printWindow.document.write(printContent);
  printWindow.document.close();

  printWindow.onload = () => {
      printWindow.print();
      if (window.innerWidth < 768) {
          setTimeout(() => printWindow.close(), 1000);
      }
  };
};
  const shareOnWhatsApp = () => {
    if (!completedBill) return;

    // 1. HARDCODE YOUR VERCEL DOMAIN HERE
    // DO NOT use window.location.origin for the share link
    // Example: https://sakhi-billing.vercel.app (No trailing slash)
    const PUBLIC_DOMAIN = "https://stock-buddy-drab.vercel.app"; 
    
    // 2. Create the Secure Link
    // Now both Desktop and Mobile App will generate the correct web link
    const invoiceLink = `${PUBLIC_DOMAIN}/invoice/${completedBill.share_id}`;

    // 3. Format Date
    const dateStr = new Date().toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const customerName = completedBill.customer_name || "Customer";

    // 4. Message
    const message = encodeURIComponent(
`Dear ${customerName},

Thank you for shopping at SAKHI COLLECTIONS! 🛍️ 

Your invoice is ready:
💰 Amount: ₹${Math.abs(completedBill.final_amount)}
📅 Date: ${dateStr}
🔗 View Invoice: ${invoiceLink}

Visit Again! ✨`
    );

    // 5. Send
    if (completedBill.customer_phone) {
       window.open(`https://wa.me/91${completedBill.customer_phone}?text=${message}`, "_blank");
    } else {
       window.open(`https://wa.me/?text=${message}`, "_blank");
    }
  };

  const startScanner = async () => {
    setIsScanning(true);
    setTimeout(async () => {
      try {
        const scanner = new Html5Qrcode("qr-reader");
        scannerRef.current = scanner;

        const config = { 
          fps: 10, 
          qrbox: { width: 250, height: 100 }, // Shorter strip for barcodes
          formatsToSupport: [ 
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.QR_CODE 
          ]
        };

        await scanner.start(
          { facingMode: "environment" },
          config,
          (decodedText) => {
            // --- NEW THROTTLE LOGIC ---
            const now = Date.now();
            const timeSinceLastScan = now - lastScannedRef.current.time;
            
            // If it's the SAME code scanned less than 2 seconds ago, IGNORE it.
            if (decodedText === lastScannedRef.current.code && timeSinceLastScan < 2000) {
              return;
            }

            // Otherwise, accept the scan
            lastScannedRef.current = { code: decodedText, time: now };
            playBeep(); // Beep!
            addToCart(decodedText);
          },
          () => {} 
        );
      } catch (error) {
        console.error(error);
        setIsScanning(false);
        toast({ title: "Camera Error", variant: "destructive" });
      }
    }, 100);
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      await scannerRef.current.stop();
      scannerRef.current = null;
    }
    setIsScanning(false);
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop();
      }
    };
  }, []);

  const EditQuantityModal = () => (
    <Dialog 
      open={editQuantityModal.open} 
      onOpenChange={(open) => setEditQuantityModal(prev => ({ ...prev, open }))}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Quantity</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="quantity">
              {editQuantityModal.item?.item_name}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="quantity"
                type="number"
                min="1"
                value={editQuantityModal.newQuantity}
                onChange={(e) => setEditQuantityModal(prev => ({
                  ...prev,
                  newQuantity: e.target.value
                }))}
                onKeyDown={(e) => e.key === 'Enter' && saveEditedQuantity()}
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {editQuantityModal.item?.pieces_per_box > 1 
                  ? `(${Math.floor(parseInt(editQuantityModal.newQuantity || '0') / (editQuantityModal.item?.pieces_per_box || 1))} units)`
                  : ''}
              </span>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button 
              variant="outline" 
              onClick={() => setEditQuantityModal({ open: false, item: null, newQuantity: '' })}
            >
              Cancel
            </Button>
            <Button onClick={saveEditedQuantity}>
              Update
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  const PackItemModal = () => (
    <Dialog 
      open={packItemModal.open} 
      onOpenChange={(open) => setPackItemModal(prev => ({ ...prev, open }))}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select Sale Unit</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            {packItemModal.item?.item_name} - {packItemModal.piecesPerBox} pcs/unit
          </p>
          <div className="grid gap-2">
            <Button 
              variant="outline" 
              size="lg" 
              className="justify-between"
              onClick={() => {
                handleAddToCart(packItemModal.item!, packItemModal.piecesPerBox);
                setPackItemModal({ open: false, item: null, piecesPerBox: 1 });
              }}
            >
              <span>Add Full Unit</span>
              <span className="text-muted-foreground">{packItemModal.piecesPerBox} pcs</span>
            </Button>
            <Button 
              variant="outline" 
              size="lg" 
              className="justify-between"
              onClick={() => {
                handleAddToCart(packItemModal.item!, 1);
                setPackItemModal({ open: false, item: null, piecesPerBox: 1 });
              }}
            >
              <span>Add Single Piece</span>
              <span className="text-muted-foreground">1 pc</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  // Strong, sharp beep sound generator
  const playBeep = () => {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    // "square" wave is louder and sharper than "sine"
    oscillator.type = "square"; 
    oscillator.frequency.value = 1200; // Higher pitch for clarity
    gainNode.gain.value = 0.2; // Increase volume (be careful not to distort)

    oscillator.start();
    setTimeout(() => oscillator.stop(), 100); // Short, snappy 100ms beep
  };

  return (
    <AppLayout>
      {/* Helper Modals */}
      <PackItemModal />
      <EditQuantityModal />
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="w-[90%] max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-center">{isReturnMode ? "Refund Processed" : "Sale Complete"}</DialogTitle>
          </DialogHeader>
          <div className="text-center py-4 space-y-4">
            <div className={`text-5xl font-black ${completedBill?.payment_status === 'pending' ? 'text-orange-600' : 'text-primary'}`}>
              ₹{completedBill ? Math.abs(completedBill.final_amount).toFixed(0) : "0"}
            </div>
            
            {completedBill?.payment_status === 'pending' && (
              <Badge variant="outline" className="text-orange-600 border-orange-200 justify-center w-full">Pending Payment</Badge>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2">
              <Button variant="outline" onClick={printBill} className="flex gap-2">
                <Printer className="h-4 w-4"/> Print
              </Button>
              <Button variant="outline" onClick={shareOnWhatsApp} className="flex gap-2">
                <MessageCircle className="h-4 w-4"/> Share
              </Button>
            </div>
            <Button className="w-full h-12 text-lg" onClick={() => setShowSuccessModal(false)}>
              Start New Sale
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* MAIN CONTAINER 
         h-[100dvh] fixes the mobile browser address bar scroll issue.
         flex-col for mobile, lg:flex-row for desktop split view
      */}
      <div className="flex flex-col lg:flex-row h-[calc(100dvh-4rem)] lg:h-[calc(100vh-4rem)] -m-4 sm:m-0 bg-background overflow-hidden relative">
        
        {/* --- LEFT COLUMN: SEARCH & CART LIST --- */}
        <div className="flex-1 flex flex-col h-full overflow-hidden relative">
          
          {/* Header & Search */}
          <div className="bg-card border-b shadow-sm z-20 shrink-0 p-3 space-y-3">
            {/* Top Row: Title, Mode, Scan Toggle */}
            <div className="flex items-center justify-between">
               <div className="flex items-center gap-3">
      <Button 
        variant="ghost" 
        size="icon" 
        className="-ml-2 h-9 w-9 text-muted-foreground" 
        onClick={() => navigate("/")} // Goes back to Dashboard
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>
                  <div className="flex items-center gap-2 bg-muted rounded-full px-2 py-1">
                    <span className={`text-[10px] uppercase font-bold ${!isReturnMode ? 'text-primary' : 'text-muted-foreground'}`}>Sale</span>
                    <Switch 
                      checked={isReturnMode} 
                      onCheckedChange={(c) => { setIsReturnMode(c); setIsUdhaar(false); clearCart(); }} 
                      className="scale-75" 
                    />
                    <span className={`text-[10px] uppercase font-bold ${isReturnMode ? 'text-destructive' : 'text-muted-foreground'}`}>Ret</span>
                  </div>
                  
               </div>

               <div className="flex gap-2">
                 {cart.length > 0 && (
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive bg-destructive/10 hover:bg-destructive/20" onClick={clearCart}>
                      <Trash2 className="h-4 w-4"/>
                    </Button>
                  )}
                  <Button 
                    variant={isScanning ? "destructive" : "default"} 
                    size="sm"
                    onClick={isScanning ? stopScanner : startScanner}
                    className="h-9 px-4 shadow-sm"
                  >
                    {isScanning ? <CameraOff className="mr-2 h-4 w-4"/> : <Camera className="mr-2 h-4 w-4"/>}
                    {isScanning ? "Stop" : "Scan"}
                  </Button>
               </div>
            </div>

            {/* Scanner Viewport (Animated) */}
            <div className={`relative bg-black rounded-lg overflow-hidden transition-all duration-300 ease-in-out ${isScanning ? 'h-[200px] mb-2' : 'h-0'}`}>
              <div id="qr-reader" className="w-full h-full" />
              {isScanning && (
                <Button variant="ghost" size="icon" className="absolute top-2 right-2 text-white h-8 w-8 bg-black/50 rounded-full z-30" onClick={stopScanner}>
                  <X className="h-4 w-4"/>
                </Button>
              )}
            </div>

            {/* Search Bar */}
            <div className="relative" ref={searchInputRef}>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search Item Code or Name..." 
                    value={manualCode}
                    onChange={handleManualCodeChange}
                    onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                    onKeyDown={(e) => e.key === "Enter" && manualCode && (addToCart(manualCode), setManualCode(""))}
                    className="pl-9 h-10 text-base" // Larger text for mobile inputs
                  />
                </div>
                <Button size="icon" className="h-10 w-10 shrink-0" onClick={() => manualCode && (addToCart(manualCode), setManualCode(""))} disabled={!manualCode}>
                  <Plus className="h-5 w-5" />
                </Button>
              </div>
              
              {/* Dropdown Results */}
              {showDropdown && searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-2xl z-50 max-h-[40vh] overflow-y-auto">
                  {searchResults.map((item) => (
                    <div key={item.id} className="p-3 border-b last:border-0 hover:bg-accent active:bg-accent/80 cursor-pointer flex justify-between items-center"
                      onClick={() => { setManualCode(item.item_code); addToCart(item.item_code); setShowDropdown(false); }}>
                      <div>
                        <div className="font-medium text-base">{item.item_name}</div>
                        <div className="text-xs text-muted-foreground">{item.item_code}</div>
                      </div>
                      <div className="font-bold text-primary">₹{item.selling_price}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Cart List */}
          {/* pb-48 ensures the last item scrolls ABOVE the fixed footer on mobile */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-muted/20 pb-48 lg:pb-4">
             {cart.length === 0 ? (
                <div className="h-[50vh] flex flex-col items-center justify-center text-muted-foreground/40">
                  <div className="bg-muted/30 p-6 rounded-full mb-4">
                    <ShoppingCart className="h-10 w-10" />
                  </div>
                  <p className="font-medium">Cart is empty</p>
                  <p className="text-xs mt-1">Scan items to start billing</p>
                </div>
             ) : (
               cart.map((item) => (
                 <Card key={item.id} className="border-0 shadow-sm ring-1 ring-border/50">
                    <CardContent className="p-3 flex items-center justify-between gap-3">
                       <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm truncate">{item.item_name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                             <Badge variant="secondary" className="font-normal text-[10px] h-5 px-1">{item.size || 'STD'}</Badge>
                             <span className="text-xs text-muted-foreground">₹{item.selling_price} / unit</span>
                          </div>
                       </div>
                       
                       <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center bg-secondary rounded-lg p-0.5">
                             <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => updateQuantity(item.id, -1)}>
                               <Minus className="h-3 w-3" />
                             </Button>
                             <div 
                               className="w-8 text-center font-bold text-sm cursor-pointer border-b border-dashed border-primary/50"
                               onClick={() => setEditQuantityModal({ open: true, item, newQuantity: String(item.cartQuantity) })}
                             >
                               {item.cartQuantity}
                             </div>
                             <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => updateQuantity(item.id, 1)}>
                               <Plus className="h-3 w-3" />
                             </Button>
                          </div>
                          <div className="font-bold text-base">₹{(item.selling_price * item.cartQuantity).toFixed(0)}</div>
                       </div>
                    </CardContent>
                 </Card>
               ))
             )}
          </div>
        </div>

        {/* --- RIGHT COLUMN / BOTTOM SHEET: PAYMENTS --- */}
        {/* On Mobile: Fixed to bottom. On Desktop: Static right column */}
        <div className={`
            bg-background border-t lg:border-t-0 lg:border-l shadow-[0_-4px_20px_rgba(0,0,0,0.1)] 
            z-30 shrink-0 
            fixed bottom-0 left-0 right-0 
            lg:relative lg:w-[380px] lg:flex lg:flex-col lg:justify-end
        `}>
           
           {/* Collapsible/Expandable Options Area */}
           <div className="px-4 pt-3 pb-2 space-y-3">
              
              {/* Row 1: Quick Toggles (Discount & Udhaar) */}
              {cart.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                    {/* Discount Control */}
                    {/* Discount Control - REPLACED */}
                    <div className="flex items-center gap-2 bg-secondary/40 rounded-lg p-2 border flex-1 min-w-[140px]">
                    <div className="flex flex-col items-start justify-center px-1">
                      <span className="text-[10px] text-muted-foreground font-semibold uppercase">
                        Final Bill Amt
                      </span>
                      {discountAmount > 0 && (
                        <span className="text-[10px] text-green-600 font-bold">
                          ({calculatedDiscountPercent}% Off)
                        </span>
                      )}
                    </div>
                    <Input 
                        type="number" 
                        className="h-8 border-0 bg-white shadow-sm text-right pl-6 pr-2 focus-visible:ring-0 font-bold text-lg"
                        placeholder=""  // REMOVED the placeholder so it doesn't confuse the user
                        value={manualFinalAmount}
                        onChange={e => setManualFinalAmount(e.target.value)}
                        onFocus={(e) => {
                        // If the box is empty, fill it with the current subtotal instantly
                        // This makes the number "real" so Backspace works
                        if (!manualFinalAmount) {
                            setManualFinalAmount(subtotal.toString());
                        }
                        // Select the text after a tiny delay so the new value is highlighted
                        setTimeout(() => e.target.select(), 10);
                    }}
                />
                    </div>

                    {/* Udhaar Toggle */}
                    <div 
                      className={`flex items-center gap-2 px-3 rounded-lg border cursor-pointer transition-colors ${isUdhaar ? 'bg-orange-50 border-orange-200' : 'bg-secondary/40 border-transparent'}`}
                      onClick={() => setIsUdhaar(!isUdhaar)}
                    >
                      <span className={`text-sm font-bold ${isUdhaar ? 'text-orange-700' : 'text-muted-foreground'}`}>Credit</span>
                      <Switch checked={isUdhaar} onCheckedChange={setIsUdhaar} className="scale-75 data-[state=checked]:bg-orange-600" />
                    </div>
                </div>
              )}

              {/* Row 2: Customer Details (Always Visible now) */}
<div className={`
  p-2 rounded-lg border space-y-2 transition-colors duration-200
  ${isUdhaar ? 'bg-orange-50 border-orange-200' : 'bg-white border-transparent'}
`}>
  <div className="flex gap-2">
    {/* Customer Name Input */}
    <div className="relative flex-1">
      <User className={`absolute left-2.5 top-2.5 h-3.5 w-3.5 ${isUdhaar ? 'text-orange-400' : 'text-muted-foreground'}`}/>
      <Input 
        placeholder={isUdhaar ? "Customer Name (Required)" : "Customer Name (Optional)"}
        className={`pl-8 h-9 text-sm focus-visible:ring-1 ${isUdhaar ? 'border-orange-200 focus-visible:ring-orange-300' : ''}`} 
        value={customerName} 
        onChange={e => setCustomerName(e.target.value)} 
      />
    </div>

    {/* Phone Input */}
    <div className="relative w-[140px]">
      <Phone className={`absolute left-2.5 top-2.5 h-3.5 w-3.5 ${isUdhaar ? 'text-orange-400' : 'text-muted-foreground'}`}/>
      <Input 
        type="tel"
        placeholder="Mobile No." 
        className={`pl-8 h-9 text-sm focus-visible:ring-1 ${isUdhaar ? 'border-orange-200 focus-visible:ring-orange-300' : ''}`} 
        value={customerPhone} 
        onChange={e => setCustomerPhone(e.target.value)} 
      />
    </div>
  </div>
</div>
           </div>

           {/* MAIN PAYMENT BAR (Bottom) */}
           {/* pb-safe handles iPhone Home Bar. lg:pb-4 handles desktop padding */}
           <div className="bg-card p-4 pt-2 border-t flex items-center gap-3 pb-safe lg:pb-6">
              <div className="flex-1">
                 <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total</span>
                    {discountAmount > 0 && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 rounded-sm font-bold">-{Math.round(discountAmount)}</span>}
                 </div>
                 <div className={`text-3xl font-black leading-tight tracking-tight ${isReturnMode ? 'text-destructive' : 'text-primary'}`}>
                    ₹{finalTotal.toFixed(0)}
                 </div>
              </div>

              <Button 
                size="lg" 
                className={`
                  h-14 px-8 text-lg font-bold rounded-xl shadow-xl transition-all active:scale-95
                  ${isUdhaar ? 'bg-orange-600 hover:bg-orange-700 text-white' : 'bg-primary hover:bg-primary/90'}
                  ${isReturnMode ? 'bg-destructive hover:bg-destructive/90' : ''}
                `}
                disabled={cart.length === 0 || isProcessing}
                onClick={completeSale}
              >
                 <span className="mr-2">{isProcessing ? "Processing..." : isReturnMode ? "REFUND" : isUdhaar ? "CREDIT" : "PAY"}</span>
                 {!isProcessing && <CreditCard className="h-5 w-5 opacity-80" />}
              </Button>
           </div>
        </div>

      </div>
    </AppLayout>
  );
}