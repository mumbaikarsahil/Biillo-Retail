import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import QRCode from "react-qr-code";
import { jsPDF } from "jspdf";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase, Item } from "@/lib/supabase";
import { Download, Plus, QrCode } from "lucide-react";

const formSchema = z.object({
  item_name: z.string().min(1, "Item name is required"),
  make: z.string().min(1, "Make is required"),
  brand_name: z.string().min(1, "Brand name is required"),
  purchase_price: z.coerce.number().positive("Must be positive"),
  selling_price: z.coerce.number().positive("Must be positive"),
  supplier_code: z.string().min(1, "Supplier code is required"),
  quantity: z.coerce.number().int().positive("Must be at least 1"),
});

type FormData = z.infer<typeof formSchema>;

function generateItemCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export default function AddInventory() {
  const [savedItem, setSavedItem] = useState<Item | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
  });

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    try {
      const itemCode = generateItemCode();
      const { data: newItem, error } = await supabase
        .from("items")
        .insert({
          item_code: itemCode,
          item_name: data.item_name,
          make: data.make,
          brand_name: data.brand_name,
          purchase_price: data.purchase_price,
          selling_price: data.selling_price,
          supplier_code: data.supplier_code,
          quantity: data.quantity,
        })
        .select()
        .single();

      if (error) throw error;

      setSavedItem(newItem);
      toast({
        title: "Item Added Successfully",
        description: `Item code: ${itemCode}`,
      });
      reset();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add item",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const downloadQRLabels = () => {
    if (!savedItem) return;

    const doc = new jsPDF();
    const labelsPerRow = 3;
    const labelsPerCol = 5;
    const labelWidth = 60;
    const labelHeight = 50;
    const startX = 15;
    const startY = 15;

    for (let i = 0; i < savedItem.quantity; i++) {
      const pageIndex = Math.floor(i / (labelsPerRow * labelsPerCol));
      const posInPage = i % (labelsPerRow * labelsPerCol);
      const col = posInPage % labelsPerRow;
      const row = Math.floor(posInPage / labelsPerRow);

      if (i > 0 && posInPage === 0) {
        doc.addPage();
      }

      const x = startX + col * labelWidth;
      const y = startY + row * labelHeight;

      // Draw QR code placeholder (we'll use text for now)
      doc.setFontSize(8);
      doc.text(savedItem.item_code, x + labelWidth / 2, y + 30, { align: "center" });
      doc.setFontSize(10);
      doc.text(`₹${savedItem.selling_price}`, x + labelWidth / 2, y + 40, { align: "center" });
      doc.rect(x, y, labelWidth - 5, labelHeight - 5);
    }

    doc.save(`QR_Labels_${savedItem.item_code}.pdf`);
    toast({
      title: "Labels Downloaded",
      description: `${savedItem.quantity} labels generated`,
    });
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Add New Stock</h1>
          <p className="text-muted-foreground">Register new items to your inventory</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Item Details
              </CardTitle>
              <CardDescription>Enter the product information</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="item_name">Item Name</Label>
                  <Input id="item_name" {...register("item_name")} placeholder="e.g., Wireless Mouse" />
                  {errors.item_name && <p className="text-sm text-destructive">{errors.item_name.message}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="make">Make</Label>
                    <Input id="make" {...register("make")} placeholder="e.g., Logitech" />
                    {errors.make && <p className="text-sm text-destructive">{errors.make.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="brand_name">Brand Name</Label>
                    <Input id="brand_name" {...register("brand_name")} placeholder="e.g., MX Master" />
                    {errors.brand_name && <p className="text-sm text-destructive">{errors.brand_name.message}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="purchase_price">Purchase Price (₹)</Label>
                    <Input id="purchase_price" type="number" step="0.01" {...register("purchase_price")} placeholder="0.00" />
                    {errors.purchase_price && <p className="text-sm text-destructive">{errors.purchase_price.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="selling_price">Selling Price (₹)</Label>
                    <Input id="selling_price" type="number" step="0.01" {...register("selling_price")} placeholder="0.00" />
                    {errors.selling_price && <p className="text-sm text-destructive">{errors.selling_price.message}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="supplier_code">Supplier Code</Label>
                    <Input id="supplier_code" {...register("supplier_code")} placeholder="e.g., SUP001" />
                    {errors.supplier_code && <p className="text-sm text-destructive">{errors.supplier_code.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Quantity</Label>
                    <Input id="quantity" type="number" {...register("quantity")} placeholder="1" />
                    {errors.quantity && <p className="text-sm text-destructive">{errors.quantity.message}</p>}
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Saving..." : "Save Item"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {savedItem && (
            <Card className="animate-fade-in">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <QrCode className="h-5 w-5" />
                  QR Code Generated
                </CardTitle>
                <CardDescription>Item code: {savedItem.item_code}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-center p-4 bg-card rounded-lg border">
                  <QRCode value={savedItem.item_code} size={150} />
                </div>
                <div className="text-center space-y-1">
                  <p className="font-medium">{savedItem.item_name}</p>
                  <p className="text-2xl font-bold text-primary">₹{savedItem.selling_price}</p>
                  <p className="text-sm text-muted-foreground">Qty: {savedItem.quantity}</p>
                </div>
                <Button onClick={downloadQRLabels} className="w-full" variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  Download QR Labels ({savedItem.quantity})
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
