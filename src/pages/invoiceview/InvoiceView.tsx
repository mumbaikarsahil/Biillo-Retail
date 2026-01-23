import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Phone, ShoppingBag, Loader2 } from "lucide-react";

export default function InvoiceView() {
  const { id } = useParams(); // Get the Bill ID from the URL
  const [bill, setBill] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBill();
  }, [id]);

  const fetchBill = async () => {
    if (!id) return;
    try {
      // CHANGE 1: Search by 'share_id' instead of 'id'
      const { data: billData, error: billError } = await supabase
        .from("bills")
        .select("*")
        .eq("share_id", id) // <--- This is the key security change
        .single();
      
      if (billError) throw billError;
  
      // CHANGE 2: Use the real numeric ID from the fetched bill to get items
      // (We still link items internally using the numeric ID, which is fine)
      const { data: itemsData, error: itemsError } = await supabase
        .from("bill_items")
        .select("*, items(item_name)")
        .eq("bill_id", billData.id); // <--- Use the internal ID here
  
      if (itemsError) throw itemsError;
  
      setBill(billData);
      setItems(itemsData.map((i: any) => ({
        ...i,
        item_name: i.items?.item_name || "Unknown Item"
      })));
    } catch (error) {
      console.error("Error fetching invoice:", error);
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!bill) return <div className="h-screen flex items-center justify-center text-muted-foreground">Invoice not found.</div>;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 flex justify-center">
      <Card className="w-full max-w-md shadow-lg bg-white h-fit">
        {/* Header */}
        <div className="bg-primary/10 p-6 text-center border-b border-primary/10">
          <div className="mx-auto w-12 h-12 bg-white rounded-full flex items-center justify-center mb-3 shadow-sm">
            <ShoppingBag className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-primary">SAKHI COLLECTIONS</h1>
          <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground mt-1">
            <MapPin className="h-3 w-3" /> <span>Mumbai, India</span>
          </div>
        </div>

        <CardContent className="p-6 space-y-6">
          {/* Greeting */}
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-black">Thank You!</h2>
            <p className="text-sm text-muted-foreground">
              Hi {bill.customer_name || "Customer"}, here is your receipt.
            </p>
          </div>

          {/* Bill Meta */}
          <div className="flex justify-between text-sm py-3 border-y border-dashed border-gray-300">
            <div className="text-muted-foreground">
              <p>Date</p>
              <p>Invoice #</p>
            </div>
            <div className="text-right font-medium">
              <p>{new Date(bill.created_at).toLocaleDateString()}</p>
              <p>{bill.id.toString().slice(0, 8)}</p>
            </div>
          </div>

          {/* Items List */}
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span>{item.quantity} x {item.item_name}</span>
                <span className="font-medium">₹{Math.abs(item.price_at_sale * item.quantity)}</span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="pt-4 border-t border-gray-200 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>₹{Math.abs(bill.total_amount)}</span>
            </div>
            {bill.discount_amount > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Discount</span>
                <span>- ₹{bill.discount_amount}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-black pt-2 border-t border-dashed mt-2">
              <span>Total</span>
              <span>₹{Math.abs(bill.final_amount)}</span>
            </div>
          </div>

          {/* Footer Contact */}
          <div className="bg-gray-50 -mx-6 -mb-6 p-4 text-center text-xs text-muted-foreground mt-6 rounded-b-xl">
             <p className="mb-2">Questions?</p>
             <a href="tel:+919876543210" className="inline-flex items-center gap-2 text-primary font-bold border border-primary/20 px-3 py-1 rounded-full bg-white">
                <Phone className="h-3 w-3" /> +91 98765 43210
             </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}