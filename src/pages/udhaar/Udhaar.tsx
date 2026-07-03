import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
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
  Clock,
  ArrowUpRight
} from "lucide-react";
import { format } from "date-fns";

export default function Udhaar() {
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [totalPending, setTotalPending] = useState(0);
  
  // Settle Modal State
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "online">("cash");
  const [isSettling, setIsSettling] = useState(false);
  
  const { toast } = useToast();

  const getPendingAmount = (bill: Bill) => {
    if (bill.balance_due !== undefined && bill.balance_due !== null && bill.balance_due > 0) {
      return bill.balance_due;
    }
    return Math.abs(bill.final_amount);
  };

  useEffect(() => {
    const initializeTenantData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("tenant_id")
          .eq("id", session.user.id)
          .single();

        if (profile?.tenant_id) {
          setCurrentTenantId(profile.tenant_id);
          fetchPendingBills(profile.tenant_id);
        }
      } catch (error) {
        console.error("Failed to initialize tenant data:", error);
      }
    };

    initializeTenantData();
  }, []);

  const fetchPendingBills = async (tenantId: string) => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from("bills")
        .select("*")
        .in("payment_status", ["pending", "partially_paid"]) 
        .eq("tenant_id", tenantId)       
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      const pendingBills = data || [];
      setBills(pendingBills);
      
      const total = pendingBills.reduce((sum, bill) => sum + getPendingAmount(bill), 0);
      setTotalPending(total);
      
    } catch (error: any) {
      console.error("Error fetching collections:", error);
      toast({
        title: "Error loading register",
        description: "Failed to load pending payments from the server.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSettlePayment = async () => {
    if (!selectedBill || !currentTenantId) return;
    
    setIsSettling(true);
    try {
      const { error } = await supabase
        .from("bills")
        .update({
          payment_status: "paid",
          payment_method: paymentMethod,
          balance_due: 0,
          advance_paid: Math.abs(selectedBill.final_amount) 
        })
        .eq("id", selectedBill.id)
        .eq("tenant_id", currentTenantId);

      if (error) throw error;

      const settledAmount = getPendingAmount(selectedBill);

      toast({
        title: "Payment Received",
        description: `Collected ₹${settledAmount.toFixed(0)} via ${paymentMethod.toUpperCase()}. Order fully settled!`,
      });

      setBills((prev) => prev.filter((b) => b.id !== selectedBill.id));
      setTotalPending((prev) => Math.max(0, prev - settledAmount));
      setSelectedBill(null);

    } catch (error: any) {
      toast({
        title: "Settlement Error",
        description: error.message || "Failed to update payment status in database.",
        variant: "destructive",
      });
    } finally {
      setIsSettling(false);
    }
  };

  const sendWhatsAppReminder = (bill: Bill) => {
    if (!bill.customer_phone) {
      toast({ title: "Phone Missing", description: "This record has no customer phone number attached.", variant: "destructive" });
      return;
    }

    const amount = getPendingAmount(bill);
    const date = format(new Date(bill.created_at), "dd MMM yyyy");
    const isAdvance = bill.advance_paid && bill.advance_paid > 0;
    
    const messageText = isAdvance
      ? `🙏 *Jai Ganesh!* Hello ${bill.customer_name || 'Customer'},\n\nThis is a gentle reminder regarding your order from ${date}.\n\n• Total Bill: ₹${Math.abs(bill.final_amount)}\n• Advance Paid: ₹${bill.advance_paid}\n• *Balance Due: ₹${amount}*\n\nPlease arrange to clear the pending balance at your earliest convenience.\n\nThank you!\n*श्री समर्थ कृपा गणेश कला केंद्र*`
      : `🙏 *Jai Ganesh!* Hello ${bill.customer_name || 'Customer'},\n\nThis is a gentle reminder regarding your pending payment of *₹${amount}* for purchase made on ${date}.\n\nPlease pay at your earliest convenience.\n\nThank you!\n*श्री समर्थ कृपा गणेश कला केंद्र*`;

    const message = encodeURIComponent(messageText);
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
      <div className="space-y-6 animate-fade-in pb-24 md:pb-8 max-w-6xl mx-auto font-sans">
        
        {/* --- HEADER & METRIC CARD --- */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 z-20 bg-zinc-50/80 backdrop-blur-md py-4 -mx-4 px-4 md:static md:bg-transparent md:p-0 md:mx-0 border-b border-zinc-200/60 md:border-0">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900">Pending Ledger</h1>
            <p className="text-muted-foreground mt-0.5 text-xs sm:text-sm font-medium">Track advances and unsettled invoices</p>
          </div>

          <Card className="shadow-[0_1px_3px_rgba(0,0,0,0.02)] border border-zinc-200/80 bg-white rounded-2xl md:min-w-[280px]">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Total Outstanding</p>
                <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900">{formatCurrency(totalPending)}</div>
                <p className="text-xs font-medium text-zinc-400 mt-1 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {bills.length} active collections
                </p>
              </div>
              <div className="h-10 w-10 bg-zinc-50 border border-zinc-200/60 rounded-xl flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-amber-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* --- SEARCH BAR --- */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Search by customer name or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-12 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] border-zinc-200/80 rounded-xl text-base sm:text-sm focus-visible:ring-zinc-900"
          />
        </div>

        {/* --- LIST OF PENDING BILLS --- */}
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-20 text-zinc-400 font-medium text-sm flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-zinc-900 border-t-transparent" />
              <span>Loading ledger...</span>
            </div>
          ) : filteredBills.length === 0 ? (
            <div className="text-center py-24 flex flex-col items-center px-4 bg-white border border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] rounded-2xl">
              <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              </div>
              <p className="text-zinc-900 font-semibold text-base">
                {searchQuery ? "No matching records found" : "All collections clear!"}
              </p>
              <p className="text-zinc-500 text-xs sm:text-sm mt-1 max-w-sm">
                {searchQuery ? "Try searching with a different keyword." : "There are no pending balances or unpaid bookings at the moment."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredBills.map((bill) => {
                const pendingAmount = getPendingAmount(bill);
                const isAdvance = bill.advance_paid !== undefined && bill.advance_paid !== null && bill.advance_paid > 0;

                return (
                  <Card key={bill.id} className="overflow-hidden border border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] rounded-2xl bg-white flex flex-col justify-between hover:border-zinc-300 transition-colors">
                    <CardContent className="p-5 flex-1 flex flex-col justify-between">
                      <div>
                        
                        {/* Header: Amount & Status Dot */}
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Due Amount</span>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-semibold tracking-tight text-zinc-900 leading-none">{formatCurrency(pendingAmount)}</div>
                          </div>
                        </div>

                        {/* Customer Details */}
                        <div className="mb-4">
                          <div className="font-semibold text-base text-zinc-900 leading-tight">{bill.customer_name || "Walk-in Customer"}</div>
                          <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 mt-1">
                            <Phone className="h-3 w-3" />
                            {bill.customer_phone || "No mobile recorded"}
                          </div>
                        </div>

                        {/* Tags */}
                        <div className="pt-3 border-t border-zinc-100 flex items-center justify-between text-xs">
                          <span className="text-zinc-500 font-medium">{format(new Date(bill.created_at), "MMM d, yyyy")}</span>
                          {isAdvance ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-100 text-zinc-600 border border-zinc-200/80">
                              Adv: ₹{bill.advance_paid}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-50 text-zinc-400 border border-zinc-200/50">
                              Zero Adv
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2 mt-5 pt-4 border-t border-zinc-100">
                        <Button 
                          variant="outline" 
                          className="flex-1 h-11 sm:h-10 text-zinc-700 hover:text-zinc-900 hover:bg-zinc-50 border-zinc-200/80 font-semibold text-xs rounded-xl sm:rounded-lg"
                          onClick={() => sendWhatsAppReminder(bill)}
                          disabled={!bill.customer_phone}
                        >
                          <MessageCircle className="h-4 w-4 mr-1.5 text-zinc-400" /> Remind
                        </Button>
                        <Button 
                          className="flex-1 h-11 sm:h-10 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-xs rounded-xl sm:rounded-lg shadow-sm"
                          onClick={() => {
                            setSelectedBill(bill);
                            setPaymentMethod("cash"); 
                          }}
                        >
                          <Wallet className="h-4 w-4 mr-1.5" /> Settle
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* --- SETTLE PAYMENT MODAL --- */}
      <Dialog open={!!selectedBill} onOpenChange={(open) => !open && setSelectedBill(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl p-6 border-zinc-200/80 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold tracking-tight text-zinc-900">Receive Payment</DialogTitle>
            <DialogDescription className="text-sm font-medium text-zinc-500">
              Clear the pending balance for this invoice.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-2 space-y-5">
            {/* Amount Display */}
            <div className="bg-zinc-50 border border-zinc-200/80 p-5 rounded-xl text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">Collecting</p>
              <p className="text-4xl font-semibold tracking-tight text-zinc-900">
                {selectedBill ? formatCurrency(getPendingAmount(selectedBill)) : "0"}
              </p>
              <p className="text-sm font-medium text-zinc-600 mt-2">{selectedBill?.customer_name}</p>
              
              {selectedBill?.advance_paid && selectedBill.advance_paid > 0 ? (
                <p className="text-[11px] text-zinc-400 mt-2 font-medium">
                  Total Bill: ₹{Math.abs(selectedBill.final_amount)} (₹{selectedBill.advance_paid} paid)
                </p>
              ) : null}
            </div>

            {/* Method Select */}
            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Payment Method</label>
              <Select 
                value={paymentMethod} 
                onValueChange={(val: "cash" | "online") => setPaymentMethod(val)}
              >
                <SelectTrigger className="h-12 sm:h-11 rounded-xl border-zinc-200/80 font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-zinc-200/80">
                  <SelectItem value="cash" className="font-medium text-sm py-2.5">Cash</SelectItem>
                  <SelectItem value="online" className="font-medium text-sm py-2.5">Online / UPI</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            <Button variant="outline" onClick={() => setSelectedBill(null)} className="w-full sm:w-auto h-12 sm:h-10 rounded-xl sm:rounded-lg font-semibold border-zinc-200/80 text-zinc-700">
              Cancel
            </Button>
            <Button onClick={handleSettlePayment} disabled={isSettling} className="w-full sm:w-auto h-12 sm:h-10 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl sm:rounded-lg font-semibold shadow-sm">
              {isSettling ? "Processing..." : "Confirm Settlement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}