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
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const { toast } = useToast();

  const subtotal = cart.reduce((sum, item) => sum + item.selling_price * item.cartQuantity, 0);
  const discountAmount = discountType === "percent" ? (subtotal * discountValue) / 100 : discountValue;
  const finalTotal = Math.max(0, subtotal - discountAmount);

  const addToCart = useCallback(
    async (itemCode: string) => {
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

        setCart((prev) => {
          const existing = prev.find((i) => i.id === item.id);
          if (existing) {
            if (!isReturnMode && existing.cartQuantity >= item.quantity) {
              toast({
                title: "Stock Limit",
                description: "Cannot add more than available stock",
                variant: "destructive",
              });
              return prev;
            }
            return prev.map((i) =>
              i.id === item.id ? { ...i, cartQuantity: i.cartQuantity + 1 } : i
            );
          }
          return [...prev, { ...item, cartQuantity: 1 }];
        });

        toast({
          title: isReturnMode ? "Return Added" : "Item Added",
          description: `${item.item_name} - ₹${item.selling_price}`,
        });
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
                description: "Cannot exceed available stock",
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

  const removeFromCart = (itemId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== itemId));
  };

  const clearCart = () => {
    setCart([]);
    setDiscountValue(0);
    setCustomerPhone("");
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
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const billHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bill #${completedBill.id.slice(0, 8)}</title>
        <style>
          body { font-family: monospace; padding: 20px; max-width: 300px; }
          h1 { font-size: 18px; text-align: center; }
          .line { border-top: 1px dashed #000; margin: 10px 0; }
          .item { display: flex; justify-content: space-between; margin: 5px 0; }
          .total { font-weight: bold; font-size: 16px; }
        </style>
      </head>
      <body>
        <h1>StockFlow</h1>
        <p style="text-align: center;">${new Date(completedBill.created_at).toLocaleString()}</p>
        <div class="line"></div>
        ${completedBill.items
          .map(
            (item: CartItem) => `
          <div class="item">
            <span>${item.item_name} x${item.cartQuantity}</span>
            <span>₹${(item.selling_price * item.cartQuantity).toFixed(2)}</span>
          </div>
        `
          )
          .join("")}
        <div class="line"></div>
        <div class="item"><span>Subtotal</span><span>₹${Math.abs(completedBill.total_amount).toFixed(2)}</span></div>
        ${
          completedBill.discount_amount > 0
            ? `<div class="item"><span>Discount</span><span>-₹${completedBill.discount_amount.toFixed(2)}</span></div>`
            : ""
        }
        <div class="line"></div>
        <div class="item total"><span>TOTAL</span><span>₹${Math.abs(completedBill.final_amount).toFixed(2)}</span></div>
        <div class="line"></div>
        <p style="text-align: center;">Thank you!</p>
      </body>
      </html>
    `;

    printWindow.document.write(billHtml);
    printWindow.document.close();
    printWindow.print();
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

  return (
    <AppLayout>
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

              <div className="flex gap-2">
                <Input
                  placeholder="Enter item code manually"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && manualCode) {
                      addToCart(manualCode);
                      setManualCode("");
                    }
                  }}
                />
                <Button
                  onClick={() => {
                    if (manualCode) {
                      addToCart(manualCode);
                      setManualCode("");
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
                        <p className="font-medium truncate">{item.item_name}</p>
                        <p className="text-sm text-muted-foreground">
                          ₹{item.selling_price} × {item.cartQuantity}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => updateQuantity(item.id, -1)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center font-medium">{item.cartQuantity}</span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => updateQuantity(item.id, 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
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
