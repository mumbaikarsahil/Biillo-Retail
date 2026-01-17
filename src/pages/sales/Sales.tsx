import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { supabase } from "@/lib/supabase";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Banknote,
  AlertCircle,
  Clock,
  User,
  ShoppingBag
} from "lucide-react";
import { format, isToday, isYesterday, addDays, subDays } from "date-fns";

type BillWithItems = {
  id: string;
  created_at: string;
  final_amount: number;
  payment_method: 'cash' | 'online' | 'udhaar';
  payment_status: 'paid' | 'pending';
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
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [bills, setBills] = useState<BillWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    cash: 0,
    online: 0,
    udhaar: 0
  });

  useEffect(() => {
    fetchDailySales();
  }, [selectedDate]);

  const fetchDailySales = async () => {
    setLoading(true);
    try {
      // 1. Set Date Range (Start of day to End of day)
      const start = new Date(selectedDate);
      start.setHours(0, 0, 0, 0);
      
      const end = new Date(selectedDate);
      end.setHours(23, 59, 59, 999);

      // 2. Fetch Bills with Items
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
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedBills = (data || []).map((bill: any) => ({
        ...bill,
        items_count: bill.bill_items.reduce((sum: number, item: any) => sum + Math.abs(item.quantity), 0)
      }));

      setBills(formattedBills);
      calculateStats(formattedBills);

    } catch (error) {
      console.error("Error fetching sales:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (data: BillWithItems[]) => {
    const newStats = data.reduce(
      (acc, bill) => {
        const amount = Math.abs(bill.final_amount);
        
        // Total Sales Volume
        acc.total += amount;

        // Split by Payment Method
        if (bill.payment_status === 'pending') {
          acc.udhaar += amount;
        } else if (bill.payment_method === 'online') {
          acc.online += amount;
        } else {
          // Default to cash if paid and not online
          acc.cash += amount;
        }
        return acc;
      },
      { total: 0, cash: 0, online: 0, udhaar: 0 }
    );
    setStats(newStats);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getPaymentIcon = (method: string, status: string) => {
    if (status === 'pending') return <AlertCircle className="h-4 w-4 text-orange-600" />;
    if (method === 'online') return <CreditCard className="h-4 w-4 text-blue-600" />;
    return <Banknote className="h-4 w-4 text-green-600" />;
  };

  const getPaymentLabel = (method: string, status: string) => {
    if (status === 'pending') return "Udhaar";
    if (method === 'online') return "Online";
    return "Cash";
  };

  return (
    <AppLayout>
      <div className="space-y-4 pb-20 md:pb-0 animate-fade-in">
        
        {/* --- DATE NAVIGATION HEADER --- */}
        <div className="bg-background/95 backdrop-blur sticky top-0 z-10 -mx-4 px-4 py-2 border-b space-y-3 md:static md:border-0 md:p-0 md:mx-0">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">Daily Sales</h1>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => setSelectedDate(subDays(selectedDate, 1))}
                className="h-8 w-8"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-8 font-normal min-w-[130px]">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {isToday(selectedDate) ? "Today" : 
                     isYesterday(selectedDate) ? "Yesterday" : 
                     format(selectedDate, "dd MMM yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => setSelectedDate(addDays(selectedDate, 1))}
                disabled={isToday(selectedDate)}
                className="h-8 w-8"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* --- DAILY SUMMARY STRIP --- */}
          <div className="grid grid-cols-3 gap-2">
            <Card className="bg-green-50/50 border-green-100 shadow-sm">
              <CardContent className="p-2 text-center">
                <span className="text-[10px] uppercase font-bold text-green-700/70">Cash</span>
                <div className="text-sm font-bold text-green-700">{formatCurrency(stats.cash)}</div>
              </CardContent>
            </Card>
            
            <Card className="bg-blue-50/50 border-blue-100 shadow-sm">
              <CardContent className="p-2 text-center">
                <span className="text-[10px] uppercase font-bold text-blue-700/70">Online</span>
                <div className="text-sm font-bold text-blue-700">{formatCurrency(stats.online)}</div>
              </CardContent>
            </Card>

            <Card className="bg-orange-50/50 border-orange-100 shadow-sm">
              <CardContent className="p-2 text-center">
                <span className="text-[10px] uppercase font-bold text-orange-700/70">Udhaar</span>
                <div className="text-sm font-bold text-orange-700">{formatCurrency(stats.udhaar)}</div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* --- TRANSACTIONS LIST --- */}
        <div className="space-y-2">
          {loading ? (
             <div className="text-center py-10 text-muted-foreground">Loading transactions...</div>
          ) : bills.length === 0 ? (
             <div className="text-center py-12 bg-muted/20 rounded-lg border border-dashed">
               <ShoppingBag className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
               <p className="text-muted-foreground">No sales recorded for this date</p>
             </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center px-1">
                 <span className="text-xs font-medium text-muted-foreground">{bills.length} Transactions</span>
                 <span className="text-xs font-bold text-primary">Total: {formatCurrency(stats.total)}</span>
              </div>
              
              <Accordion type="single" collapsible className="space-y-2">
                {bills.map((bill) => (
                  <AccordionItem 
                    key={bill.id} 
                    value={bill.id} 
                    className="border rounded-lg bg-card px-3 shadow-sm hover:bg-muted/10 transition-colors"
                  >
                    <AccordionTrigger className="hover:no-underline py-3">
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-3 text-left">
                          {/* Payment Icon Badge */}
                          <div className={`
                            h-10 w-10 rounded-full flex items-center justify-center border
                            ${bill.payment_status === 'pending' 
                              ? 'bg-orange-50 border-orange-100' 
                              : bill.payment_method === 'online' 
                                ? 'bg-blue-50 border-blue-100' 
                                : 'bg-green-50 border-green-100'}
                          `}>
                            {getPaymentIcon(bill.payment_method, bill.payment_status)}
                          </div>
                          
                          <div>
                            <div className="text-sm font-semibold flex items-center gap-2">
                              {bill.customer_name || "Walk-in Customer"}
                              {bill.payment_status === 'pending' && (
                                <Badge variant="outline" className="text-[10px] h-4 px-1 text-orange-600 bg-orange-50 border-orange-200">
                                  Due
                                </Badge>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(new Date(bill.created_at), "h:mm a")} • {bill.items_count} Items
                            </div>
                          </div>
                        </div>

                        <div className="text-right pr-2">
                          <div className="font-bold text-sm">
                            {formatCurrency(Math.abs(bill.final_amount))}
                          </div>
                          <div className="text-[10px] text-muted-foreground uppercase">
                            {getPaymentLabel(bill.payment_method, bill.payment_status)}
                          </div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    
                    <AccordionContent className="pb-3 pt-1 border-t mt-1">
                      <div className="space-y-2 mt-2">
                        {bill.bill_items.map((bi, idx) => (
                          <div key={idx} className="flex justify-between text-xs">
                            <span className="text-muted-foreground">
                              {bi.items?.item_name || "Unknown Item"} 
                              <span className="text-foreground font-medium ml-1">x{Math.abs(bi.quantity)}</span>
                            </span>
                            <span>₹{Math.abs(bi.quantity * bi.price_at_sale)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between text-xs font-bold pt-2 border-t border-dashed">
                          <span>Total</span>
                          <span>{formatCurrency(Math.abs(bill.final_amount))}</span>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}