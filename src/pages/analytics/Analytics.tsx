import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Package,
  TrendingUp,
  AlertTriangle,
  Download,
  Search,
  IndianRupee,
} from "lucide-react";

type DailySales = {
  date: string;
  amount: number;
};

export default function Analytics() {
  const [items, setItems] = useState<Item[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [totalInventoryValue, setTotalInventoryValue] = useState(0);
  const [todaySales, setTodaySales] = useState(0);
  const [monthSales, setMonthSales] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [salesData, setSalesData] = useState<DailySales[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch all items
      const { data: itemsData, error: itemsError } = await supabase
        .from("items")
        .select("*")
        .order("item_name");

      if (itemsError) throw itemsError;
      setItems(itemsData || []);

      // Calculate inventory value
      const inventoryValue = (itemsData || []).reduce(
        (sum, item) => sum + item.selling_price * item.quantity,
        0
      );
      setTotalInventoryValue(inventoryValue);

      // Count low stock items (less than 5)
      const lowStock = (itemsData || []).filter((item) => item.quantity < 5).length;
      setLowStockCount(lowStock);

      // Fetch today's sales
      const today = new Date().toISOString().split("T")[0];
      const { data: todayBills, error: todayError } = await supabase
        .from("bills")
        .select("final_amount")
        .gte("created_at", `${today}T00:00:00`)
        .lte("created_at", `${today}T23:59:59`)
        .gt("final_amount", 0);

      if (todayError) throw todayError;
      const todayTotal = (todayBills || []).reduce((sum, bill) => sum + bill.final_amount, 0);
      setTodaySales(todayTotal);

      // Fetch month sales
      const firstOfMonth = new Date();
      firstOfMonth.setDate(1);
      firstOfMonth.setHours(0, 0, 0, 0);

      const { data: monthBills, error: monthError } = await supabase
        .from("bills")
        .select("final_amount")
        .gte("created_at", firstOfMonth.toISOString())
        .gt("final_amount", 0);

      if (monthError) throw monthError;
      const monthTotal = (monthBills || []).reduce((sum, bill) => sum + bill.final_amount, 0);
      setMonthSales(monthTotal);

      // Fetch last 7 days sales for chart
      const last7Days: DailySales[] = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split("T")[0];

        const { data: dayBills } = await supabase
          .from("bills")
          .select("final_amount")
          .gte("created_at", `${dateStr}T00:00:00`)
          .lte("created_at", `${dateStr}T23:59:59`)
          .gt("final_amount", 0);

        const dayTotal = (dayBills || []).reduce((sum, bill) => sum + bill.final_amount, 0);
        last7Days.push({
          date: date.toLocaleDateString("en-US", { weekday: "short" }),
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

  const filteredItems = items
    .filter(
      (item) =>
        item.item_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.brand_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.supplier_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.item_code.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .map(item => ({
      ...item,
      // Add formatted stock display
      stockDisplay: item.pieces_per_box > 1 
        ? `${Math.floor(item.quantity / item.pieces_per_box)} unit${Math.floor(item.quantity / item.pieces_per_box) !== 1 ? 's' : ''} + ${item.quantity % item.pieces_per_box} pc${item.quantity % item.pieces_per_box !== 1 ? 's' : ''}`
        : `${item.quantity} pc${item.quantity !== 1 ? 's' : ''}`
    }));

  const exportToExcel = () => {
    const exportData = filteredItems.map((item) => ({
      "Item Code": item.item_code,
      "Item Name": item.item_name,
      Make: item.make,
      Brand: item.brand_name,
      "Purchase Price": item.purchase_price,
      "Selling Price": item.selling_price,
      "Supplier Code": item.supplier_code,
      "Pieces per Unit": item.pieces_per_box,
      "Total Pieces": item.quantity,
      "Stock Display": item.stockDisplay,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventory");
    XLSX.writeFile(wb, `Inventory_${new Date().toISOString().split("T")[0]}.xlsx`);

    toast({
      title: "Export Complete",
      description: "Inventory data exported to Excel",
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analytics Dashboard</h1>
          <p className="text-muted-foreground">Overview of your inventory and sales</p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Inventory Value</CardTitle>
              <IndianRupee className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{totalInventoryValue.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">{items.length} unique items</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today's Sales</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">₹{todaySales.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Real-time tracking</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">This Month</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{monthSales.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {new Date().toLocaleDateString("en-US", { month: "long" })}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Low Stock Alerts</CardTitle>
              <AlertTriangle className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">{lowStockCount}</div>
              <p className="text-xs text-muted-foreground">Items below 5 units</p>
            </CardContent>
          </Card>
        </div>

        {/* Sales Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Sales - Last 7 Days</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={salesData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "var(--radius)",
                    }}
                    formatter={(value: number) => [`₹${value.toLocaleString()}`, "Sales"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary) / 0.2)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Inventory Table */}
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle>Inventory</CardTitle>
            <div className="flex gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search items..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button onClick={exportToExcel} variant="outline">
                <Download className="h-4 w-4 mr-2" /> Export
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden md:table-cell">Brand</TableHead>
                    <TableHead className="hidden lg:table-cell">Supplier</TableHead>
                    <TableHead className="text-center">Size</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Pieces/Unit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : filteredItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No items found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-sm">{item.item_code}</TableCell>
                        <TableCell className="font-medium">{item.item_name}</TableCell>
                        <TableCell className="hidden md:table-cell">{item.brand_name}</TableCell>
                        <TableCell className="hidden lg:table-cell">{item.supplier_code}</TableCell>
                        <TableCell className="text-center">
                          {item.size && item.size !== 'Free Size' && (
                            <Badge variant="outline" className="text-xs">
                              {item.size}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">₹{item.selling_price}</TableCell>
                        <TableCell className="text-right">
                          <Badge 
                            variant={item.quantity === 0 ? "destructive" : item.quantity <= 5 ? "destructive" : "outline"}
                            className="whitespace-nowrap"
                          >
                            {item.stockDisplay}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary" className="whitespace-nowrap">
                            {item.pieces_per_box} pcs
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
