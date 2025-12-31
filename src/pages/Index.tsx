import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, Receipt, BarChart3, Plus, QrCode } from "lucide-react";
import { Link } from "react-router-dom";
import { isSupabaseConfigured } from "@/lib/supabase";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const Index = () => {
  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Welcome to your retail inventory management system</p>
        </div>

        {/* Connection Status */}
        {!isSupabaseConfigured && (
          <Alert variant="destructive">
            <AlertTitle>Database not connected</AlertTitle>
            <AlertDescription>
              Please configure your Supabase credentials in project secrets to enable full functionality.
            </AlertDescription>
          </Alert>
        )}

        {/* Quick Actions */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card className="hover:shadow-lg transition-shadow border-border/50 bg-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-semibold">Add Inventory</CardTitle>
              <Package className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <CardDescription className="mb-4">
                Register new items, generate QR codes, and manage your stock levels
              </CardDescription>
              <Button asChild className="w-full">
                <Link to="/inventory/add">
                  <Plus className="mr-2 h-4 w-4" />
                  Add New Item
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow border-border/50 bg-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-semibold">Billing</CardTitle>
              <Receipt className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <CardDescription className="mb-4">
                Scan items, process sales, apply discounts, and handle returns
              </CardDescription>
              <Button asChild variant="secondary" className="w-full">
                <Link to="/billing">
                  <QrCode className="mr-2 h-4 w-4" />
                  Start Billing
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow border-border/50 bg-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-semibold">Analytics</CardTitle>
              <BarChart3 className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <CardDescription className="mb-4">
                View sales reports, track trends, and export inventory data
              </CardDescription>
              <Button asChild variant="outline" className="w-full">
                <Link to="/analytics">
                  <BarChart3 className="mr-2 h-4 w-4" />
                  View Reports
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Info Section */}
        <Card className="bg-muted/30 border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Getting Started</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>• <strong>Add Inventory:</strong> Register products with name, price, quantity, and auto-generated QR codes</p>
            <p>• <strong>Billing:</strong> Scan QR codes to add items to cart, apply discounts, and complete sales</p>
            <p>• <strong>Analytics:</strong> Track daily/monthly sales and export inventory to Excel</p>
            <p>• <strong>Returns:</strong> Use return mode in billing to process product returns</p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Index;
