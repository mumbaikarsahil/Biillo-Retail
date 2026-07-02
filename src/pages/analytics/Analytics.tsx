import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  ArrowRight
} from "lucide-react";
import { startOfWeek, startOfMonth } from "date-fns";

type DailySales = {
  date: string;
  amount: number;
};

export default function Analytics() {
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState("month"); 
  
  const [metrics, setMetrics] = useState({
    totalSales: 0,
    cashCollected: 0,
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
    if (currentTenantId) {
      fetchData(currentTenantId);
    }
  }, [dateRange, currentTenantId]); 

  const getDateFilter = () => {
    const now = new Date();
    switch (dateRange) {
      case "today": 
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return today;
      case "week": return startOfWeek(now);
      case "month": return startOfMonth(now);
      default: return null;
    }
  };

  const fetchData = async (tenantId: string) => {
    setIsLoading(true);
    try {
      // 1. FETCH ITEMS (STRICT TENANT ISOLATION)
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

      // 2. FETCH BILLS (STRICT TENANT ISOLATION)
      const startDate = getDateFilter();
      let query = supabase.from("bills").select("*").eq("tenant_id", tenantId);
      
      if (startDate) {
        query = query.gte("created_at", startDate.toISOString());
      }
      
      const { data: bills, error: billsError } = await query;
      if (billsError) throw billsError;

      let totalSales = 0;
      let cashCollected = 0;
      let pendingUdhaar = 0;

      (bills || []).forEach(bill => {
        const amount = Math.abs(bill.final_amount);
        totalSales += amount;
        if (bill.payment_status === 'pending') {
          pendingUdhaar += amount;
        } else {
          cashCollected += amount;
        }
      });

      setMetrics({
        totalPurchaseValue: purchaseVal,
        totalSellingValue: sellingVal,
        lowStockCount: lowStock,
        totalSales,
        cashCollected,
        pendingUdhaar
      });

      // 3. FETCH RECENT UDHAAR (STRICT TENANT ISOLATION)
      const { data: pendingBills } = await supabase
        .from("bills")
        .select("*")
        .eq("payment_status", "pending")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(5);
      
      setRecentUdhaar(pendingBills || []);

      // 4. FETCH CHART DATA
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
          .eq("tenant_id", tenantId) // STRICT ISOLATION
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
      toast({
        title: "Error",
        description: error.message || "Failed to fetch data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  const formatCompactNumber = (number: number) => {
    return new Intl.NumberFormat('en-IN', { notation: "compact", compactDisplay: "short" }).format(number);
  };

  const filteredItems = items
    .filter(
      (item) =>
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
          const path = fileName;
          const result = await Filesystem.writeFile({
            path: path,
            data: excelBase64,
            directory: Directory.Cache, 
          });
  
          await Share.share({
            title: "Export Inventory",
            text: "Here is your inventory file",
            url: result.uri, 
            dialogTitle: "Save or Share Excel",
          });
        } else {
          XLSX.writeFile(wb, fileName);
        }
        toast({ title: "Success", description: "Sheet generated successfully" });
      } catch (error: any) {
        toast({
          title: "Export Failed",
          description: error.message || "Could not save file",
          variant: "destructive",
        });
      }
    };

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in pb-20 md:pb-6 px-2 md:px-0">
        
        {/* --- APP HEADER --- */}
        <div className="flex flex-col gap-4 sticky top-0 bg-background/95 backdrop-blur z-20 py-4 -mx-2 px-2 border-b md:static md:border-0 md:p-0 md:mx-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">Analytics</h1>
              <p className="text-xs text-slate-500 font-medium mt-1">Store performance & metrics</p>
            </div>
            <Badge variant="secondary" className="bg-slate-100 text-slate-700 font-bold px-3 py-1 shadow-sm">
               {dateRange === 'all' ? 'All Time' : dateRange.charAt(0).toUpperCase() + dateRange.slice(1)}
            </Badge>
          </div>
          
          <Tabs defaultValue="month" value={dateRange} onValueChange={setDateRange} className="w-full">
            <TabsList className="w-full grid grid-cols-4 bg-slate-100/80 p-1 rounded-xl">
              <TabsTrigger value="today" className="text-xs font-bold rounded-lg data-[state=active]:shadow-sm">Today</TabsTrigger>
              <TabsTrigger value="week" className="text-xs font-bold rounded-lg data-[state=active]:shadow-sm">Week</TabsTrigger>
              <TabsTrigger value="month" className="text-xs font-bold rounded-lg data-[state=active]:shadow-sm">Month</TabsTrigger>
              <TabsTrigger value="all" className="text-xs font-bold rounded-lg data-[state=active]:shadow-sm">All</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* --- METRICS GRID --- */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          
          <Card className="shadow-sm border-0 ring-1 ring-slate-200 rounded-2xl overflow-hidden">
            <CardContent className="p-4 flex flex-col justify-between h-full bg-gradient-to-br from-white to-slate-50">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] text-slate-500 font-black tracking-wider uppercase">Sales</span>
                <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center"><TrendingUp className="h-3 w-3 text-slate-600" /></div>
              </div>
              <div className="text-2xl font-black text-slate-900">{formatCompactNumber(metrics.totalSales)}</div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-0 ring-1 ring-green-200 rounded-2xl overflow-hidden">
            <CardContent className="p-4 flex flex-col justify-between h-full bg-gradient-to-br from-green-50 to-green-100/50">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] text-green-700 font-black tracking-wider uppercase">Cash</span>
                <div className="h-6 w-6 rounded-full bg-green-200/50 flex items-center justify-center"><Banknote className="h-3 w-3 text-green-700" /></div>
              </div>
              <div className="text-2xl font-black text-green-700">{formatCompactNumber(metrics.cashCollected)}</div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-0 ring-1 ring-orange-200 rounded-2xl overflow-hidden col-span-2 lg:col-span-1">
            <CardContent className="p-4 flex flex-col justify-between h-full bg-gradient-to-br from-orange-50 to-orange-100/50">
              <div className="flex items-center justify-between mb-3">
                 <span className="text-[10px] text-orange-700 font-black tracking-wider uppercase">Udhaar Due</span>
                 <div className="h-6 w-6 rounded-full bg-orange-200/50 flex items-center justify-center"><AlertCircle className="h-3 w-3 text-orange-700" /></div>
              </div>
              <div className="text-2xl font-black text-orange-700">{formatCurrency(metrics.pendingUdhaar)}</div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-0 ring-1 ring-indigo-200 rounded-2xl overflow-hidden col-span-2 lg:col-span-1">
            <CardContent className="p-4 flex flex-col justify-between h-full bg-gradient-to-br from-indigo-50 to-indigo-100/50">
              <div className="flex items-center justify-between mb-3">
                 <span className="text-[10px] text-indigo-700 font-black tracking-wider uppercase">Stock Value</span>
                 <div className="h-6 w-6 rounded-full bg-indigo-200/50 flex items-center justify-center"><Wallet className="h-3 w-3 text-indigo-700" /></div>
              </div>
              <div className="flex justify-between items-end">
                <div>
                   <div className="text-[10px] text-indigo-500 font-bold uppercase mb-0.5">Invested</div>
                   <div className="text-lg font-black text-indigo-900">{formatCompactNumber(metrics.totalPurchaseValue)}</div>
                </div>
                <div className="text-right">
                   <div className="text-[10px] text-indigo-500 font-bold uppercase mb-0.5">Potential</div>
                   <div className="text-sm font-black text-green-600">{formatCompactNumber(metrics.totalSellingValue)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* --- PENDING PAYMENTS WIDGET --- */}
        {recentUdhaar.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-400" /> Pending Udhaar
              </h2>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] font-bold text-slate-500 uppercase tracking-wider">View All <ArrowRight className="ml-1 h-3 w-3"/></Button>
            </div>
            <div className="flex overflow-x-auto gap-3 pb-2 -mx-2 px-2 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:mx-0 md:px-0 hidden-scrollbar">
              {recentUdhaar.map((bill) => (
                <Card key={bill.id} className="min-w-[240px] border-0 ring-1 ring-orange-200 bg-white shadow-sm rounded-2xl shrink-0 hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="font-bold text-sm text-slate-800">{bill.customer_name || "Unknown"}</div>
                        <div className="text-[11px] font-medium text-slate-400">{bill.customer_phone}</div>
                      </div>
                      <Badge variant="outline" className="text-[9px] bg-slate-50 text-slate-500 border-slate-200 font-bold uppercase tracking-wider px-2">
                        {new Date(bill.created_at).toLocaleDateString(undefined, {month:'short', day:'numeric'})}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-end pt-3 border-t border-dashed border-slate-200">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Due Amount</span>
                      <span className="font-black text-lg text-orange-600 leading-none">₹{bill.final_amount}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* --- CHART SECTION --- */}
        <Card className="shadow-sm border-0 ring-1 ring-slate-200 rounded-2xl overflow-hidden bg-white">
          <CardHeader className="p-5 pb-2 border-b border-slate-50">
            <CardTitle className="text-sm font-black text-slate-800">Sales Trend (Last 7 Days)</CardTitle>
          </CardHeader>
          <CardContent className="p-0 pt-4">
            <div className="h-[220px] w-full pr-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={salesData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{fontSize: 10, fill: '#94a3b8', fontWeight: 600}} axisLine={false} tickLine={false} dy={10} />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', padding: '12px', fontWeight: 'bold' }}
                    itemStyle={{ color: '#0f172a' }}
                    formatter={(value: number) => [`₹${value}`, "Sales"]}
                    labelStyle={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase', marginBottom: '4px' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="#3b82f6"
                    fillOpacity={1}
                    fill="url(#colorSales)"
                    strokeWidth={3}
                    activeDot={{ r: 6, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* --- INVENTORY LIST --- */}
        <Card className="shadow-sm border-0 ring-1 ring-slate-200 rounded-2xl overflow-hidden bg-white">
          <CardHeader className="p-4 flex flex-row items-center justify-between bg-slate-50 border-b border-slate-100">
            <div>
              <CardTitle className="text-sm font-black text-slate-800">Inventory Status</CardTitle>
              {metrics.lowStockCount > 0 && (
                 <span className="text-[10px] text-red-500 font-bold uppercase tracking-wider flex items-center gap-1 mt-1">
                   <AlertTriangle className="h-3 w-3" /> {metrics.lowStockCount} Low Stock
                 </span>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={exportToExcel} className="h-8 rounded-lg shadow-sm font-bold text-xs bg-white">
              <Download className="h-3 w-3 mr-2" /> Export
            </Button>
          </CardHeader>
          
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search inventory..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-10 text-sm bg-slate-50 border-slate-200 rounded-xl font-medium focus-visible:ring-primary/20"
              />
            </div>
          </div>

          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="text-xs hover:bg-transparent border-slate-100">
                  <TableHead className="w-[50%] pl-5 font-bold text-slate-500 uppercase tracking-wider">Item</TableHead>
                  <TableHead className="text-right font-bold text-slate-500 uppercase tracking-wider">Price</TableHead>
                  <TableHead className="text-right pr-5 font-bold text-slate-500 uppercase tracking-wider">Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-12 text-slate-400 font-medium">Loading inventory...</TableCell></TableRow>
                ) : filteredItems.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-12 text-slate-400 font-medium">No items found</TableCell></TableRow>
                ) : (
                  filteredItems.map((item) => (
                    <TableRow key={item.id} className="border-b-slate-50 hover:bg-slate-50/50 transition-colors">
                      <TableCell className="py-3 pl-5">
                        <div className="font-bold text-sm text-slate-800 truncate max-w-[160px]">{item.item_name}</div>
                        <div className="text-[10px] text-slate-400 font-medium mt-0.5">{item.item_code}</div>
                      </TableCell>
                      <TableCell className="text-right py-3 text-sm font-bold text-slate-700">₹{item.selling_price}</TableCell>
                      <TableCell className="text-right py-3 pr-5">
                        <Badge 
                          variant="outline"
                          className={`text-[10px] font-black uppercase tracking-widest px-2 border-0
                            ${item.quantity <= 5 ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600'}
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
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}