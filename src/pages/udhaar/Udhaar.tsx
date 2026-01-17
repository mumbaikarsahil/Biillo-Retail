import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase, Bill } from "@/lib/supabase";
import {
  Search,
  Phone,
  MessageCircle,
  CheckCircle2,
  AlertCircle,
  Wallet,
  ArrowUpRight
} from "lucide-react";
import { format } from "date-fns";

export default function Udhaar() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [totalPending, setTotalPending] = useState(0);
  
  // Settle Modal State
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "online">("cash");
  const [isSettling, setIsSettling] = useState(false);
  
  const { toast } = useToast();

  useEffect(() => {
    fetchPendingBills();
  }, []);

  const fetchPendingBills = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("bills")
        .select("*")
        .eq("payment_status", "pending") // Only fetch unpaid bills
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      const pendingBills = data || [];
      setBills(pendingBills);
      
      // Calculate total pending amount
      const total = pendingBills.reduce((sum, bill) => sum + Math.abs(bill.final_amount), 0);
      setTotalPending(total);
      
    } catch (error: any) {
      console.error("Error fetching udhaar:", error);
      toast({
        title: "Error",
        description: "Failed to load pending payments",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSettlePayment = async () => {
    if (!selectedBill) return;
    
    setIsSettling(true);
    try {
      // Update bill status to 'paid' in Supabase
      const { error } = await supabase
        .from("bills")
        .update({
          payment_status: "paid",
          payment_method: paymentMethod,
          // Optional: You could add a 'settled_at' column to your DB if you want to track when money came in
        })
        .eq("id", selectedBill.id);

      if (error) throw error;

      toast({
        title: "Payment Received",
        description: `Marked ₹${Math.abs(selectedBill.final_amount)} as paid via ${paymentMethod}`,
        variant: "default",
        className: "bg-green-50 border-green-200 text-green-900"
      });

      // Remove from local list immediately
      setBills((prev) => prev.filter((b) => b.id !== selectedBill.id));
      setTotalPending((prev) => prev - Math.abs(selectedBill.final_amount));
      setSelectedBill(null);

    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to settle payment",
        variant: "destructive",
      });
    } finally {
      setIsSettling(false);
    }
  };

  const sendWhatsAppReminder = (bill: Bill) => {
    if (!bill.customer_phone) {
      toast({ title: "No Phone", description: "Customer phone number is missing", variant: "destructive" });
      return;
    }

    const amount = Math.abs(bill.final_amount);
    const date = format(new Date(bill.created_at), "dd MMM");
    const message = encodeURIComponent(
      `Hello ${bill.customer_name || 'Customer'},\n\nThis is a gentle reminder regarding your pending payment of *₹${amount}* for purchase made on ${date} at Sakhi Collections.\n\nPlease pay at your earliest convenience.\n\nThank you!`
    );
    
    window.open(`https://wa.me/91${bill.customer_phone.replace(/\D/g,'')}?text=${message}`, "_blank");
  };

  const filteredBills = bills.filter(bill => 
    (bill.customer_name?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
    (bill.customer_phone || "").includes(searchQuery)
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <AppLayout>
      <div className="space-y-4 animate-fade-in pb-20 md:pb-0">
        
        {/* HEADER & TOTAL CARD */}
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Udhaar Register</h1>
            <p className="text-muted-foreground">Manage credit and pending payments</p>
          </div>

          <Card className="bg-orange-50 border-orange-100 shadow-sm">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-orange-800/80 mb-1">TOTAL OUTSTANDING</p>
                <div className="text-3xl font-bold text-orange-700">{formatCurrency(totalPending)}</div>
                <p className="text-xs text-orange-600 mt-1">{bills.length} customers pending</p>
              </div>
              <div className="h-12 w-12 bg-orange-100 rounded-full flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-orange-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* SEARCH BAR */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-11 bg-background"
          />
        </div>

        {/* LIST OF PENDING BILLS */}
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading pending payments...</div>
          ) : filteredBills.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3 opacity-20" />
              <p className="text-muted-foreground">
                {searchQuery ? "No matching records found" : "No pending payments! Great job."}
              </p>
            </div>
          ) : (
            filteredBills.map((bill) => (
              <Card key={bill.id} className="overflow-hidden border-l-4 border-l-orange-400">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="font-bold text-lg">{bill.customer_name || "Unknown Customer"}</div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                        <Phone className="h-3 w-3" />
                        {bill.customer_phone || "No Phone"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-orange-700">{formatCurrency(Math.abs(bill.final_amount))}</div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(bill.created_at), "dd MMM yyyy")}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-4 pt-3 border-t">
                    <Button 
                      variant="outline" 
                      className="flex-1 text-green-700 hover:text-green-800 hover:bg-green-50 border-green-200"
                      onClick={() => sendWhatsAppReminder(bill)}
                      disabled={!bill.customer_phone}
                    >
                      <MessageCircle className="h-4 w-4 mr-2" /> Remind
                    </Button>
                    <Button 
                      className="flex-1 bg-primary text-primary-foreground"
                      onClick={() => {
                        setSelectedBill(bill);
                        setPaymentMethod("cash"); // default
                      }}
                    >
                      <Wallet className="h-4 w-4 mr-2" /> Mark Paid
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* SETTLE PAYMENT MODAL */}
      <Dialog open={!!selectedBill} onOpenChange={(open) => !open && setSelectedBill(null)}>
        <DialogContent className="sm:max-w-md top-[30%] translate-y-[-30%] rounded-xl">
          <DialogHeader>
            <DialogTitle>Receive Payment</DialogTitle>
            <DialogDescription>
              Marking this bill as paid. How was the payment received?
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            <div className="bg-muted/50 p-4 rounded-lg text-center">
              <p className="text-sm text-muted-foreground mb-1">Collecting Amount</p>
              <p className="text-3xl font-bold text-foreground">
                {selectedBill ? formatCurrency(Math.abs(selectedBill.final_amount)) : "0"}
              </p>
              <p className="text-sm font-medium mt-2">{selectedBill?.customer_name}</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Payment Method</label>
              <Select 
                value={paymentMethod} 
                onValueChange={(val: "cash" | "online") => setPaymentMethod(val)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash Payment</SelectItem>
                  <SelectItem value="online">Online / UPI</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setSelectedBill(null)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={handleSettlePayment} disabled={isSettling} className="w-full sm:w-auto bg-green-600 hover:bg-green-700">
              {isSettling ? "Processing..." : "Confirm Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}