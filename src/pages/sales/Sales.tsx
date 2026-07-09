import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import {
  Calendar as CalendarIcon,
  CreditCard,
  Banknote,
  Clock,
  ShoppingBag,
  ArrowUpRight,
  ArrowDownLeft,
  Filter,
  MessageCircle
} from "lucide-react";
import { format } from "date-fns";

type BillWithItems = {
  id: string;
  share_id: string;
  invoice_number?: string;
  created_at: string;
  final_amount: number;
  advance_paid: number;
  balance_due: number;
  payment_method: 'cash' | 'online' | 'unpaid' | string;
  payment_status: 'paid' | 'pending' | 'partially_paid';
  customer_phone: string | null;
  customer_name: string | null;
  items_count?: number;
  bill_items: {
    quantity: number;
    price_at_sale: number;
    items: {
      item_name: string;
    };
  }[];
};

export default function Sales() {
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string>("our store");
  
  // --- ADVANCED FILTERS ---
  const [dateRange, setDateRange] = useState<{ from: Date; to?: Date }>({
    from: new Date(),
    to: new Date()
  });
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  const [bills, setBills] = useState<BillWithItems[]>([]);
  const [loading, setLoading] = useState(true);

  // --- SECURE MULTI-TENANT INITIALIZATION ---
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
          
          // Fetch the exact store name for the WhatsApp message
          const { data: tenant } = await supabase
            .from("tenants")
            .select("tenant_name")
            .eq("id", profile.tenant_id)
            .single();
            
          if (tenant) {
            setTenantName(tenant.tenant_name);
          }
        }
      } catch (error) {
        console.error("Failed to initialize tenant data:", error);
      }
    };
    initializeTenantData();
  }, []);

  // Fetch sales when date range or tenant changes
  useEffect(() => {
    if (currentTenantId && dateRange.from) {
      fetchSalesData(currentTenantId);
    }
  }, [dateRange.from, dateRange.to, currentTenantId]);

  const fetchSalesData = async (tenantId: string) => {
    setLoading(true);
    try {
      const start = new Date(dateRange.from);
      start.setHours(0, 0, 0, 0);
      
      const end = new Date(dateRange.to || dateRange.from);
      end.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from('bills')
        .select(`
          *,
          bill_items (
            quantity,
            price_at_sale,
            items ( item_name )
          )
        `)
        .eq("tenant_id", tenantId) 
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedBills = (data || []).map((bill: any) => ({
        ...bill,
        items_count: bill.bill_items.reduce((sum: number, item: any) => sum + Math.abs(item.quantity), 0)
      }));

      setBills(formattedBills);
    } catch (error) {
      console.error("Error fetching sales:", error);
    } finally {
      setLoading(false);
    }
  };

  // --- WHATSAPP SHARING ENGINE ---
  const shareOnWhatsApp = (bill: BillWithItems) => {
    if (!bill.customer_phone) return;
    
    const PUBLIC_DOMAIN = "https://retail.biillo.com"; 
    const invoiceLink = `${PUBLIC_DOMAIN}/#/invoice/${bill.share_id}`;
    
    const message = encodeURIComponent(
      `🙏 Thank you for shopping at *${tenantName}*!\n\n` +
      `🧾 Invoice: ${bill.invoice_number || bill.id.toString().slice(0,8)}\n` +
      `💰 Total Amount: ₹${Math.abs(bill.final_amount)}\n\n` +
      `View your E-Receipt here:\n${invoiceLink}`
    );
    
    const cleanPhone = bill.customer_phone.replace(/\D/g, '');
    window.open(`https://wa.me/91${cleanPhone}?text=${message}`, "_blank");
  };

  // --- CLIENT SIDE FILTERING ---
  const filteredBills = useMemo(() => {
    if (statusFilter === "all") return bills;
    return bills.filter(bill => bill.payment_status === statusFilter);
  }, [bills, statusFilter]);

  // --- DYNAMIC METRICS CALCULATION ---
  const stats = useMemo(() => {
    return filteredBills.reduce(
      (acc, bill) => {
        const isReturn = bill.final_amount < 0;
        const gross = bill.final_amount; 
        
        acc.grossRevenue += gross;

        if (bill.payment_status === 'paid') {
          acc.totalCollected += gross;
          if (bill.payment_method === 'online') acc.onlineCollected += gross;
          else acc.cashCollected += gross;
          
        } else if (bill.payment_status === 'partially_paid') {
          const adv = isReturn ? -(bill.advance_paid || 0) : (bill.advance_paid || 0);
          const bal = isReturn ? -(bill.balance_due || 0) : (bill.balance_due || 0);

          acc.totalCollected += adv;
          if (bill.payment_method === 'online') acc.onlineCollected += adv;
          else acc.cashCollected += adv;
          acc.pendingUdhaar += bal;

        } else if (bill.payment_status === 'pending') {
          acc.pendingUdhaar += gross;
        }
        return acc;
      },
      { grossRevenue: 0, totalCollected: 0, cashCollected: 0, onlineCollected: 0, pendingUdhaar: 0 }
    );
  }, [filteredBills]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusIndicator = (bill: BillWithItems) => {
    if (bill.final_amount < 0) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-zinc-100 text-zinc-700 border border-zinc-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Refund
        </span>
      );
    }
    if (bill.payment_status === 'pending') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-zinc-100 text-zinc-700 border border-zinc-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Due
        </span>
      );
    }
    if (bill.payment_status === 'partially_paid') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-zinc-100 text-zinc-700 border border-zinc-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Advance
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-zinc-100 text-zinc-700 border border-zinc-200/80">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Paid
      </span>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6 pb-24 md:pb-8 animate-fade-in max-w-6xl mx-auto font-sans">
        
        {/* --- HEADER --- */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 z-20 bg-zinc-50/80 backdrop-blur-md py-4 -mx-4 px-4 md:static md:bg-transparent md:p-0 md:mx-0 border-b border-zinc-200/60 md:border-0">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900">Sales Dashboard</h1>
            <p className="text-muted-foreground mt-0.5 text-xs sm:text-sm font-medium">Analyze revenue and cashflow over time</p>
          </div>
        </div>

        {/* --- SAAS FILTER TOOLBAR --- */}
        <div className="bg-white p-2 rounded-2xl border border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col sm:flex-row items-center gap-2">
           
           {/* Date Range Picker */}
           <div className="w-full sm:w-auto flex-1 sm:max-w-xs">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start h-10 font-medium border-zinc-200/80 shadow-sm text-zinc-800 hover:bg-zinc-50">
                    <CalendarIcon className="mr-2 h-4 w-4 text-zinc-400 shrink-0" />
                    <span className="truncate">
                      {dateRange.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, "LLL dd")} - {format(dateRange.to, "LLL dd, y")}
                          </>
                        ) : (
                          format(dateRange.from, "LLL dd, y")
                        )
                      ) : (
                        <span>Select Date Range</span>
                      )}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-2xl border-zinc-200 shadow-xl" align="start">
                  <Calendar
                    mode="range"
                    defaultMonth={dateRange.from}
                    selected={dateRange}
                    onSelect={(range: any) => {
                      if (!range) setDateRange({ from: new Date() });
                      else setDateRange(range);
                    }}
                    initialFocus
                    numberOfMonths={1}
                    className="rounded-2xl"
                  />
                </PopoverContent>
              </Popover>
           </div>

           {/* Status Filter */}
           <div className="w-full sm:w-auto">
             <Select value={statusFilter} onValueChange={setStatusFilter}>
               <SelectTrigger className="w-full sm:w-[160px] h-10 border-zinc-200/80 bg-white text-zinc-800 font-medium shadow-sm rounded-lg">
                 <Filter className="w-3.5 h-3.5 mr-2 text-zinc-400"/>
                 <SelectValue placeholder="Status" />
               </SelectTrigger>
               <SelectContent className="rounded-xl border-zinc-200/80 shadow-lg">
                 <SelectItem value="all" className="font-medium text-sm">All Statuses</SelectItem>
                 <SelectItem value="paid" className="font-medium text-sm">Paid in Full</SelectItem>
                 <SelectItem value="partially_paid" className="font-medium text-sm">Advances (Part)</SelectItem>
                 <SelectItem value="pending" className="font-medium text-sm">Unpaid Due</SelectItem>
               </SelectContent>
             </Select>
           </div>

        </div>

        {/* --- DYNAMIC METRICS GRID --- */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          
          <Card className="shadow-[0_1px_3px_rgba(0,0,0,0.02)] border border-zinc-200/80 bg-white rounded-2xl">
            <CardContent className="p-4 sm:p-5">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Gross Revenue</span>
                <ArrowUpRight className="h-4 w-4 text-zinc-400" />
              </div>
              <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900">{formatCurrency(stats.grossRevenue)}</div>
              <p className="text-xs font-medium text-zinc-400 mt-1.5">Invoiced in selected range</p>
            </CardContent>
          </Card>

          <Card className="shadow-[0_1px_3px_rgba(0,0,0,0.02)] border border-zinc-200/80 bg-white rounded-2xl">
            <CardContent className="p-4 sm:p-5">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Total Collected</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              </div>
              <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900">{formatCurrency(stats.totalCollected)}</div>
              <div className="flex items-center gap-3 text-xs font-medium text-zinc-500 mt-2 pt-2 border-t border-zinc-100">
                <span>Cash: <strong className="text-zinc-800 font-semibold">{formatCurrency(stats.cashCollected)}</strong></span>
                <span>UPI: <strong className="text-zinc-800 font-semibold">{formatCurrency(stats.onlineCollected)}</strong></span>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-[0_1px_3px_rgba(0,0,0,0.02)] border border-zinc-200/80 bg-white rounded-2xl sm:col-span-2 lg:col-span-2">
            <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Pending Bookings / Due</span>
                <span className="w-2 h-2 rounded-full bg-amber-500" />
              </div>
              <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 sm:gap-4 mt-auto">
                <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900">{formatCurrency(stats.pendingUdhaar)}</div>
                <div className="text-xs font-medium text-zinc-500">Unpaid invoices & remaining advance balances</div>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* --- TRANSACTION LEDGER --- */}
        <div className="bg-white border border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] rounded-2xl overflow-hidden">
          
          <div className="px-5 py-4 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/40">
             <div className="flex items-center gap-2">
               <h2 className="text-sm font-semibold text-zinc-900">Transaction Ledger</h2>
               <span className="px-2 py-0.5 text-[11px] font-semibold bg-zinc-200/60 text-zinc-700 rounded-full">{filteredBills.length}</span>
             </div>
             <span className="text-xs font-medium text-zinc-400 hidden sm:inline">Tap any row to view breakdown</span>
          </div>

          {loading ? (
             <div className="text-center py-20 text-zinc-400 font-medium text-sm flex flex-col items-center gap-3">
               <div className="animate-spin rounded-full h-5 w-5 border-2 border-zinc-900 border-t-transparent" />
               <span>Loading transaction ledger...</span>
             </div>
          ) : filteredBills.length === 0 ? (
             <div className="text-center py-24 flex flex-col items-center px-4">
               <div className="h-12 w-12 rounded-2xl bg-zinc-100 border border-zinc-200/80 flex items-center justify-center mb-3 text-zinc-400">
                 <ShoppingBag className="h-5 w-5" />
               </div>
               <p className="text-zinc-900 font-semibold text-base">No transactions found</p>
               <p className="text-zinc-500 text-xs sm:text-sm mt-1 max-w-sm">Adjust your date range or status filters to view records.</p>
             </div>
          ) : (
            <Accordion type="single" collapsible className="w-full divide-y divide-zinc-100">
              {filteredBills.map((bill) => {
                const isReturn = bill.final_amount < 0;
                return (
                  <AccordionItem 
                    key={bill.id} 
                    value={bill.id} 
                    className="border-0 px-4 sm:px-5 hover:bg-zinc-50/60 transition-colors"
                  >
                    <AccordionTrigger className="hover:no-underline py-3.5 sm:py-4 group">
                      <div className="flex items-center justify-between w-full pr-2 min-w-0">
                        
                        {/* Left Side: Icon, Customer Name & Time */}
                        <div className="flex items-center gap-3 sm:gap-3.5 text-left min-w-0 flex-1 mr-3">
                          <div className={`h-9 w-9 sm:h-10 sm:w-10 rounded-xl flex items-center justify-center shrink-0 border transition-colors
                            ${isReturn ? 'bg-rose-50/50 border-rose-200/80 text-rose-600' : 'bg-zinc-50 border-zinc-200/80 text-zinc-700 group-hover:bg-white'}
                          `}>
                            {isReturn ? <ArrowDownLeft className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-zinc-900 leading-snug truncate flex items-center gap-2">
                              {bill.customer_name || "Walk-in Customer"}
                              {bill.invoice_number && (
                                <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider hidden sm:inline-block border border-zinc-200 rounded px-1.5 py-0.5">
                                  {bill.invoice_number}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-medium text-zinc-400 flex items-center gap-1.5 mt-0.5">
                              <Clock className="h-3 w-3 shrink-0" />
                              <span>{format(new Date(bill.created_at), "MMM d, h:mm a")}</span>
                              <span>•</span>
                              <span>{bill.items_count} {bill.items_count === 1 ? 'item' : 'items'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Right Side: Amount & Monochrome Status Badge */}
                        <div className="text-right flex flex-col items-end gap-1 shrink-0">
                          <div className={`text-sm sm:text-base font-semibold tracking-tight ${isReturn ? 'text-rose-600' : 'text-zinc-900'}`}>
                            {formatCurrency(bill.final_amount)}
                          </div>
                          {getStatusIndicator(bill)}
                        </div>

                      </div>
                    </AccordionTrigger>
                    
                    <AccordionContent className="pb-4 pt-1">
                      <div className="bg-zinc-50/80 border border-zinc-200/80 rounded-xl p-3.5 sm:p-4 sm:ml-13 space-y-3">
                        
                        {/* Mobile Invoice Tag Fallback */}
                        {bill.invoice_number && (
                          <div className="sm:hidden pb-3 border-b border-zinc-200/60 flex justify-between items-center text-xs">
                             <span className="font-medium text-zinc-500">Invoice Ref</span>
                             <span className="font-semibold text-zinc-700 tracking-widest uppercase bg-white border border-zinc-200 px-2 py-0.5 rounded shadow-sm">{bill.invoice_number}</span>
                          </div>
                        )}

                        {/* Advance / Partial Payment Split Breakdown */}
                        {bill.payment_status === 'partially_paid' && (
                          <div className="pb-3 border-b border-zinc-200/80 grid grid-cols-2 gap-3">
                            <div className="bg-white p-2.5 rounded-lg border border-zinc-200/60 shadow-sm">
                              <p className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400 mb-0.5">Advance Collected</p>
                              <div className="text-sm font-semibold text-zinc-900 flex items-center gap-1.5">
                                {formatCurrency(bill.advance_paid)} 
                                <span className="text-[10px] font-medium text-zinc-500 uppercase px-1.5 py-0.5 bg-zinc-100 rounded">
                                  {bill.payment_method}
                                </span>
                              </div>
                            </div>
                            <div className="bg-white p-2.5 rounded-lg border border-zinc-200/60 shadow-sm">
                              <p className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400 mb-0.5">Balance Pending</p>
                              <div className="text-sm font-semibold text-amber-600">{formatCurrency(bill.balance_due)}</div>
                            </div>
                          </div>
                        )}

                        {/* Standard Payment Mode Header */}
                        {bill.payment_status !== 'partially_paid' && (
                           <div className="pb-2.5 border-b border-zinc-200/60 flex justify-between items-center text-xs">
                             <span className="font-medium text-zinc-500">Payment Method</span>
                             <span className="font-semibold text-zinc-800 uppercase flex items-center gap-1.5 bg-white px-2 py-1 rounded-md border border-zinc-200/80 shadow-2xs">
                               {bill.payment_method === 'online' ? <CreditCard className="h-3 w-3 text-zinc-500" /> : <Banknote className="h-3 w-3 text-zinc-500" />}
                               {bill.payment_status === 'pending' ? 'Unpaid Due' : bill.payment_method}
                             </span>
                           </div>
                        )}

                        {/* Line Items List */}
                        <div className="space-y-2 pt-0.5">
                          {bill.bill_items.map((bi, idx) => (
                            <div key={idx} className="flex justify-between items-baseline text-xs sm:text-sm">
                              <div className="flex items-baseline gap-2 min-w-0 pr-2">
                                <span className="font-semibold text-zinc-400 text-xs shrink-0">{Math.abs(bi.quantity)}×</span>
                                <span className="font-medium text-zinc-800 truncate">{bi.items?.item_name || "Unknown Item"}</span>
                              </div>
                              <span className="font-semibold text-zinc-900 shrink-0 font-mono text-xs">₹{Math.abs(bi.quantity * bi.price_at_sale)}</span>
                            </div>
                          ))}
                        </div>

                        {/* WHATSAPP SHARE ACTION BAR */}
                        <div className="mt-4 pt-4 border-t border-zinc-200/60 flex gap-2">
                          <Button 
                            variant="outline" 
                            className="w-full h-10 bg-white text-zinc-700 hover:text-zinc-900 hover:bg-zinc-50 border-zinc-200/80 font-semibold text-xs rounded-lg shadow-sm transition-colors"
                            onClick={() => shareOnWhatsApp(bill)}
                            disabled={!bill.customer_phone}
                          >
                            <MessageCircle className={`h-4 w-4 mr-1.5 ${bill.customer_phone ? 'text-emerald-500' : 'text-zinc-300'}`} /> 
                            {bill.customer_phone ? "Send E-Receipt via WhatsApp" : "No Mobile Number Provided"}
                          </Button>
                        </div>

                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </div>
      </div>
    </AppLayout>
  );
}