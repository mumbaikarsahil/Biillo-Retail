import React, { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
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
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { 
  Users, 
  Search, 
  Download, 
  Phone, 
  ShoppingBag, 
  Loader2, 
  UserCheck,
  TrendingUp,
  Calendar,
  ArrowUpRight
} from "lucide-react";

interface BillRecord {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  final_amount: number;
  created_at: string;
}

interface CustomerProfile {
  phone: string;
  name: string;
  totalOrders: number;
  totalSpent: number;
  lastVisit: string;
}

export default function CRM() {
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  // 1. Fetch bills & aggregate by customer
  useEffect(() => {
    const fetchCustomerData = async () => {
      setIsLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("tenant_id")
          .eq("id", session.user.id)
          .single();

        let query = supabase
          .from("bills")
          .select("id, customer_name, customer_phone, final_amount, created_at")
          .order("created_at", { ascending: false });

        if (profile?.tenant_id) {
          query = query.eq("tenant_id", profile.tenant_id);
        }

        const { data: bills, error } = await query;
        if (error) throw error;

        const customerMap: Record<string, CustomerProfile> = {};

        (bills as BillRecord[] | null)?.forEach((bill) => {
          const phoneKey = bill.customer_phone?.trim() || "No Phone";
          const nameVal = bill.customer_name?.trim() || "Walk-in Customer";

          if (phoneKey === "No Phone" && nameVal === "Walk-in Customer") return;

          const uniqueKey = `${phoneKey}_${nameVal.toLowerCase()}`;

          if (!customerMap[uniqueKey]) {
            customerMap[uniqueKey] = {
              phone: phoneKey,
              name: nameVal,
              totalOrders: 0,
              totalSpent: 0,
              lastVisit: bill.created_at,
            };
          }

          customerMap[uniqueKey].totalOrders += 1;
          customerMap[uniqueKey].totalSpent += Number(bill.final_amount || 0);

          if (new Date(bill.created_at) > new Date(customerMap[uniqueKey].lastVisit)) {
            customerMap[uniqueKey].lastVisit = bill.created_at;
          }
        });

        const aggregatedList = Object.values(customerMap).sort(
          (a, b) => b.totalSpent - a.totalSpent
        );

        setCustomers(aggregatedList);
      } catch (err: any) {
        toast({
          title: "Error fetching CRM data",
          description: err.message || "Failed to load customer list.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchCustomerData();
  }, [toast]);

  // 2. Search & Filter
  const filteredCustomers = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q)
    );
  }, [customers, searchTerm]);

  // 3. Export to CSV functionality
  const handleExportCSV = () => {
    if (filteredCustomers.length === 0) {
      toast({ title: "No data to export", variant: "destructive" });
      return;
    }

    const headers = ["Customer Name", "Phone Number", "Total Orders", "Total Spent (INR)", "Last Visit Date"];
    
    const rows = filteredCustomers.map((c) => [
      `"${c.name.replace(/"/g, '""')}"`,
      `"${c.phone}"`,
      c.totalOrders,
      c.totalSpent.toFixed(2),
      `"${new Date(c.lastVisit).toLocaleDateString("en-IN")}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Biillo_CRM_Customers_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Export Successful",
      description: `Downloaded ${filteredCustomers.length} customer profiles.`,
    });
  };

  // 4. Summary Metrics
  const totalSpendAll = useMemo(
    () => customers.reduce((sum, c) => sum + c.totalSpent, 0),
    [customers]
  );
  const repeatCustomersCount = useMemo(
    () => customers.filter((c) => c.totalOrders > 1).length,
    [customers]
  );

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-24 md:pb-8 font-sans">
        
        {/* --- STICKY HEADER WITH SEARCH & EXPORT --- */}
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 sticky top-0 z-20 bg-zinc-50/80 backdrop-blur-md py-4 -mx-4 px-4 md:static md:bg-transparent md:p-0 md:mx-0 border-b border-zinc-200/60 md:border-0">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900">Customer CRM</h1>
            <p className="text-muted-foreground mt-0.5 text-xs sm:text-sm font-medium">
              View purchase histories, loyalty stats, and export audience lists
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input
                placeholder="Search by customer name or phone..."
                className="pl-9 h-11 bg-white border-zinc-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)] rounded-xl focus-visible:ring-zinc-900"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <Button
              onClick={handleExportCSV}
              disabled={isLoading || filteredCustomers.length === 0}
              className="h-11 rounded-xl font-semibold bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm shrink-0"
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* --- METRICS CARDS --- */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] rounded-2xl bg-white">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">Total Customers</span>
                <span className="text-2xl font-bold text-zinc-900 font-mono mt-1 block">{customers.length}</span>
              </div>
              <div className="h-10 w-10 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-center text-zinc-500">
                <Users className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] rounded-2xl bg-white">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">Repeat Buyers</span>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-2xl font-bold text-zinc-900 font-mono">{repeatCustomersCount}</span>
                  <span className="text-xs font-mono text-zinc-400">
                    ({customers.length ? ((repeatCustomersCount / customers.length) * 100).toFixed(0) : 0}%)
                  </span>
                </div>
              </div>
              <div className="h-10 w-10 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-center text-zinc-500">
                <UserCheck className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] rounded-2xl bg-white">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">Total Spend</span>
                <span className="text-2xl font-bold text-zinc-900 font-mono mt-1 block">
                  ₹{totalSpendAll.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="h-10 w-10 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-center text-zinc-500">
                <TrendingUp className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* --- CONTENT AREA --- */}
        {isLoading ? (
          <div className="flex flex-col justify-center items-center h-48 gap-3 text-zinc-400">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-900" />
            <span className="text-sm font-medium">Loading customer records...</span>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <Card className="border border-dashed border-zinc-300 shadow-none bg-zinc-50/50">
            <CardContent className="flex flex-col items-center justify-center py-16 text-zinc-500">
              <Users className="h-10 w-10 mb-3 text-zinc-300" />
              <p className="font-semibold text-zinc-900">No customers found</p>
              <p className="text-sm mt-1">We couldn't find anything matching "{searchTerm}"</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* --- MOBILE VIEW (CARDS) --- */}
            <div className="grid grid-cols-1 gap-4 md:hidden">
              {filteredCustomers.map((c, idx) => (
                <Card key={idx} className="border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] rounded-2xl overflow-hidden bg-white">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 pr-2">
                        <h3 className="font-semibold text-sm text-zinc-900 truncate">{c.name}</h3>
                        <div className="flex items-center gap-1.5 pt-1">
                          <Phone className="h-3 w-3 text-zinc-400 shrink-0" />
                          {c.phone !== "No Phone" ? (
                            <a 
                              href={`tel:${c.phone}`} 
                              className="text-xs font-mono font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-2"
                            >
                              {c.phone}
                            </a>
                          ) : (
                            <span className="text-xs font-mono text-zinc-400">No Phone</span>
                          )}
                        </div>
                      </div>
                      <span className="font-bold text-base text-zinc-900 shrink-0 font-mono">
                        ₹{c.totalSpent.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-zinc-50/80 border border-zinc-200/60 p-2.5 rounded-xl">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Total Orders</span>
                        <span className="font-medium text-zinc-800 flex items-center gap-1 mt-0.5">
                          <ShoppingBag className="h-3 w-3 text-zinc-400" />
                          {c.totalOrders} {c.totalOrders === 1 ? "order" : "orders"}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Last Visit</span>
                        <span className="font-medium text-zinc-800 flex items-center gap-1 mt-0.5">
                          <Calendar className="h-3 w-3 text-zinc-400" />
                          {new Date(c.lastVisit).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* --- DESKTOP VIEW (TABLE) --- */}
            <Card className="hidden md:block shadow-[0_1px_3px_rgba(0,0,0,0.02)] border-zinc-200/80 rounded-2xl overflow-hidden bg-white">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-zinc-50/50">
                      <TableRow className="border-b border-zinc-200/80">
                        <TableHead className="font-semibold text-zinc-500 uppercase tracking-wider text-[11px] pl-6 py-3.5">Customer Name</TableHead>
                        <TableHead className="font-semibold text-zinc-500 uppercase tracking-wider text-[11px] py-3.5">Phone Number</TableHead>
                        <TableHead className="font-semibold text-zinc-500 uppercase tracking-wider text-[11px] text-center py-3.5">Total Orders</TableHead>
                        <TableHead className="font-semibold text-zinc-500 uppercase tracking-wider text-[11px] text-right py-3.5">Total Spent</TableHead>
                        <TableHead className="font-semibold text-zinc-500 uppercase tracking-wider text-[11px] text-right pr-6 py-3.5">Last Visit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCustomers.map((c, idx) => (
                        <TableRow key={idx} className="border-b border-zinc-100 hover:bg-zinc-50/50 transition-colors group">
                          <TableCell className="pl-6 py-3.5 font-semibold text-sm text-zinc-900">{c.name}</TableCell>
                          <TableCell className="py-3.5 font-mono text-xs font-medium text-zinc-600">
                            <div className="flex items-center gap-1.5">
                              <span>{c.phone}</span>
                              {c.phone !== "No Phone" && (
                                <a 
                                  href={`tel:${c.phone}`} 
                                  className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-zinc-900"
                                  title="Call customer"
                                >
                                  <ArrowUpRight className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-3.5 text-center">
                            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded font-mono text-[11px] font-semibold bg-zinc-100 text-zinc-800 border border-zinc-200/60">
                              {c.totalOrders}
                            </span>
                          </TableCell>
                          <TableCell className="py-3.5 text-right font-mono font-semibold text-sm text-zinc-900">
                            ₹{c.totalSpent.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="pr-6 py-3.5 text-right font-mono text-xs text-zinc-500">
                            {new Date(c.lastVisit).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}

      </div>
    </AppLayout>
  );
}