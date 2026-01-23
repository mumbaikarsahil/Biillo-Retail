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
  const [items, setItems] = useState<Item[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState("month"); 
  
  // Stats State
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

  useEffect(() => {
    fetchData();
  }, [dateRange]); 

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

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // 1. FETCH ITEMS
      const { data: itemsData, error: itemsError } = await supabase
        .from("items")
        .select("*")
        .order("item_name");

      if (itemsError) throw itemsError;
      setItems(itemsData || []);

      const purchaseVal = (itemsData || []).reduce((sum, item) => sum + (item.purchase_price || 0) * item.quantity, 0);
      const sellingVal = (itemsData || []).reduce((sum, item) => sum + (item.selling_price || 0) * item.quantity, 0);
      const lowStock = (itemsData || []).filter((item) => item.quantity < 5).length;

      // 2. FETCH BILLS
      const startDate = getDateFilter();
      let query = supabase.from("bills").select("*");
      
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

      // 3. FETCH RECENT UDHAAR
      const { data: pendingBills } = await supabase
        .from("bills")
        .select("*")
        .eq("payment_status", "pending")
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
        // 1. Prepare Data
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
  
        // 2. Check Platform
        if (Capacitor.isNativePlatform()) {
          // --- MOBILE LOGIC ---
          
          // A. Generate Base64 string of the Excel file
          const excelBase64 = XLSX.write(wb, { bookType: "xlsx", type: "base64" });
  
          // B. Save to Device Cache (No permissions needed usually)
          const path = fileName;
          const result = await Filesystem.writeFile({
            path: path,
            data: excelBase64,
            directory: Directory.Cache, // Writing to Cache is safest
          });
  
          // C. Open the "Share" sheet so user can save/send it
          await Share.share({
            title: "Export Inventory",
            text: "Here is your inventory file",
            url: result.uri, // The native file path
            dialogTitle: "Save or Share Excel",
          });
  
        } else {
          // --- WEB LOGIC (Keep existing) ---
          XLSX.writeFile(wb, fileName);
        }
  
        toast({ title: "Success", description: "Sheet generated successfully" });
  
      } catch (error: any) {
        console.error("Export failed:", error);
        toast({
          title: "Export Failed",
          description: error.message || "Could not save file",
          variant: "destructive",
        });
      }
    };

  return (
    <AppLayout>
      <div className="space-y-4 animate-fade-in pb-20 md:pb-0">
        
        {/* APP HEADER */}
        <div className="flex flex-col gap-4 sticky top-0 bg-background/95 backdrop-blur z-10 py-2 -mx-4 px-4 border-b md:static md:border-0 md:p-0">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold tracking-tight">Analytics</h1>
            <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded-full">
               {dateRange === 'all' ? 'All Time' : dateRange.charAt(0).toUpperCase() + dateRange.slice(1)}
            </span>
          </div>
          
          <Tabs defaultValue="month" value={dateRange} onValueChange={setDateRange} className="w-full">
            <TabsList className="w-full grid grid-cols-4">
              <TabsTrigger value="today" className="text-xs">Today</TabsTrigger>
              <TabsTrigger value="week" className="text-xs">Week</TabsTrigger>
              <TabsTrigger value="month" className="text-xs">Month</TabsTrigger>
              <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* METRICS GRID - Mobile Optimized (2 cols) */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          
          {/* Total Sales */}
          <Card className="shadow-sm">
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground font-medium">SALES</span>
                <TrendingUp className="h-3 w-3 text-muted-foreground" />
              </div>
              <div className="text-lg font-bold">{formatCompactNumber(metrics.totalSales)}</div>
            </CardContent>
          </Card>

          {/* Cash Collected */}
          <Card className="shadow-sm bg-green-50/40 border-green-100">
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-green-700 font-medium">CASH</span>
                <Banknote className="h-3 w-3 text-green-600" />
              </div>
              <div className="text-lg font-bold text-green-700">{formatCompactNumber(metrics.cashCollected)}</div>
            </CardContent>
          </Card>

          {/* Pending Udhaar */}
          <Card className="shadow-sm bg-orange-50/40 border-orange-100 col-span-2 md:col-span-1">
            <CardContent className="p-4 flex flex-row md:flex-col items-center justify-between">
              <div className="flex flex-col">
                 <span className="text-xs text-orange-700 font-medium mb-1">UDHAAR (PENDING)</span>
                 <div className="text-2xl font-bold text-orange-700">{formatCurrency(metrics.pendingUdhaar)}</div>
              </div>
              <div className="h-10 w-10 bg-orange-100 rounded-full flex items-center justify-center">
                 <AlertCircle className="h-5 w-5 text-orange-600" />
              </div>
            </CardContent>
          </Card>

          {/* Inventory Valuation */}
          <Card className="shadow-sm border-l-4 border-l-primary col-span-2 md:col-span-1">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                 <Wallet className="h-3 w-3 text-muted-foreground" />
                 <span className="text-xs text-muted-foreground font-bold">STOCK VALUE</span>
              </div>
              <div className="flex justify-between items-end">
                <div>
                   <div className="text-xs text-muted-foreground">Invested</div>
                   <div className="text-lg font-bold">{formatCompactNumber(metrics.totalPurchaseValue)}</div>
                </div>
                <div className="text-right">
                   <div className="text-xs text-muted-foreground">Potential</div>
                   <div className="text-sm font-semibold text-green-600">{formatCompactNumber(metrics.totalSellingValue)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* PENDING PAYMENTS (Horizontal Scroll on Mobile) */}
        {recentUdhaar.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4" /> Pending Payments
              </h2>
              <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground">View All <ArrowRight className="ml-1 h-3 w-3"/></Button>
            </div>
            <div className="flex overflow-x-auto gap-3 pb-2 -mx-4 px-4 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:mx-0 md:px-0">
              {recentUdhaar.map((bill) => (
                <Card key={bill.id} className="min-w-[240px] border-orange-100 bg-orange-50/10">
                  <CardContent className="p-3">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-semibold text-sm">{bill.customer_name || "Unknown"}</div>
                        <div className="text-xs text-muted-foreground">{bill.customer_phone}</div>
                      </div>
                      <Badge variant="outline" className="text-[10px] bg-white text-orange-600 border-orange-200">
                        {new Date(bill.created_at).toLocaleDateString(undefined, {month:'short', day:'numeric'})}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center mt-3 pt-3 border-t border-orange-100">
                      <span className="text-xs text-muted-foreground">Amount Due</span>
                      <span className="font-bold text-orange-700">₹{bill.final_amount}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* CHART SECTION */}
        <Card className="shadow-sm">
          <CardHeader className="p-4 pb-0">
            <CardTitle className="text-sm font-medium">Sales Trend (7 Days)</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={salesData}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted/50" />
                  <XAxis dataKey="date" tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    formatter={(value: number) => [`₹${value}`, ""]}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="hsl(var(--primary))"
                    fillOpacity={1}
                    fill="url(#colorSales)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* INVENTORY LIST */}
        <Card className="shadow-sm border-0 md:border">
          <CardHeader className="p-4 flex flex-row items-center justify-between bg-muted/20">
            <div>
              <CardTitle className="text-base">Inventory</CardTitle>
              {metrics.lowStockCount > 0 && (
                 <span className="text-xs text-red-500 font-medium flex items-center gap-1 mt-1">
                   <AlertTriangle className="h-3 w-3" /> {metrics.lowStockCount} Low Stock
                 </span>
              )}
            </div>
            <Button size="icon" variant="outline" onClick={exportToExcel} className="h-8 w-8">
              <Download className="h-4 w-4" />
            </Button>
          </CardHeader>
          
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm bg-muted/30 border-none"
              />
            </div>
          </div>

          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="text-xs hover:bg-transparent">
                  <TableHead className="w-[50%] pl-4">Item</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right pr-4">Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : filteredItems.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No items</TableCell></TableRow>
                ) : (
                  filteredItems.map((item) => (
                    <TableRow key={item.id} className="border-b-muted/50">
                      <TableCell className="py-3 pl-4">
                        <div className="font-medium text-sm truncate max-w-[160px]">{item.item_name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{item.item_code}</div>
                      </TableCell>
                      <TableCell className="text-right py-3 text-sm">₹{item.selling_price}</TableCell>
                      <TableCell className="text-right py-3 pr-4">
                        <Badge 
                          variant={item.quantity <= 5 ? "destructive" : "secondary"}
                          className={`text-[10px] h-5 px-1.5 ${item.quantity > 5 ? 'bg-muted text-foreground hover:bg-muted' : ''}`}
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