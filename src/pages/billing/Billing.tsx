import { useState, useEffect, useRef, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase, CartItem, Item } from "@/lib/supabase";
import {
  Camera,
  CameraOff,
  Minus,
  Plus,
  Trash2,
  ShoppingCart,
  RotateCcw,
  Printer,
  MessageCircle,
  Percent,
  DollarSign,
} from "lucide-react";

export default function Billing() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [manualCode, setManualCode] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isReturnMode, setIsReturnMode] = useState(false);
  const [discountType, setDiscountType] = useState<"flat" | "percent">("flat");
  const [discountValue, setDiscountValue] = useState(0);
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
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
  const discountAmount = discountType === "percent" ? (subtotal * discountValue) / 100 : discountValue;
  const finalTotal = Math.max(0, subtotal - discountAmount);

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

        // Check if this is a pack item (pieces_per_box > 1)
        if (item.pieces_per_box > 1) {
          setPackItemModal({
            open: true,
            item,
            piecesPerBox: item.pieces_per_box
          });
          return;
        }

        // For non-pack items, add directly to cart
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

  // Handle manual code input change
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
  
  // Handle item selection from dropdown
  const handleSelectItem = (item: Item) => {
    setManualCode(item.item_code);
    setShowDropdown(false);
    addToCart(item.item_code);
  };
  
  // Handle click outside to close dropdown
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
    setDiscountValue(0);
    setCustomerPhone("");
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

  const printBill = () => {
    if (!completedBill) return;

    // Ensure we have a string ID and handle potential undefined values
    const billId = completedBill.id ? String(completedBill.id) : 'N/A';
    const billDate = completedBill.created_at ? new Date(completedBill.created_at).toLocaleDateString() : new Date().toLocaleDateString();
    
    // Create a temporary div to hold the bill content
    const printContent = `
      <div style="font-family: 'Roboto Mono', monospace; max-width: 300px; margin: 0 auto; padding: 20px;">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px dashed #ddd;">
          <h1 style="font-size: 20px; font-weight: 700; margin: 0; text-transform: uppercase; letter-spacing: 1px;">
            Sakhi Collections
          </h1>
          <div style="font-size: 16px; margin: 5px 0; font-weight: 500;">Retail Invoice</div>
          <div style="font-size: 12px; color: #666; margin: 5px 0 10px;">
            Opposite State bank of India, Near Ambika Mata Mandir
          </div>
        </div>
        
        <!-- Bill Info -->
        <div style="display: flex; justify-content: space-between; margin: 10px 0; font-size: 13px;">
          <div>Date: ${billDate}</div>
          <div>Bill #: ${billId.slice(0, 8).toUpperCase()}</div>
        </div>
        
        <!-- Items Table -->
        <table style="width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 12px;">
          <thead>
            <tr>
              <th style="text-align: left; border-bottom: 1px dashed #ddd; padding: 5px 0; font-weight: 500; width: 50%;">Item</th>
              <th style="text-align: right; width: 15%; border-bottom: 1px dashed #ddd; padding: 5px 0; font-weight: 500;">Qty</th>
              <th style="text-align: right; width: 35%; border-bottom: 1px dashed #ddd; padding: 5px 0; font-weight: 500;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${completedBill.items
              .map(
                (item: CartItem) => `
              <tr>
                <td style="padding: 4px 0; border-bottom: 1px dashed #eee; vertical-align: top;">
                  <div style="font-weight: 500;">${item.item_name}</div>
                  <div style="font-size: 11px; color: #555;">
                    ${item.brand_name ? item.brand_name + ' • ' : ''}${item.item_code || ''}
                  </div>
                </td>
                <td style="text-align: right; padding: 4px 0; border-bottom: 1px dashed #eee; vertical-align: top;">${item.cartQuantity}</td>
                <td style="text-align: right; padding: 4px 0; border-bottom: 1px dashed #eee; vertical-align: top;">₹${(item.selling_price * item.cartQuantity).toFixed(2)}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
        
        <!-- Divider -->
        <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>
        
        <!-- Totals -->
        <table style="width: 100%; margin-bottom: 20px;">
          <tr>
            <td>Subtotal:</td>
            <td style="text-align: right;">₹${Math.abs(completedBill.total_amount).toFixed(2)}</td>
          </tr>
          ${completedBill.discount_amount > 0
            ? `
              <tr>
                <td>Discount:</td>
                <td style="text-align: right;">-₹${completedBill.discount_amount.toFixed(2)}</td>
              </tr>
            `
            : ""
          }
          <tr style="font-weight: 500;">
            <td><strong>Total:</strong></td>
            <td style="text-align: right;"><strong>₹${Math.abs(completedBill.final_amount).toFixed(2)}</strong></td>
          </tr>
        </table>
        
        <!-- Thank You -->
        <div style="text-align: center; margin-top: 20px; font-style: italic; font-size: 13px;">
          <div>Thank You</div>
          <div>Visit Again</div>
        </div>
      </div>
    `;

    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({
        title: "Print Error",
        description: "Please allow popups to print the bill",
        variant: "destructive",
      });
      return;
    }

    // Write the content to the new window
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bill #${billId.slice(0, 8)}</title>
        <meta charset="UTF-8">
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500;700&display=swap');
          @media print {
            @page { margin: 0; size: 80mm auto; }
            body { margin: 0; padding: 0; }
            .no-print { display: none !important; }
          }
          body { 
            font-family: 'Roboto Mono', monospace; 
            margin: 0;
            padding: 0;
          }
        </style>
      </head>
      <body>
        ${printContent}
        <div class="no-print" style="text-align: center; margin-top: 20px;">
          <button onclick="window.print()" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; margin-right: 10px;">
            Print Bill
          </button>
          <button onclick="window.close()" style="padding: 8px 16px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">
            Close
          </button>
        </div>
        <script>
          // Try to print automatically
          setTimeout(() => {
            window.print();
          }, 300);
        </script>
      </body>
      </html>
    `);
    
    printWindow.document.close();
  };

  const shareOnWhatsApp = () => {
    if (!completedBill) return;
    const items = completedBill.items
      .map((item: CartItem) => `${item.item_name} x${item.cartQuantity} = ₹${item.selling_price * item.cartQuantity}`)
      .join("\n");

    const message = encodeURIComponent(
      `*StockFlow Bill*\n\n${items}\n\nSubtotal: ₹${Math.abs(completedBill.total_amount)}\nDiscount: ₹${completedBill.discount_amount}\n*Total: ₹${Math.abs(completedBill.final_amount)}*`
    );

    window.open(`https://wa.me/?text=${message}`, "_blank");
  };

  const startScanner = async () => {
    try {
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          addToCart(decodedText);
        },
        () => {}
      );

      setIsScanning(true);
    } catch (error) {
      toast({
        title: "Camera Error",
        description: "Could not access camera",
        variant: "destructive",
      });
    }
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

  // Pack Item Selection Modal
  // Edit Quantity Modal
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
            {editQuantityModal.item?.pieces_per_box > 1 && (
              <p className="text-xs text-muted-foreground">
                {editQuantityModal.item.pieces_per_box} pieces per unit
              </p>
            )}
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

  // Pack Item Selection Modal
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

  return (
    <AppLayout>
      <PackItemModal />
      <EditQuantityModal />
      <div className="animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {isReturnMode ? "Process Returns" : "Billing"}
            </h1>
            <p className="text-muted-foreground">Scan items or enter codes manually</p>
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="return-mode" className="text-sm">
              Return Mode
            </Label>
            <Switch
              id="return-mode"
              checked={isReturnMode}
              onCheckedChange={(checked) => {
                setIsReturnMode(checked);
                clearCart();
              }}
            />
            {isReturnMode && <Badge variant="destructive">Returns</Badge>}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Scanner Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5" />
                Scan Items
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                id="qr-reader"
                className={`w-full aspect-video bg-muted rounded-lg overflow-hidden ${!isScanning ? "hidden" : ""}`}
              />
              {!isScanning && (
                <div className="w-full aspect-video bg-muted rounded-lg flex items-center justify-center">
                  <CameraOff className="h-12 w-12 text-muted-foreground" />
                </div>
              )}
              <Button
                onClick={isScanning ? stopScanner : startScanner}
                className="w-full"
                variant={isScanning ? "destructive" : "default"}
              >
                {isScanning ? (
                  <>
                    <CameraOff className="mr-2 h-4 w-4" /> Stop Scanner
                  </>
                ) : (
                  <>
                    <Camera className="mr-2 h-4 w-4" /> Start Scanner
                  </>
                )}
              </Button>

              <div className="flex gap-2 relative" ref={searchInputRef}>
                <div className="relative flex-1">
                  <Input
                    placeholder="Search by item code or name"
                    value={manualCode}
                    onChange={handleManualCodeChange}
                    onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && manualCode) {
                        addToCart(manualCode);
                        setManualCode("");
                        setSearchResults([]);
                      }
                    }}
                    className="w-full"
                  />
                  {showDropdown && searchResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                      {searchResults.map((item) => (
                        <div
                          key={item.id}
                          className="px-4 py-2 hover:bg-gray-100 cursor-pointer flex justify-between items-center"
                          onClick={() => handleSelectItem(item)}
                        >
                          <div>
                            <div className="font-medium">{item.item_name}</div>
                            <div className="text-xs text-gray-500">
                              {item.item_code} {item.brand_name ? `• ${item.brand_name}` : ''}
                            </div>
                          </div>
                          <div className="text-sm font-medium">
                            ₹{item.selling_price}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  onClick={() => {
                    if (manualCode) {
                      addToCart(manualCode);
                      setManualCode("");
                      setSearchResults([]);
                    }
                  }}
                  disabled={!manualCode}
                >
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Cart Section */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                {isReturnMode ? "Return Cart" : "Cart"} ({cart.length})
              </CardTitle>
              {cart.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearCart}>
                  <Trash2 className="h-4 w-4 mr-1" /> Clear
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {cart.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No items in cart. Scan or add items.
                </p>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {cart.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{item.item_name}</p>
                          {item.size && item.size !== 'Free Size' && (
                            <span className="text-xs bg-muted-foreground/10 text-muted-foreground px-2 py-0.5 rounded-full">
                              {item.size}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          ₹{item.selling_price} × {item.cartQuantity}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => updateQuantity(item.id, -1)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <div 
                          className="flex flex-col items-center cursor-pointer hover:bg-muted/50 rounded px-1"
                          onClick={() => handleEditQuantity(item)}
                        >
                          <span className="w-6 text-center">
                            {item.cartQuantity}
                          </span>
                          {item.pieces_per_box > 1 && (
                            <span className="text-xs text-muted-foreground">
                              {item.cartQuantity >= item.pieces_per_box 
                                ? `${Math.floor(item.cartQuantity / item.pieces_per_box)} unit${Math.floor(item.cartQuantity / item.pieces_per_box) > 1 ? 's' : ''}`
                                : `${item.cartQuantity} pc${item.cartQuantity > 1 ? 's' : ''}`}
                            </span>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => updateQuantity(item.id, 1)}
                          disabled={!isReturnMode && item.cartQuantity >= item.quantity}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive"
                          onClick={() => removeFromCart(item.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!isReturnMode && cart.length > 0 && (
                <div className="space-y-3 pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <Label className="w-20">Discount</Label>
                    <Button
                      variant={discountType === "flat" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setDiscountType("flat")}
                    >
                      <DollarSign className="h-3 w-3" />
                    </Button>
                    <Button
                      variant={discountType === "percent" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setDiscountType("percent")}
                    >
                      <Percent className="h-3 w-3" />
                    </Button>
                    <Input
                      type="number"
                      className="w-24"
                      value={discountValue || ""}
                      onChange={(e) => setDiscountValue(Number(e.target.value))}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Customer Phone (optional)</Label>
                    <Input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="+91 XXXXXXXXXX"
                    />
                  </div>
                </div>
              )}

              <div className="pt-4 border-t space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span>₹{subtotal.toFixed(2)}</span>
                </div>
                {discountAmount > 0 && !isReturnMode && (
                  <div className="flex justify-between text-sm text-success">
                    <span>Discount</span>
                    <span>-₹{discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold">
                  <span>{isReturnMode ? "Refund Total" : "Total"}</span>
                  <span className={isReturnMode ? "text-destructive" : "text-primary"}>
                    ₹{finalTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={completeSale}
                disabled={cart.length === 0 || isProcessing}
              >
                {isProcessing ? (
                  "Processing..."
                ) : isReturnMode ? (
                  <>
                    <RotateCcw className="mr-2 h-4 w-4" /> Process Return
                  </>
                ) : (
                  "Complete Sale"
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Success Modal */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-center">
              {isReturnMode ? "Return Processed!" : "Sale Complete!"}
            </DialogTitle>
          </DialogHeader>
          <div className="text-center space-y-4">
            <div className="text-4xl font-bold text-primary">
              ₹{completedBill ? Math.abs(completedBill.final_amount).toFixed(2) : "0.00"}
            </div>
            <div className="flex gap-3 justify-center">
              <Button onClick={printBill}>
                <Printer className="mr-2 h-4 w-4" /> Print Bill
              </Button>
              <Button variant="outline" onClick={shareOnWhatsApp}>
                <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp
              </Button>
            </div>
            <Button variant="ghost" onClick={() => setShowSuccessModal(false)} className="w-full">
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
