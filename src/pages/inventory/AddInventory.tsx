import React, { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import QRCode from "react-qr-code";
import { jsPDF } from "jspdf";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase, Item } from "@/lib/supabase";
import { Download, Plus, QrCode } from "lucide-react";

const formSchema = z.object({
  item_name: z.string().min(1, "Item name is required"),
  make: z.string().min(1, "Make is required"),
  brand_name: z.string().min(1, "Brand name is required"),
  size: z.string().default('M'),
  purchase_price: z.coerce.number().positive("Must be positive"),
  selling_price: z.coerce.number().positive("Must be positive"),
  is_pack: z.boolean().default(false),
  price_per_piece: z.coerce.number().positive("Must be positive").optional(),
  supplier_code: z.string().min(1, "Supplier code is required"),
  pieces_per_box: z.coerce.number().int().min(1, "Must be at least 1").default(1).optional(),
  number_of_boxes: z.coerce.number().int().min(0, "Cannot be negative").default(0).optional(),
  quantity: z.coerce.number().int().min(0, "Cannot be negative").default(0),
}).refine(data => {
  if (data.is_pack) {
    return data.number_of_boxes! > 0 || data.quantity > 0;
  }
  return data.quantity > 0;
}, {
  message: "Quantity must be greater than 0",
  path: ["quantity"],
}).refine(data => {
  if (data.is_pack && data.pieces_per_box! > 1) {
    return !!data.price_per_piece;
  }
  return true;
}, {
  message: "Price per piece is required for items with multiple pieces per box",
  path: ["price_per_piece"],
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
  const [formData, setFormData] = useState<Partial<FormData>>({});
  const { toast } = useToast();
  
  // Common sizes for selection
  const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', 'Free Size'];

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      is_pack: false,
      pieces_per_box: 1,
      number_of_boxes: 0,
      quantity: 1,
      size: 'M',
      ...formData, // Load any saved form data
    },
  });
  
  // Save form data when it changes (except for quantity and pack fields)
  const handleFormChange = () => {
    const { quantity, pieces_per_box, number_of_boxes, is_pack, ...persistentData } = getValues();
    setFormData(persistentData);
  };
  
  // Clear the form completely
  const handleClearForm = () => {
    setFormData({});
    reset({
      item_name: '',
      make: '',
      brand_name: '',
      size: 'M',
      purchase_price: 0,
      selling_price: 0,
      supplier_code: '',
      is_pack: false,
      pieces_per_box: 1,
      number_of_boxes: 0,
      quantity: 1,
      price_per_piece: 0,
    });
  };

  // Get current values without causing re-renders
  const isPack = useWatch({ control, name: 'is_pack' });
  const piecesPerBox = useWatch({ control, name: 'pieces_per_box' }) || 1;
  const numberOfBoxes = useWatch({ control, name: 'number_of_boxes' }) || 0;
  
  // Calculate total quantity when pack-related fields change
  React.useEffect(() => {
    if (isPack) {
      const totalQuantity = numberOfBoxes * piecesPerBox;
      setValue('quantity', totalQuantity, { shouldValidate: true });
    }
  }, [isPack, numberOfBoxes, piecesPerBox, setValue]);

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    try {
      const itemCode = generateItemCode();
      const isPack = data.is_pack || false;
      const piecesPerBox = isPack ? (data.pieces_per_box || 1) : 1;
      const numBoxes = isPack ? (data.number_of_boxes || 0) : 0;
      
      // Save form data (except quantity and pack fields)
      const { quantity, pieces_per_box, number_of_boxes, is_pack, ...persistentData } = data;
      setFormData(persistentData);
      
      // Store persistent fields in state
      const persistentFields = {
        item_name: data.item_name,
        make: data.make,
        brand_name: data.brand_name,
        size: data.size,
        purchase_price: data.purchase_price,
        selling_price: data.selling_price,
        supplier_code: data.supplier_code
      };
      setFormData(persistentFields);
      
      // Calculate total quantity
      const totalQuantity = isPack 
        ? numBoxes * piecesPerBox + (data.quantity || 0)
        : data.quantity || 0;
      
      // Set price per piece based on pack status
      const price_per_piece = isPack && piecesPerBox > 1 
        ? data.price_per_piece 
        : data.selling_price;
      
      const { data: item, error } = await supabase
        .from("items")
        .insert({
          item_code: itemCode,
          item_name: data.item_name,
          make: data.make,
          brand_name: data.brand_name,
          size: data.size,
          purchase_price: data.purchase_price,
          selling_price: data.selling_price,
          price_per_piece: price_per_piece,
          supplier_code: data.supplier_code,
          quantity: totalQuantity,
          pieces_per_box: isPack ? piecesPerBox : 1,
        })
        .select()
        .single();

      if (error) throw error;

      setSavedItem(item);
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
    const labelHeight = 60; // Increased height to fit additional info
    const startX = 15;
    const startY = 15;
    const isPackItem = savedItem.pieces_per_box > 1;

    // Calculate number of boxes needed (one label per box, not per piece)
    const totalBoxes = Math.ceil(savedItem.quantity / (savedItem.pieces_per_box || 1));
    const totalLabels = isPackItem ? totalBoxes : savedItem.quantity;

    for (let i = 0; i < totalLabels; i++) {
      const pageIndex = Math.floor(i / (labelsPerRow * labelsPerCol));
      const posInPage = i % (labelsPerRow * labelsPerCol);
      const col = posInPage % labelsPerRow;
      const row = Math.floor(posInPage / labelsPerRow);

      if (i > 0 && posInPage === 0) {
        doc.addPage();
      }

      const x = startX + col * labelWidth;
      const y = startY + row * labelHeight;

      // Draw label border
      doc.rect(x, y, labelWidth - 5, labelHeight - 5);

      // Add item code
      doc.setFontSize(8);
      doc.text(savedItem.item_code, x + (labelWidth - 5) / 2, y + 10, { align: "center" });
      
      // Add price
      doc.setFontSize(10);
      doc.text(`₹${savedItem.selling_price}`, x + (labelWidth - 5) / 2, y + 20, { align: "center" });
      
      // Add pack size info if applicable
      if (isPackItem) {
        doc.setFontSize(8);
        doc.text(
          `Pack of ${savedItem.pieces_per_box}`, 
          x + (labelWidth - 5) / 2, 
          y + 30, 
          { align: "center" }
        );
      }
      
      // Add item name (truncated if too long)
      const itemName = savedItem.item_name.length > 15 
        ? savedItem.item_name.substring(0, 15) + '...' 
        : savedItem.item_name;
      doc.setFontSize(7);
      doc.text(itemName, x + (labelWidth - 5) / 2, y + 40, { align: "center" });
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
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Plus className="h-5 w-5" />
                    Item Details
                  </CardTitle>
                  <CardDescription>Enter the product information</CardDescription>
                </div>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={handleClearForm}
                  className="flex items-center gap-1"
                >
                  <span>Clear Form</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="item_name">Item Name</Label>
                  <Input id="item_name" {...register("item_name")} placeholder="e.g., Saree/Kurti/Innear wear" />
                  {errors.item_name && <p className="text-sm text-destructive">{errors.item_name.message}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="make">Make</Label>
                    <Input id="make" {...register("make")} placeholder="e.g., Make" />
                    {errors.make && <p className="text-sm text-destructive">{errors.make.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="brand_name">Brand Name</Label>
                    <Input id="brand_name" {...register("brand_name")} placeholder="e.g., Brand" />
                    {errors.brand_name && <p className="text-sm text-destructive">{errors.brand_name.message}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="size">Size</Label>
                    <select
                      id="size"
                      {...register("size")}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {sizes.map(size => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                    {errors.size && <p className="text-sm text-destructive">{errors.size.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="purchase_price">Purchase Price (₹)</Label>
                    <Input id="purchase_price" type="number" step="0.01" {...register("purchase_price")} placeholder="0.00" />
                    {errors.purchase_price && <p className="text-sm text-destructive">{errors.purchase_price.message}</p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="selling_price">Selling Price (₹)</Label>
                    <Input id="selling_price" type="number" step="0.01" {...register("selling_price")} placeholder="0.00" />
                    {errors.selling_price && <p className="text-sm text-destructive">{errors.selling_price.message}</p>}
                  </div>

                <div className="space-y-4 border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">Pack Item</h4>
                      <p className="text-sm text-muted-foreground">
                        Enable if this item is sold in packs/boxes with multiple pieces
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch 
                        id="is_pack" 
                        checked={isPack} 
                        onCheckedChange={(checked) => {
                          if (!checked) {
                            // When turning off pack mode, reset to single item mode
                            setValue('is_pack', false);
                            setValue('pieces_per_box', 1);
                            setValue('number_of_boxes', 0);
                            setValue('price_per_piece', undefined);
                            setValue('quantity', 1);
                          } else {
                            // When enabling pack mode, initialize pack fields
                            setValue('is_pack', true);
                            setValue('pieces_per_box', 1);
                            setValue('number_of_boxes', 1);
                            setValue('price_per_piece', 0);
                            setValue('quantity', 1);
                          }
                        }} 
                      />
                      <Label htmlFor="is_pack">Pack Item</Label>
                    </div>
                  </div>

                  {watch('is_pack') ? (
                    <div className="space-y-4 pl-7 pt-2">
                      <div className="space-y-2">
                        <Label htmlFor="price_per_piece">Price per Piece (₹)</Label>
                        <Input 
                          id="price_per_piece" 
                          type="number" 
                          min="0.01"
                          step="0.01"
                          {...register("price_per_piece")} 
                          placeholder="e.g., 100.00" 
                        />
                        {errors.price_per_piece && <p className="text-sm text-destructive">{errors.price_per_piece.message}</p>}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="pieces_per_box">Pieces per Pack</Label>
                          <Input 
                            id="pieces_per_box" 
                            type="number" 
                            min="1"
                            {...register("pieces_per_box")} 
                            placeholder="e.g., 3" 
                          />
                          {errors.pieces_per_box && <p className="text-sm text-destructive">{errors.pieces_per_box.message}</p>}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="number_of_boxes">Number of Packs</Label>
                          <Input 
                            id="number_of_boxes" 
                            type="number" 
                            min="0"
                            {...register("number_of_boxes")} 
                            placeholder="e.g., 5" 
                          />
                          {errors.number_of_boxes && <p className="text-sm text-destructive">{errors.number_of_boxes.message}</p>}
                        </div>
                      </div>
                      <div className="space-y-2 pt-2">
                        <Label>Total Quantity</Label>
                        <div className="flex items-center gap-2">
                          <Input 
                            type="number" 
                            readOnly 
                            value={numberOfBoxes * piecesPerBox} 
                            className="bg-muted"
                          />
                          <span className="text-sm text-muted-foreground whitespace-nowrap">
                            ({numberOfBoxes} pack{numberOfBoxes !== 1 ? 's' : ''} × {piecesPerBox} pcs = {numberOfBoxes * piecesPerBox} pcs)
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="quantity">Quantity</Label>
                      <Input 
                        id="quantity" 
                        type="number" 
                        min="1"
                        {...register("quantity")} 
                        placeholder="Enter quantity"
                      />
                      {errors.quantity && <p className="text-sm text-destructive">{errors.quantity.message}</p>}
                    </div>
                  )}
                <div className="space-y-2">
                  <Label htmlFor="supplier_code">Supplier Code</Label>
                  <Input id="supplier_code" {...register("supplier_code")} placeholder="e.g., SUP-001" />
                  {errors.supplier_code && <p className="text-sm text-destructive">{errors.supplier_code.message}</p>}
                </div>
              </div>

              <Button type="submit" className="w-full mt-4" disabled={isLoading}>
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
