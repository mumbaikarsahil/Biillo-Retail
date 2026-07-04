import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { 
  Camera, CameraOff, Minus, Plus, ShoppingCart, Printer, MessageCircle,
  Search, X, ArrowLeft, LayoutGrid, ChevronUp, ChevronDown, CheckCircle2, User, Phone, Edit3, Percent, Receipt
} from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Toast } from '@capacitor/toast'; 
import { supabase, CartItem, Item } from "@/lib/supabase";
import { Capacitor } from "@capacitor/core";
import { BluetoothSerial } from "@awesome-cordova-plugins/bluetooth-serial";

const StockIndicator = ({ quantity }: { quantity: number }) => (
  <div className="flex items-center gap-1.5">
    <div className={`h-2 w-2 rounded-full ${quantity > 5 ? 'bg-emerald-500' : 'bg-red-500'}`} />
    <span className="text-[10px] font-medium text-zinc-500">{quantity} in stock</span>
  </div>
);

export default function Billing() {
  // --- STATE ---
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [billingUser, setBillingUser] = useState({ name: "Admin", role: "Manager" });
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [quickCategories, setQuickCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isReturnMode, setIsReturnMode] = useState(false);
  
  // Checkout & Customer State
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [viewMode, setViewMode] = useState<'scan' | 'payment'>('scan');
  
  // Payment & Discount State
  const [discountType, setDiscountType] = useState<'amount' | 'percentage'>('amount');
  const [discountValue, setDiscountValue] = useState("");
  const [paymentTab, setPaymentTab] = useState<"full" | "advance">("full");
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'online' | 'unpaid'>('cash');
  const [advanceAmount, setAdvanceAmount] = useState("");
  
  // Modals
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showCustomItemModal, setShowCustomItemModal] = useState(false);
  const [customItemData, setCustomItemData] = useState({ name: "", price: "", qty: "1", notes: "" });
  
  const [completedBill, setCompletedBill] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScannedRef = useRef<{ code: string; time: number }>({ code: "", time: 0 });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { toast: webToast } = useToast();

  const toast = async (props: any) => {
    if (Capacitor.isNativePlatform()) {
      await Toast.show({ text: `${props.title}${props.description ? `\n${props.description}` : ''}`, duration: 'short', position: 'bottom' });
    } else {
      webToast({ ...props, className: props.className || "py-2 px-4 min-h-0" });
    }
  };

  // --- INITIALIZATION ---
  useEffect(() => {
    const initialize = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: profile } = await supabase.from("profiles").select("tenant_id, full_name, role").eq("id", session.user.id).single();

      if (profile) {
        setBillingUser({ name: profile.full_name || "Admin", role: profile.role || "Staff" });
        if (profile.tenant_id) {
          setCurrentTenantId(profile.tenant_id);
          fetchAllTenantData(profile.tenant_id);
          fetchNextInvoiceNumber(profile.tenant_id);
        }
      }
    };
    initialize();
  }, []);

  // --- SMART INVOICE SEQUENCE GENERATOR ---
  const fetchNextInvoiceNumber = async (tenantId: string) => {
    try {
      const { data } = await supabase
        .from('bills')
        .select('invoice_number, id')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data && data.invoice_number) {
        // Look for trailing numbers (e.g., INV-1004 -> prefix: INV-, num: 1004)
        const match = data.invoice_number.match(/^(.*?)(\d+)$/);
        if (match) {
          const prefix = match[1];
          const num = parseInt(match[2], 10) + 1;
          const paddedNum = String(num).padStart(match[2].length, '0');
          setInvoiceNumber(`${prefix}${paddedNum}`);
        } else {
          // If no trailing number, just append -1
          setInvoiceNumber(`${data.invoice_number}-1`);
        }
      } else {
        // Default Starting Sequence
        setInvoiceNumber(`INV-1001`);
      }
    } catch (err) {
      setInvoiceNumber(`INV-${Date.now().toString().slice(-4)}`);
    }
  };

  const fetchAllTenantData = async (tenantId: string) => {
    try {
      const { data, error } = await supabase.from('items').select('*').eq('tenant_id', tenantId).order('item_name', { ascending: true });
      if (error) throw error;
      if (data) {
        setAllItems(data);
        const cats = Array.from(new Set(data.map(item => item.brand_name ? item.brand_name.toUpperCase() : item.item_name.trim().split(" ")[0].toUpperCase()))).filter(Boolean);
        setQuickCategories(cats);
      }
    } catch (err) { console.error(err); }
  };

  const handlePhoneChange = async (val: string) => {
    setCustomerPhone(val);
    if (val.length >= 10 && currentTenantId) {
      try {
        const { data } = await supabase.from('bills').select('customer_name').eq('customer_phone', val).eq('tenant_id', currentTenantId).not('customer_name', 'is', null).order('created_at', { ascending: false }).limit(1);
        if (data && data.length > 0) {
          setCustomerName(data[0].customer_name);
          toast({ title: "Customer Found", description: `Autofilled: ${data[0].customer_name}` });
        }
      } catch (err) {}
    }
  };

  // --- COMPUTATIONS & DISCOUNT ENGINE ---
  const subtotal = cart.reduce((sum, item) => sum + item.selling_price * item.cartQuantity, 0);
  
  const parsedDiscount = parseFloat(discountValue || "0");
  const discountAmount = discountType === 'amount' ? parsedDiscount : subtotal * (parsedDiscount / 100);
  const finalTotal = Math.max(0, subtotal - discountAmount);
  
  const displayItems = useMemo(() => {
    return allItems.filter(item => {
      const matchesSearch = item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) || item.item_code.toLowerCase().includes(searchTerm.toLowerCase());
      const itemCategory = item.brand_name ? item.brand_name.toUpperCase() : item.item_name.trim().split(" ")[0].toUpperCase();
      const matchesCat = selectedCategory === "ALL" || itemCategory === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [allItems, searchTerm, selectedCategory]);

  // --- CART LOGIC ---
  const handleAddToCart = (item: Item, quantity: number) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      const totalQty = existing ? existing.cartQuantity + quantity : quantity;
      if (!isReturnMode && totalQty > item.quantity) {
        toast({ title: "Stock Limit Reached", variant: "destructive" });
        return prev;
      }
      if (existing) return prev.map((i) => i.id === item.id ? { ...i, cartQuantity: i.cartQuantity + quantity } : i);
      return [...prev, { ...item, cartQuantity: quantity }];
    });
    playBeep();
  };

  const addToCartByCode = useCallback(async (itemCode: string) => {
    if (!currentTenantId) return;
    setSearchTerm("");
    const { data: item } = await supabase.from("items").select("*").eq("item_code", itemCode.toUpperCase()).eq("tenant_id", currentTenantId).maybeSingle();
    if (item) handleAddToCart(item, 1);
    else toast({ title: "Item Not Found", variant: "destructive" });
  }, [currentTenantId, isReturnMode]);

  const updateQuantity = (itemId: string, delta: number) => {
    setCart((prev) => prev.map((item) => {
        if (item.id === itemId) {
          const newQty = item.cartQuantity + delta;
          if (newQty <= 0) return null as any;
          if (!isReturnMode && newQty > item.quantity) return item;
          return { ...item, cartQuantity: newQty };
        }
        return item;
      }).filter(Boolean)
    );
  };

  const clearCart = () => {
    setCart([]); setCustomerPhone(""); setCustomerName(""); setAdvanceAmount("");
    setSearchTerm(""); setSelectedCategory("ALL"); setPaymentTab("full"); setPaymentMethod("cash");
    setDiscountValue(""); setDiscountType("amount");
    if (currentTenantId) fetchNextInvoiceNumber(currentTenantId); // Reset to latest sequence
  };

  const handleAddCustomItem = async () => {
    if (!customItemData.name || !customItemData.price || !currentTenantId) return;
    setIsProcessing(true);
    try {
      const customCode = `CST-${Date.now().toString().slice(-6)}`;
      const { data: newItem, error } = await supabase.from('items').insert({
        tenant_id: currentTenantId, item_code: customCode,
        item_name: customItemData.name + (customItemData.notes ? ` (${customItemData.notes})` : ''),
        selling_price: parseFloat(customItemData.price), purchase_price: parseFloat(customItemData.price),
        quantity: 999, pieces_per_box: 1, size: 'Custom'
      }).select().single();

      if (error) throw error;
      handleAddToCart(newItem, parseInt(customItemData.qty) || 1);
      setShowCustomItemModal(false);
      setCustomItemData({ name: "", price: "", qty: "1", notes: "" });
    } catch (e) {
      toast({ title: "Error creating item", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  // --- CHECKOUT LOGIC ---
  const completeSale = async () => {
    if (cart.length === 0) return;
    
    if (!invoiceNumber.trim()) {
      toast({ title: "Invoice Number Required", variant: "destructive" });
      return;
    }

    const isAdvanceMode = paymentTab === "advance";
    const advPaid = isAdvanceMode ? parseFloat(advanceAmount || "0") : (paymentMethod === 'unpaid' ? 0 : finalTotal);
    const balDue = Math.max(0, finalTotal - advPaid);
    
    let status = 'paid';
    if (balDue > 0) status = advPaid > 0 ? 'partially_paid' : 'pending';
    
    if (status !== 'paid' && (!customerName || !customerPhone)) {
      toast({ title: "Customer Details Required", description: "Phone and Name required for pending balances.", variant: "destructive" }); 
      return;
    }

    setIsProcessing(true);
    try {
      const { data: bill, error: billError } = await supabase.from("bills").insert({
        invoice_number: invoiceNumber,
        total_amount: isReturnMode ? -subtotal : subtotal,
        discount_amount: isReturnMode ? 0 : discountAmount,
        final_amount: isReturnMode ? -finalTotal : finalTotal,
        advance_paid: isReturnMode ? -advPaid : advPaid,     
        balance_due: isReturnMode ? -balDue : balDue,         
        customer_phone: customerPhone || null,
        customer_name: customerName || null,
        payment_status: status,
        payment_method: paymentMethod, 
        is_udhaar: balDue > 0,
        tenant_id: currentTenantId                                
      }).select().single();

      if (billError) throw billError;

      const billItems = cart.map((item) => ({
        bill_id: bill.id,
        item_id: item.id,
        item_code: item.item_code, 
        quantity: isReturnMode ? -item.cartQuantity : item.cartQuantity,
        price_at_sale: item.selling_price,
      }));

      await supabase.from("bill_items").insert(billItems);

      for (const item of cart) {
        const newQuantity = isReturnMode ? item.quantity + item.cartQuantity : item.quantity - item.cartQuantity;
        await supabase.from("items").update({ quantity: newQuantity }).eq("id", item.id);
      }

      setCompletedBill({ ...bill, items: cart });
      setShowSuccessModal(true);
      clearCart();
      setViewMode('scan'); 
      if (currentTenantId) fetchAllTenantData(currentTenantId);

    } catch (error: any) {
      toast({ title: "Transaction Error", description: error.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  // --- HARDWARE & HELPERS ---
  const playBeep = () => {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode); gainNode.connect(audioCtx.destination);
    oscillator.type = "square"; oscillator.frequency.value = 1200; gainNode.gain.value = 0.1; 
    oscillator.start(); setTimeout(() => oscillator.stop(), 100); 
  };

  const startScanner = async () => {
    setIsScanning(true);
    setTimeout(async () => {
      try {
        const scanner = new Html5Qrcode("qr-reader", { verbose: false, formatsToSupport: [Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.QR_CODE] }); 
        scannerRef.current = scanner;
        await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 100 } }, (decodedText) => {
            const now = Date.now();
            if (decodedText === lastScannedRef.current.code && now - lastScannedRef.current.time < 2000) return;
            lastScannedRef.current = { code: decodedText, time: now };
            addToCartByCode(decodedText);
          }, () => {} 
        );
      } catch (error) { setIsScanning(false); }
    }, 100);
  };

  const stopScanner = async () => {
    if (scannerRef.current) { await scannerRef.current.stop(); scannerRef.current = null; }
    setIsScanning(false);
  };

  const printBill = async () => {
    if (!completedBill) return;
    if (Capacitor.isNativePlatform()) {
      const printerMac = localStorage.getItem("printer_mac");
      if (printerMac) {
        try {
          const isConnected = await BluetoothSerial.isConnected().catch(() => false);
          if (!isConnected) await new Promise((resolve, reject) => BluetoothSerial.connect(printerMac).subscribe(resolve, reject));
          let receipt = "\x1B\x40\x1B\x61\x01\x1B\x45\x01STORE INVOICE\n\x1B\x45\x00--------------------------------\n\n\n"; 
          await BluetoothSerial.write(receipt);
          toast({ title: "Printed Successfully", className: "bg-emerald-600 text-white" });
          return;
        } catch (error) {}
      }
    }
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`<html><body><h2>Invoice #${completedBill.invoice_number || completedBill.id}</h2></body></html>`);
      printWindow.document.close();
      printWindow.onload = () => printWindow.print();
    }
  };

  const shareOnWhatsApp = () => {
    if (!completedBill) return;
    const PUBLIC_DOMAIN = "https://retail.biillo.com"; 
    const invoiceLink = `${PUBLIC_DOMAIN}/#/invoice/${completedBill.share_id}`;
    const message = encodeURIComponent(`Thank you for shopping!\nInvoice: ${completedBill.invoice_number || completedBill.id}\nTotal Amount: ₹${Math.abs(completedBill.final_amount)}\nView E-Receipt: ${invoiceLink}`);
    window.open(`https://wa.me/${completedBill.customer_phone ? '91'+completedBill.customer_phone : ''}?text=${message}`, "_blank");
  };

  useEffect(() => { return () => { if (scannerRef.current) scannerRef.current.stop(); }; }, []);

  useEffect(() => {
    let barcodeBuffer = "";
    let lastKeyTime = 0;
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); searchInputRef.current?.focus(); return; }
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const currentTime = Date.now();
      if (currentTime - lastKeyTime > 50) barcodeBuffer = "";
      lastKeyTime = currentTime;
      if (e.key === 'Enter') {
        if (barcodeBuffer.length > 2) { addToCartByCode(barcodeBuffer); barcodeBuffer = ""; }
      } else if (e.key.length === 1) { barcodeBuffer += e.key; }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [addToCartByCode]);

  return (
    <AppLayout>
      
      {/* CUSTOM ITEM MODAL */}
      <Dialog open={showCustomItemModal} onOpenChange={setShowCustomItemModal}>
        <DialogContent className="sm:max-w-md rounded-2xl z-[150] p-6 border-zinc-200/80 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold tracking-tight text-zinc-900">Add Line Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Item Name</Label>
              <Input className="h-11 rounded-xl border-zinc-200/80 focus-visible:ring-zinc-900 shadow-sm" placeholder="e.g. Alteration Charge" value={customItemData.name} onChange={e => setCustomItemData({...customItemData, name: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Price (₹)</Label>
                <Input type="number" className="h-11 rounded-xl border-zinc-200/80 focus-visible:ring-zinc-900 shadow-sm" placeholder="0" value={customItemData.price} onChange={e => setCustomItemData({...customItemData, price: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Quantity</Label>
                <Input type="number" className="h-11 rounded-xl border-zinc-200/80 focus-visible:ring-zinc-900 shadow-sm" value={customItemData.qty} onChange={e => setCustomItemData({...customItemData, qty: e.target.value})} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Notes (Optional)</Label>
              <Input className="h-11 rounded-xl border-zinc-200/80 focus-visible:ring-zinc-900 shadow-sm" placeholder="Internal memo" value={customItemData.notes} onChange={e => setCustomItemData({...customItemData, notes: e.target.value})} />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            <Button variant="outline" className="h-11 rounded-xl w-full sm:w-auto font-semibold border-zinc-200/80 text-zinc-700" onClick={() => setShowCustomItemModal(false)}>Cancel</Button>
            <Button className="h-11 rounded-xl w-full sm:w-auto font-semibold bg-zinc-900 text-white shadow-sm" onClick={handleAddCustomItem} disabled={isProcessing || !customItemData.name || !customItemData.price}>Add to Cart</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SUCCESS MODAL */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="w-[90%] max-w-sm rounded-2xl p-6 border-zinc-200/80 shadow-2xl">
          <div className="flex flex-col items-center justify-center space-y-4 pt-4">
            <div className="h-14 w-14 rounded-full bg-emerald-50 flex items-center justify-center">
               <CheckCircle2 className="h-7 w-7 text-emerald-500" />
            </div>
            <DialogTitle className="text-xl font-semibold tracking-tight text-zinc-900">Order Confirmed</DialogTitle>
            <div className="text-center">
              <div className="text-4xl font-semibold text-zinc-900 tracking-tight">
                ₹{completedBill ? Math.abs(completedBill.final_amount).toFixed(0) : "0"}
              </div>
              <p className="text-xs font-semibold text-zinc-500 mt-1 uppercase tracking-wider">{completedBill?.invoice_number}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 w-full mt-4">
              <Button variant="outline" className="h-11 rounded-xl font-semibold text-zinc-700 border-zinc-200/80 shadow-sm" onClick={printBill}><Printer className="h-4 w-4 mr-2"/> Print</Button>
              <Button variant="outline" className="h-11 rounded-xl font-semibold text-zinc-700 border-zinc-200/80 shadow-sm" onClick={shareOnWhatsApp}><MessageCircle className="h-4 w-4 mr-2"/> Share</Button>
            </div>
            <Button className="w-full h-11 rounded-xl font-semibold bg-zinc-900 text-white shadow-sm mt-2" onClick={() => setShowSuccessModal(false)}>New Sale</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* MOBILE PAYMENT VIEW (Overlay) */}
      {viewMode === 'payment' && (
        <div className="lg:hidden fixed inset-0 z-40 flex flex-col bg-zinc-50 animate-in slide-in-from-right-2 duration-200 font-sans">
           
           <div className="bg-white border-b border-zinc-200/80 p-4 flex items-center justify-between shrink-0 pt-safe shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
             <div className="flex items-center gap-3">
               <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" onClick={() => setViewMode('scan')}><ArrowLeft className="h-5 w-5 text-zinc-700" /></Button>
               <h2 className="font-semibold text-lg text-zinc-900 tracking-tight">Checkout</h2>
             </div>
             <Button variant="ghost" size="sm" onClick={clearCart} className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 h-9 px-3 rounded-lg text-xs font-semibold">Clear Cart</Button>
           </div>
           
           <div className="flex-1 overflow-y-auto p-4 space-y-6">
              
              <div className="space-y-3">
                <Label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Invoice & Customer Details</Label>
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center px-3.5 h-12 bg-white border border-zinc-200/80 rounded-xl focus-within:border-zinc-900 transition-colors shadow-sm">
                      <Receipt className="h-4 w-4 text-zinc-400 mr-2 shrink-0"/>
                      <input placeholder="Invoice Number" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} className="bg-transparent border-0 text-sm font-semibold focus:outline-none w-full placeholder:text-zinc-400"/>
                  </div>
                  <div className="flex items-center px-3.5 h-12 bg-white border border-zinc-200/80 rounded-xl focus-within:border-zinc-900 transition-colors shadow-sm">
                      <Phone className="h-4 w-4 text-zinc-400 mr-2 shrink-0"/>
                      <input placeholder="Mobile No. (Search)" value={customerPhone} onChange={e => handlePhoneChange(e.target.value)} className="bg-transparent border-0 text-sm font-semibold focus:outline-none w-full placeholder:text-zinc-400"/>
                  </div>
                  <div className="flex items-center px-3.5 h-12 bg-white border border-zinc-200/80 rounded-xl focus-within:border-zinc-900 transition-colors shadow-sm">
                      <User className="h-4 w-4 text-zinc-400 mr-2 shrink-0"/>
                      <input placeholder="Customer Name" value={customerName} onChange={e => setCustomerName(e.target.value)} className="bg-transparent border-0 text-sm font-semibold focus:outline-none w-full placeholder:text-zinc-400"/>
                  </div>
                </div>
              </div>

              {/* Order Summary */}
              <div className="space-y-3">
                 <Label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Order Summary ({cart.length})</Label>
                 <div className="bg-white border border-zinc-200/80 rounded-2xl overflow-hidden shadow-sm">
                   {cart.map(item => (
                      <div key={item.id} className="border-b border-zinc-100 last:border-0 p-3.5 flex gap-3 items-center">
                          <div className="flex flex-col items-center border border-zinc-200/80 rounded-lg overflow-hidden bg-zinc-50 text-zinc-600 shrink-0">
                              <button className="h-6 w-8 flex items-center justify-center active:bg-zinc-200" onClick={() => updateQuantity(item.id, 1)}><ChevronUp size={14} /></button>
                              <div className="h-5 w-full flex items-center justify-center font-semibold text-xs bg-white border-y border-zinc-200/80">{item.cartQuantity}</div>
                              <button className="h-6 w-8 flex items-center justify-center active:bg-zinc-200" onClick={() => updateQuantity(item.id, -1)}><ChevronDown size={14} /></button>
                          </div>
                          <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-start mb-0.5">
                                <h3 className="font-semibold text-sm text-zinc-900 leading-tight truncate pr-2">{item.item_name}</h3>
                                <span className="font-semibold text-sm text-zinc-900">₹{(item.selling_price * item.cartQuantity).toFixed(0)}</span>
                              </div>
                              <div className="text-[11px] text-zinc-500 font-medium">₹{item.selling_price} / unit</div>
                          </div>
                      </div>
                   ))}
                 </div>
              </div>

              {/* Discount Section Mobile */}
              <div className="space-y-3">
                <Label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Apply Discount</Label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-zinc-100 p-1 rounded-xl border border-zinc-200/80">
                    <Button variant="ghost" size="sm" onClick={() => setDiscountType('amount')} className={`px-3 h-10 rounded-lg text-xs font-semibold ${discountType === 'amount' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500'}`}>₹</Button>
                    <Button variant="ghost" size="sm" onClick={() => setDiscountType('percentage')} className={`px-3 h-10 rounded-lg text-xs font-semibold ${discountType === 'percentage' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500'}`}><Percent className="h-3.5 w-3.5"/></Button>
                  </div>
                  <Input type="number" placeholder="0" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className="h-12 bg-white rounded-xl border-zinc-200/80 shadow-sm font-semibold focus-visible:ring-zinc-900 text-base" />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Payment Allocation</Label>
                <Tabs defaultValue="full" onValueChange={(val: any) => setPaymentTab(val)} className="w-full">
                  <TabsList className="w-full grid grid-cols-2 bg-zinc-100 rounded-xl p-1 h-auto border border-zinc-200/50">
                    <TabsTrigger value="full" className="rounded-lg py-2.5 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm transition-all">Full Payment</TabsTrigger>
                    <TabsTrigger value="advance" className="rounded-lg py-2.5 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm transition-all">Part Payment</TabsTrigger>
                  </TabsList>

                  <div className="mt-3">
                    <TabsContent value="full" className="m-0 space-y-3 animate-in fade-in">
                      <div className="grid grid-cols-3 gap-2">
                        <button className={`h-12 rounded-xl text-xs font-semibold transition-all border shadow-sm ${paymentMethod === 'cash' ? 'bg-zinc-900 border-zinc-900 text-white' : 'bg-white border-zinc-200/80 text-zinc-700'}`} onClick={() => setPaymentMethod('cash')}>Cash</button>
                        <button className={`h-12 rounded-xl text-xs font-semibold transition-all border shadow-sm ${paymentMethod === 'online' ? 'bg-zinc-900 border-zinc-900 text-white' : 'bg-white border-zinc-200/80 text-zinc-700'}`} onClick={() => setPaymentMethod('online')}>Online</button>
                        <button className={`h-12 rounded-xl text-xs font-semibold transition-all border shadow-sm ${paymentMethod === 'unpaid' ? 'bg-zinc-900 border-zinc-900 text-white' : 'bg-white border-zinc-200/80 text-zinc-700'}`} onClick={() => setPaymentMethod('unpaid')}>Unpaid</button>
                      </div>
                    </TabsContent>

                    <TabsContent value="advance" className="m-0 space-y-3 animate-in fade-in">
                      <div className="p-4 bg-white border border-zinc-200/80 rounded-2xl space-y-3 shadow-sm">
                        <Label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Advance Collected Today</Label>
                        <div className="flex items-center gap-2">
                          <span className="text-xl font-bold text-zinc-400">₹</span>
                          <Input type="number" className="h-12 font-bold text-lg bg-zinc-50 border-zinc-200/80 rounded-xl focus-visible:ring-zinc-900" placeholder="0.00" value={advanceAmount} onChange={e => setAdvanceAmount(e.target.value)} />
                        </div>
                        <div className="text-xs font-semibold text-zinc-600 flex justify-between pt-2.5 border-t border-zinc-100">
                          <span>Balance Due Later:</span>
                          <span className="text-amber-600">₹{Math.max(0, finalTotal - parseFloat(advanceAmount || '0')).toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button className={`h-12 rounded-xl text-xs font-semibold transition-all border shadow-sm ${paymentMethod === 'cash' ? 'bg-zinc-900 border-zinc-900 text-white' : 'bg-white border-zinc-200/80 text-zinc-700'}`} onClick={() => setPaymentMethod('cash')}>Cash Advance</button>
                        <button className={`h-12 rounded-xl text-xs font-semibold transition-all border shadow-sm ${paymentMethod === 'online' ? 'bg-zinc-900 border-zinc-900 text-white' : 'bg-white border-zinc-200/80 text-zinc-700'}`} onClick={() => setPaymentMethod('online')}>Online Advance</button>
                      </div>
                    </TabsContent>
                  </div>
                </Tabs>
              </div>
           </div>
           
           <div className="p-4 bg-white border-t border-zinc-200/80 shrink-0 pb-safe shadow-[0_-1px_3px_rgba(0,0,0,0.02)] space-y-2">
             <div className="flex justify-between items-end px-1 pb-1">
                 <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Total Amount</span>
                 <span className="font-bold text-2xl text-zinc-900 leading-none tracking-tight">₹{finalTotal.toFixed(0)}</span>
             </div>
             <Button size="lg" className="w-full h-14 text-base font-semibold rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white shadow-sm" onClick={completeSale} disabled={isProcessing}>
               {paymentTab === 'advance' ? `Record Advance` : `Confirm & Pay`}
             </Button>
           </div>
        </div>
      )}

      {/* POS LAYOUT (Desktop) */}
      <div className={`flex h-[100dvh] lg:h-[calc(100vh-4rem)] bg-zinc-50 overflow-hidden relative font-sans ${viewMode === 'payment' ? 'hidden lg:flex' : 'flex'}`}>
        
        {/* LEFT: MINIMAL VERTICAL STRIP */}
        <div className="w-[85px] lg:w-[100px] bg-white border-r border-zinc-200/80 flex flex-col shrink-0 z-20 overflow-y-auto hidden-scrollbar pb-24 lg:pb-0 shadow-[1px_0_3px_rgba(0,0,0,0.01)]">
          <button onClick={() => setSelectedCategory("ALL")} className={`w-full py-4 px-2 flex flex-col items-center justify-center gap-2 transition-colors border-l-2 ${selectedCategory === "ALL" ? 'bg-zinc-50 border-zinc-900' : 'border-transparent text-zinc-500 hover:bg-zinc-50/50'}`}>
            <LayoutGrid size={20} className={selectedCategory === "ALL" ? "text-zinc-900" : "text-zinc-400"} />
            <span className={`text-[10px] font-semibold tracking-wider text-center uppercase ${selectedCategory === "ALL" ? 'text-zinc-900' : ''}`}>ALL</span>
          </button>

          {quickCategories.map((cat) => {
            const isActive = selectedCategory === cat;
            return (
              <button key={cat} onClick={() => setSelectedCategory(cat)} className={`w-full py-4 px-2 flex flex-col items-center justify-center gap-2 transition-colors border-l-2 ${isActive ? 'bg-zinc-50 border-zinc-900' : 'border-transparent text-zinc-500 hover:bg-zinc-50/50'}`}>
                <div className={`h-9 w-9 rounded-xl flex items-center justify-center font-semibold text-sm transition-colors border ${isActive ? 'bg-white border-zinc-200 shadow-sm text-zinc-900' : 'bg-transparent border-transparent text-zinc-500'}`}>
                  {cat.charAt(0)}
                </div>
                <span className={`text-[10px] font-semibold tracking-wider text-center uppercase line-clamp-2 leading-tight px-1 ${isActive ? 'text-zinc-900' : ''}`}>{cat}</span>
              </button>
            )
          })}
        </div>

        {/* CENTER: ITEMS GRID */}
        <div className="flex-1 flex flex-col min-w-0 bg-zinc-50/50 relative">
          
          <div className="bg-white p-3 lg:p-4 border-b border-zinc-200/80 z-10 shrink-0 flex flex-col md:flex-row gap-3 shadow-[0_1px_3px_rgba(0,0,0,0.01)]">
             <div className="flex gap-2 w-full md:flex-1">
               <div className="relative flex-1">
                 <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                 <Input 
                   placeholder="Search items or scan barcode..." 
                   className="pl-10 h-11 text-sm font-medium bg-zinc-50 border-zinc-200/80 focus-visible:ring-zinc-900 rounded-xl w-full shadow-sm"
                   value={searchTerm} onChange={e => setSearchTerm(e.target.value)} ref={searchInputRef}
                   onKeyDown={(e) => e.key === "Enter" && searchTerm && (addToCartByCode(searchTerm))}
                 />
               </div>
               
               <Button variant="outline" className="h-11 w-11 md:w-auto rounded-xl border-zinc-200/80 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 shrink-0 p-0 md:px-4 shadow-sm" onClick={() => setShowCustomItemModal(true)}>
                 <Edit3 className="h-4 w-4 md:mr-2" />
                 <span className="hidden md:inline font-semibold text-sm">Custom Line Item</span>
               </Button>
             </div>
             
             <div className="flex items-center gap-2 w-full md:w-auto">
               <div className="flex items-center bg-zinc-100 p-1 rounded-xl border border-zinc-200/80 flex-1 md:flex-none">
                 <Button variant="ghost" className={`rounded-lg text-xs px-4 h-9 w-1/2 md:w-auto font-semibold ${!isReturnMode ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`} onClick={() => setIsReturnMode(false)}>Sale</Button>
                 <Button variant="ghost" className={`rounded-lg text-xs px-4 h-9 w-1/2 md:w-auto font-semibold ${isReturnMode ? 'bg-white text-rose-600 shadow-sm' : 'text-zinc-500 hover:text-rose-600'}`} onClick={() => { setIsReturnMode(true); clearCart(); }}>Return</Button>
               </div>
             </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 lg:p-6 pb-28 lg:pb-6">
             {displayItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-400 text-sm font-medium">
                  <LayoutGrid className="h-10 w-10 mb-3 opacity-20" /> No items found
                </div>
             ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                  {displayItems.map((item) => {
                    const cartItem = cart.find(i => i.id === item.id);
                    const qtyInCart = cartItem?.cartQuantity || 0;
                    return (
                      <Card key={item.id} className={`overflow-hidden transition-all duration-150 border flex flex-col h-[130px] lg:h-[140px] rounded-2xl shadow-sm ${qtyInCart > 0 ? (isReturnMode ? 'border-rose-300 bg-rose-50/30' : 'border-zinc-900 bg-zinc-50/50') : 'border-zinc-200/80 bg-white hover:border-zinc-300'}`}>
                        <div className="p-3.5 pb-0 flex justify-between items-start">
                           <StockIndicator quantity={item.quantity} />
                           <span className="font-semibold text-sm text-zinc-900">₹{item.selling_price}</span>
                        </div>
                        <div className="px-3.5 pt-2 flex-1 flex flex-col mt-auto">
                           <h3 className="font-semibold text-[13px] lg:text-sm text-zinc-800 leading-tight line-clamp-2">{item.item_name}</h3>
                        </div>
                        <div className="p-3 pt-2">
                           {qtyInCart === 0 ? (
                              <Button variant="outline" className={`w-full h-9 rounded-xl font-semibold text-xs transition-colors ${isReturnMode ? 'text-rose-600 border-rose-200 hover:bg-rose-50' : 'text-zinc-700 border-zinc-200/80 shadow-sm hover:bg-zinc-50 hover:text-zinc-900'}`} onClick={() => handleAddToCart(item, 1)}>Add</Button>
                           ) : (
                              <div className={`flex items-center justify-between rounded-xl h-9 px-1 shadow-sm ${isReturnMode ? 'bg-rose-600 text-white' : 'bg-zinc-900 text-white'}`}>
                                 <button className="w-9 h-full flex items-center justify-center hover:bg-white/20 transition-colors rounded-l-xl" onClick={() => updateQuantity(item.id, -1)}><Minus size={14}/></button>
                                 <span className="text-xs font-semibold">{qtyInCart}</span>
                                 <button className="w-9 h-full flex items-center justify-center hover:bg-white/20 transition-colors rounded-r-xl" onClick={() => updateQuantity(item.id, 1)}><Plus size={14}/></button>
                              </div>
                           )}
                        </div>
                      </Card>
                    )
                  })}
                </div>
             )}
          </div>
        </div>

        {/* RIGHT: DESKTOP CART */}
        <div className="hidden lg:flex w-[380px] xl:w-[400px] bg-white border-l border-zinc-200/80 z-30 flex-col h-full shrink-0 shadow-[-1px_0_3px_rgba(0,0,0,0.01)]">
            
            <div className="p-5 border-b border-zinc-200/80 flex justify-between items-center bg-zinc-50/40">
              <div>
                <h2 className="font-semibold text-base text-zinc-900 tracking-tight">Current Bill</h2>
                <div className="flex items-center gap-1.5 mt-0.5 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                   <User size={12} /> {billingUser.name}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={clearCart} className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 h-9 px-3 rounded-lg text-xs font-semibold border border-transparent hover:border-rose-100 transition-all">Clear</Button>
            </div>

            <div className="flex-1 flex flex-col overflow-y-auto p-4 space-y-0 bg-[#fafafa]">
                {/* Desktop Invoice Number Input */}
                <div className="mb-4">
                  <Label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider ml-1 mb-1 block">Invoice No.</Label>
                  <div className="flex items-center px-3 h-10 bg-white border border-zinc-200/80 rounded-xl focus-within:border-zinc-900 transition-colors shadow-sm">
                      <Receipt className="h-3.5 w-3.5 text-zinc-400 mr-2 shrink-0"/>
                      <input placeholder="INV-001" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} className="bg-transparent border-0 text-sm font-semibold focus:outline-none w-full placeholder:text-zinc-400"/>
                  </div>
                </div>

                {cart.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-400">
                       <ShoppingCart className="h-10 w-10 mb-3 opacity-30" />
                       <span className="font-semibold text-sm">Cart is empty</span>
                    </div>
                ) : (
                    cart.map((item) => (
                        <div key={item.id} className="bg-white border border-zinc-200/80 rounded-xl mb-2 p-3 flex gap-3 items-center group shadow-sm hover:shadow-md transition-all">
                            <div className="flex flex-col items-center border border-zinc-200/80 rounded-lg overflow-hidden bg-zinc-50 text-zinc-600 shrink-0">
                                <button className="h-6 w-8 flex items-center justify-center hover:bg-zinc-200 transition-colors" onClick={() => updateQuantity(item.id, 1)}><ChevronUp size={14} /></button>
                                <div className="h-5 w-full flex items-center justify-center font-semibold text-xs bg-white border-y border-zinc-200/80">{item.cartQuantity}</div>
                                <button className="h-6 w-8 flex items-center justify-center hover:bg-zinc-200 transition-colors" onClick={() => updateQuantity(item.id, -1)}><ChevronDown size={14} /></button>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start mb-0.5">
                                  <h3 className="font-semibold text-sm text-zinc-900 leading-tight truncate pr-2">{item.item_name}</h3>
                                  <span className="font-bold text-sm text-zinc-900">₹{(item.selling_price * item.cartQuantity).toFixed(0)}</span>
                                </div>
                                <div className="text-[11px] text-zinc-500 font-medium">₹{item.selling_price} / unit</div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Desktop Discount & Checkout Panel */}
            <div className="border-t border-zinc-200/80 bg-white p-5 z-10 space-y-4">
                
                {/* Discount Setup */}
                <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Discount</span>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center bg-zinc-100 p-1 rounded-lg border border-zinc-200/80">
                      <button onClick={() => setDiscountType('amount')} className={`px-2.5 h-7 rounded text-[11px] font-semibold transition-all ${discountType === 'amount' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500'}`}>₹</button>
                      <button onClick={() => setDiscountType('percentage')} className={`px-2.5 h-7 rounded text-[11px] font-semibold transition-all ${discountType === 'percentage' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500'}`}><Percent className="h-3 w-3"/></button>
                    </div>
                    <Input type="number" placeholder="0" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className="h-9 w-24 bg-white rounded-lg border-zinc-200/80 shadow-sm font-semibold focus-visible:ring-zinc-900 text-sm text-right" />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center px-3 h-10 bg-white border border-zinc-200/80 rounded-xl flex-1 focus-within:border-zinc-900 transition-colors shadow-sm">
                      <Phone className="h-4 w-4 text-zinc-400 mr-2 shrink-0"/>
                      <input placeholder="Mobile No." value={customerPhone} onChange={e => handlePhoneChange(e.target.value)} className="bg-transparent border-0 text-sm font-semibold focus:outline-none w-full placeholder:text-zinc-400"/>
                  </div>
                  <div className="flex items-center px-3 h-10 bg-white border border-zinc-200/80 rounded-xl flex-1 focus-within:border-zinc-900 transition-colors shadow-sm">
                      <User className="h-4 w-4 text-zinc-400 mr-2 shrink-0"/>
                      <input placeholder="Customer Name" value={customerName} onChange={e => setCustomerName(e.target.value)} className="bg-transparent border-0 text-sm font-semibold focus:outline-none w-full placeholder:text-zinc-400"/>
                  </div>
                </div>

                <Tabs defaultValue="full" onValueChange={(val: any) => setPaymentTab(val)} className="w-full">
                  <TabsList className="w-full grid grid-cols-2 bg-zinc-100 rounded-xl p-1 h-auto border border-zinc-200/50">
                    <TabsTrigger value="full" className="rounded-lg py-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm">Full Payment</TabsTrigger>
                    <TabsTrigger value="advance" className="rounded-lg py-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm">Part Payment</TabsTrigger>
                  </TabsList>

                  <div className="mt-4">
                    <TabsContent value="full" className="m-0 space-y-3 animate-in fade-in">
                      <div className="grid grid-cols-3 gap-2">
                        <button className={`h-10 rounded-xl text-xs font-semibold transition-all border shadow-sm ${paymentMethod === 'cash' ? 'bg-zinc-900 border-zinc-900 text-white' : 'bg-white border-zinc-200/80 text-zinc-700 hover:border-zinc-300'}`} onClick={() => setPaymentMethod('cash')}>Cash</button>
                        <button className={`h-10 rounded-xl text-xs font-semibold transition-all border shadow-sm ${paymentMethod === 'online' ? 'bg-zinc-900 border-zinc-900 text-white' : 'bg-white border-zinc-200/80 text-zinc-700 hover:border-zinc-300'}`} onClick={() => setPaymentMethod('online')}>Online / UPI</button>
                        <button className={`h-10 rounded-xl text-xs font-semibold transition-all border shadow-sm ${paymentMethod === 'unpaid' ? 'bg-zinc-900 border-zinc-900 text-white' : 'bg-white border-zinc-200/80 text-zinc-700 hover:border-zinc-300'}`} onClick={() => setPaymentMethod('unpaid')}>Unpaid</button>
                      </div>
                    </TabsContent>

                    <TabsContent value="advance" className="m-0 space-y-3 animate-in fade-in">
                      <div className="p-4 bg-zinc-50/50 border border-zinc-200/80 rounded-2xl space-y-3 shadow-sm">
                        <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Advance Paid Today</Label>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold text-zinc-400">₹</span>
                          <Input type="number" className="h-10 font-bold text-base bg-white border-zinc-200/80 rounded-xl shadow-sm focus-visible:ring-zinc-900" placeholder="0.00" value={advanceAmount} onChange={e => setAdvanceAmount(e.target.value)} />
                        </div>
                        <div className="text-xs font-semibold text-zinc-600 flex justify-between pt-2.5 border-t border-zinc-200/80 mt-2">
                          <span>Balance Due Later:</span>
                          <span className="font-bold text-amber-600">₹{Math.max(0, finalTotal - parseFloat(advanceAmount || '0')).toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button className={`h-10 rounded-xl text-xs font-semibold transition-all border shadow-sm ${paymentMethod === 'cash' ? 'bg-zinc-900 border-zinc-900 text-white' : 'bg-white border-zinc-200/80 text-zinc-700 hover:border-zinc-300'}`} onClick={() => setPaymentMethod('cash')}>Cash Advance</button>
                        <button className={`h-10 rounded-xl text-xs font-semibold transition-all border shadow-sm ${paymentMethod === 'online' ? 'bg-zinc-900 border-zinc-900 text-white' : 'bg-white border-zinc-200/80 text-zinc-700 hover:border-zinc-300'}`} onClick={() => setPaymentMethod('online')}>Online Advance</button>
                      </div>
                    </TabsContent>
                  </div>
                </Tabs>

                <div className="pt-2">
                   <div className="flex justify-between items-end mb-3 px-1">
                       <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Total Amount</span>
                       <span className="font-bold text-3xl text-zinc-900 leading-none tracking-tight">₹{finalTotal.toFixed(0)}</span>
                   </div>
                   <Button className="w-full h-14 font-semibold text-base rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white shadow-sm transition-all" onClick={completeSale} disabled={isProcessing || cart.length === 0}>
                       {paymentTab === 'advance' ? 'Record Advance' : 'Checkout & Generate Invoice'}
                   </Button>
                </div>
            </div>
        </div>

      </div>
    </AppLayout>
  );
}