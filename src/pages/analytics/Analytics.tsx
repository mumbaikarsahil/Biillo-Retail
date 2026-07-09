import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase, Item } from "@/lib/supabase";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import * as XLSX from "xlsx";
import {
  TrendingUp,
  Download,
  Search,
  Wallet,
  Banknote,
  AlertCircle,
  Users,
  AlertTriangle,
  ArrowRight,
  Calendar as CalendarIcon,
  CreditCard
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

type DailySales = {
  date: string;
  amount: number;
};

export default function Analytics() {
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Custom Date Range State
  const [dateRange, setDateRange] = useState<{ from: Date; to?: Date }>({
    from: startOfDay(subDays(new Date(), 30)), // Default to last 30 days
    to: endOfDay(new Date())
  }); 
  
  const [metrics, setMetrics] = useState({
    totalSales: 0,
    cashCollected: 0,
    onlineCollected: 0,
    pendingUdhaar: 0,
    totalPurchaseValue: 0, 
    totalSellingValue: 0,  
    lowStockCount: 0
  });

  const [salesData, setSalesData] = useState<DailySales[]>([]); 
  const [recentUdhaar, setRecentUdhaar] = useState<any[]>([]); 
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  // --- 1. INITIALIZE TENANT DATA ---
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
        }
      } catch (error) {
        console.error("Failed to initialize tenant data:", error);
      }
    };
    initializeTenantData();
  }, []);

  // --- 2. FETCH DATA WHEN TENANT OR DATE CHANGES ---
  useEffect(() => {
    if (currentTenantId && dateRange.from) {
      fetchData(currentTenantId);
    }
  }, [dateRange.from, dateRange.to, currentTenantId]); 

  const fetchData = async (tenantId: string) => {
    setIsLoading(true);
    try {
      // 1. FETCH ITEMS
      const { data: itemsData, error: itemsError } = await supabase
        .from("items")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("item_name");

      if (itemsError) throw itemsError;
      setItems(itemsData || []);

      const purchaseVal = (itemsData || []).reduce((sum, item) => sum + (item.purchase_price || 0) * item.quantity, 0);
      const sellingVal = (itemsData || []).reduce((sum, item) => sum + (item.selling_price || 0) * item.quantity, 0);
      const lowStock = (itemsData || []).filter((item) => item.quantity < 5).length;

      // 2. FETCH BILLS IN RANGE
      const start = new Date(dateRange.from);
      start.setHours(0, 0, 0, 0);
      const end = new Date(dateRange.to || dateRange.from);
      end.setHours(23, 59, 59, 999);

      const { data: bills, error: billsError } = await supabase
        .from("bills")
        .select("*")
        .eq("tenant_id", tenantId)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      if (billsError) throw billsError;

      let totalSales = 0;
      let cashCollected = 0;
      let onlineCollected = 0;
      let pendingUdhaar = 0;

      (bills || []).forEach(bill => {
        const isReturn = bill.final_amount < 0;
        const gross = bill.final_amount; 
        
        totalSales += gross;

        if (bill.payment_status === 'paid') {
          if (bill.payment_method === 'online') onlineCollected += gross;
          else cashCollected += gross;
          
        } else if (bill.payment_status === 'partially_paid') {
          const adv = isReturn ? -(bill.advance_paid || 0) : (bill.advance_paid || 0);
          const bal = isReturn ? -(bill.balance_due || 0) : (bill.balance_due || 0);

          if (bill.payment_method === 'online') onlineCollected += adv;
          else cashCollected += adv;
          pendingUdhaar += bal;

        } else if (bill.payment_status === 'pending') {
          pendingUdhaar += gross;
        }
      });

      setMetrics({
        totalPurchaseValue: purchaseVal,
        totalSellingValue: sellingVal,
        lowStockCount: lowStock,
        totalSales,
        cashCollected,
        onlineCollected,
        pendingUdhaar
      });

      // 3. FETCH RECENT UDHAAR
      const { data: pendingBills } = await supabase
        .from("bills")
        .select("*")
        .in("payment_status", ["pending", "partially_paid"])
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(5);
      
      setRecentUdhaar(pendingBills || []);

      // 4. FETCH CHART DATA (Last 7 Days from today, regardless of filter)
      const last7Days: DailySales[] = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        const displayDate = new Date(date);
        date.setDate(date.getDate() - i);
        displayDate.setDate(displayDate.getDate() - i);
        
        const dateStr = date.toISOString().split("T")[0];

        const { data: dayBills } = await supabase
          .from("bills")
          .select("final_amount")
          .eq("tenant_id", tenantId) 
          .gte("created_at", `${dateStr}T00:00:00`)
          .lte("created_at", `${dateStr}T23:59:59`)
          .gt("final_amount", 0);

        const dayTotal = (dayBills || []).reduce((sum, bill) => sum + bill.final_amount, 0);
        last7Days.push({
          date: displayDate.toLocaleDateString("en-US", { weekday: "short" }),
          amount: dayTotal,
        });
      }
      setSalesData(last7Days);

    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to fetch data", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  const formatCompactNumber = (number: number) => {
    return new Intl.NumberFormat('en-IN', { notation: "compact", compactDisplay: "short" }).format(number);
  };

  const filteredItems = useMemo(() => {
    return items
      .filter((item) =>
        item.item_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.brand_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.item_code.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .map(item => ({
        ...item,
        stockDisplay: item.pieces_per_box > 1 
          ? `${Math.floor(item.quantity / item.pieces_per_box)} : ${item.quantity % item.pieces_per_box}`
          : `${item.quantity}`
      }));
  }, [items, searchQuery]);

  const exportToExcel = async () => {
    try {
      const exportData = filteredItems.map((item) => ({
        "Code": item.item_code,
        "Name": item.item_name,
        "Brand": item.brand_name,
        "Sell Price": item.selling_price,
        "Stock": item.quantity
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Inventory");
      const fileName = `Inventory_${new Date().toISOString().split("T")[0]}.xlsx`;

      if (Capacitor.isNativePlatform()) {
        const excelBase64 = XLSX.write(wb, { bookType: "xlsx", type: "base64" });
        const result = await Filesystem.writeFile({
          path: fileName,
          data: excelBase64,
          directory: Directory.Cache, 
        });
        await Share.share({ title: "Export Inventory", text: "Here is your inventory file", url: result.uri, dialogTitle: "Save or Share Excel" });
      } else {
        XLSX.writeFile(wb, fileName);
      }
      toast({ title: "Success", description: "Sheet generated successfully" });
    } catch (error: any) {
      toast({ title: "Export Failed", description: error.message || "Could not save file", variant: "destructive" });
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in pb-24 md:pb-8 max-w-6xl mx-auto font-sans">
        
        {/* --- APP HEADER --- */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 z-20 bg-zinc-50/80 backdrop-blur-md py-4 -mx-4 px-4 md:static md:bg-transparent md:p-0 md:mx-0 border-b border-zinc-200/60 md:border-0">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900">Analytics</h1>
            <p className="text-muted-foreground mt-0.5 text-xs sm:text-sm font-medium">Store performance and operational metrics</p>
          </div>
          
          <div className="w-full sm:w-auto">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full sm:w-[260px] justify-start h-10 font-medium border-zinc-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)] bg-white text-zinc-800 hover:bg-zinc-50 rounded-xl">
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
              <PopoverContent className="w-auto p-0 rounded-2xl border-zinc-200 shadow-xl" align="end">
                <Calendar
                  mode="range"
                  defaultMonth={dateRange.from}
                  selected={dateRange}
                  onSelect={(range: any) => {
                    if (!range) setDateRange({ from: startOfDay(new Date()) });
                    else setDateRange(range);
                  }}
                  initialFocus
                  numberOfMonths={1}
                  className="rounded-2xl"
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* --- METRICS GRID --- */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          
          <Card className="shadow-[0_1px_3px_rgba(0,0,0,0.02)] border border-zinc-200/80 bg-white rounded-2xl">
            <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Gross Sales</span>
                <div className="h-6 w-6 rounded-md bg-zinc-100 flex items-center justify-center"><TrendingUp className="h-3.5 w-3.5 text-zinc-600" /></div>
              </div>
              <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900">{formatCompactNumber(metrics.totalSales)}</div>
            </CardContent>
          </Card>

          <Card className="shadow-[0_1px_3px_rgba(0,0,0,0.02)] border border-zinc-200/80 bg-white rounded-2xl">
            <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Collected</span>
                <div className="flex items-center gap-1">
                  <Banknote className="h-3.5 w-3.5 text-emerald-500" />
                  <CreditCard className="h-3.5 w-3.5 text-blue-500" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900">{formatCompactNumber(metrics.cashCollected + metrics.onlineCollected)}</div>
              <div className="flex items-center gap-3 text-[10px] sm:text-xs font-medium text-zinc-500 mt-2">
                 <span>Cash: <strong className="text-zinc-700">{formatCompactNumber(metrics.cashCollected)}</strong></span>
                 <span>UPI: <strong className="text-zinc-700">{formatCompactNumber(metrics.onlineCollected)}</strong></span>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-[0_1px_3px_rgba(0,0,0,0.02)] border border-zinc-200/80 bg-white rounded-2xl col-span-2 lg:col-span-1">
            <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between mb-4">
                 <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Pending Due</span>
                 <div className="h-6 w-6 rounded-md bg-amber-50 flex items-center justify-center"><AlertCircle className="h-3.5 w-3.5 text-amber-500" /></div>
              </div>
              <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-amber-600">{formatCurrency(metrics.pendingUdhaar)}</div>
            </CardContent>
          </Card>

          <Card className="shadow-[0_1px_3px_rgba(0,0,0,0.02)] border border-zinc-200/80 bg-white rounded-2xl col-span-2 lg:col-span-1">
            <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between mb-4">
                 <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Inventory Value</span>
                 <div className="h-6 w-6 rounded-md bg-zinc-100 flex items-center justify-center"><Wallet className="h-3.5 w-3.5 text-zinc-600" /></div>
              </div>
              <div className="flex justify-between items-end">
                <div>
                   <div className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider mb-0.5">Invested</div>
                   <div className="text-lg font-semibold tracking-tight text-zinc-900">{formatCompactNumber(metrics.totalPurchaseValue)}</div>
                </div>
                <div className="text-right">
                   <div className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider mb-0.5">Potential</div>
                   <div className="text-sm font-semibold tracking-tight text-zinc-500">{formatCompactNumber(metrics.totalSellingValue)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* --- PENDING PAYMENTS WIDGET --- */}
        {recentUdhaar.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
                <Users className="h-4 w-4 text-zinc-400" /> Recent Pending Udhaar
              </h2>
            </div>
            <div className="flex overflow-x-auto gap-3 pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible hidden-scrollbar">
              {recentUdhaar.map((bill) => (
                <Card key={bill.id} className="min-w-[240px] border border-zinc-200/80 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.02)] rounded-2xl shrink-0 hover:border-zinc-300 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="font-semibold text-sm text-zinc-900 truncate pr-2">{bill.customer_name || "Unknown"}</div>
                        <div className="text-[11px] font-medium text-zinc-500">{bill.customer_phone || "No Number"}</div>
                      </div>
                      <Badge variant="outline" className="text-[9px] bg-zinc-50 text-zinc-500 border-zinc-200/80 font-bold uppercase tracking-wider px-2 shrink-0">
                        {format(new Date(bill.created_at), "MMM d")}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-end pt-3 border-t border-zinc-100">
                      <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Due Balance</span>
                      <span className="font-semibold text-base text-amber-600 leading-none">₹{bill.balance_due || bill.final_amount}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* --- CHART SECTION --- */}
        <Card className="shadow-[0_1px_3px_rgba(0,0,0,0.02)] border border-zinc-200/80 rounded-2xl overflow-hidden bg-white">
          <CardHeader className="p-5 pb-2 border-b border-zinc-50/50">
            <CardTitle className="text-sm font-semibold text-zinc-900">7-Day Sales Trend</CardTitle>
          </CardHeader>
          <CardContent className="p-0 pt-4">
            <div className="h-[220px] w-full pr-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={salesData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#18181b" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#18181b" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                  <XAxis dataKey="date" tick={{fontSize: 10, fill: '#71717a', fontWeight: 500}} axisLine={false} tickLine={false} dy={10} />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e4e4e7', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', padding: '12px' }}
                    itemStyle={{ color: '#18181b', fontWeight: 600 }}
                    formatter={(value: number) => [`₹${value}`, "Sales"]}
                    labelStyle={{ color: '#71717a', fontSize: '11px', textTransform: 'uppercase', marginBottom: '4px', fontWeight: 600 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="#18181b"
                    fillOpacity={1}
                    fill="url(#colorSales)"
                    strokeWidth={2}
                    activeDot={{ r: 5, fill: '#18181b', stroke: '#fff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* --- INVENTORY LIST --- */}
        <Card className="shadow-[0_1px_3px_rgba(0,0,0,0.02)] border border-zinc-200/80 rounded-2xl overflow-hidden bg-white">
          <CardHeader className="p-4 sm:p-5 flex flex-row items-center justify-between bg-zinc-50/40 border-b border-zinc-100">
            <div>
              <CardTitle className="text-sm font-semibold text-zinc-900">Inventory Status</CardTitle>
              {metrics.lowStockCount > 0 && (
                 <span className="text-[10px] text-rose-500 font-bold uppercase tracking-wider flex items-center gap-1 mt-1">
                   <AlertTriangle className="h-3 w-3" /> {metrics.lowStockCount} Low Stock
                 </span>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={exportToExcel} className="h-9 rounded-xl shadow-sm font-semibold text-xs bg-white border-zinc-200/80 text-zinc-700">
              <Download className="h-3.5 w-3.5 mr-2" /> Export
            </Button>
          </CardHeader>
          
          <div className="p-3 border-b border-zinc-100 bg-white">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input
                placeholder="Search inventory..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-11 text-sm bg-white border-zinc-200/80 rounded-xl font-medium focus-visible:ring-zinc-900 shadow-sm"
              />
            </div>
          </div>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs hover:bg-transparent border-zinc-100 bg-zinc-50/40">
                    <TableHead className="w-[50%] pl-5 font-semibold text-zinc-500 uppercase tracking-wider">Item</TableHead>
                    <TableHead className="text-right font-semibold text-zinc-500 uppercase tracking-wider">Price</TableHead>
                    <TableHead className="text-right pr-5 font-semibold text-zinc-500 uppercase tracking-wider">Stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={3} className="text-center py-12 text-zinc-400 font-medium">Loading inventory...</TableCell></TableRow>
                  ) : filteredItems.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center py-12 text-zinc-400 font-medium">No items found</TableCell></TableRow>
                  ) : (
                    filteredItems.map((item) => (
                      <TableRow key={item.id} className="border-b-zinc-100 hover:bg-zinc-50/50 transition-colors">
                        <TableCell className="py-3.5 pl-5">
                          <div className="font-semibold text-sm text-zinc-900 truncate max-w-[160px] md:max-w-md">{item.item_name}</div>
                          <div className="text-[11px] text-zinc-500 font-medium mt-0.5 font-mono">{item.item_code}</div>
                        </TableCell>
                        <TableCell className="text-right py-3.5 text-sm font-semibold text-zinc-700">₹{item.selling_price}</TableCell>
                        <TableCell className="text-right py-3.5 pr-5">
                          <Badge 
                            variant="outline"
                            className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 border-0
                              ${item.quantity <= 5 ? 'bg-rose-50 text-rose-600' : 'bg-zinc-100 text-zinc-600'}
                            `}
                          >
                            {item.stockDisplay}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}