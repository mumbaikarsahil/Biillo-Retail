import React, { useState, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Barcode from "react-barcode";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase, Item } from "@/lib/supabase";
import { Printer, Plus, RotateCcw } from "lucide-react";

// --- UPDATED SCHEMA & VALIDATION ---
const formSchema = z.object({
  item_name: z.string().min(1, "Item name is required"),
  make: z.string().min(1, "Make is required"),
  brand_name: z.string().min(1, "Brand name is required"),
  size: z.string().default('M'),
  purchase_price: z.coerce.number().min(0, "Must be positive"), // Changed to min(0) to allow initial 0 state
  selling_price: z.coerce.number().min(0, "Must be positive"),  // Changed to min(0)
  is_pack: z.boolean().default(false),
  
  // FIX: Allow 0 here so hidden fields don't block submission. We check >0 in refine below.
  price_per_piece: z.coerce.number().min(0).optional(), 
  
  supplier_code: z.string().min(1, "Supplier code is required"),
  pieces_per_box: z.coerce.number().int().min(1, "Must be at least 1").default(1).optional(),
  number_of_boxes: z.coerce.number().int().min(0, "Cannot be negative").default(0).optional(),
  quantity: z.coerce.number().int().min(0, "Cannot be negative").default(0),
}).refine(data => {
  // Validate Prices are actually positive when submitting
  if (data.purchase_price <= 0 || data.selling_price <= 0) {
      return false;
  }
  return true;
}, {
  message: "Prices must be greater than 0",
  path: ["selling_price"], // Point error to selling price
}).refine(data => {
  if (data.is_pack) {
    return (data.number_of_boxes || 0) > 0 || data.quantity > 0;
  }
  return data.quantity > 0;
}, {
  message: "Quantity must be greater than 0",
  path: ["quantity"],
}).refine(data => {
  // FIX: Explicitly check for > 0 here only if pack mode is enabled
  if (data.is_pack && (data.pieces_per_box || 0) > 1) {
    return (data.price_per_piece || 0) > 0;
  }
  return true;
}, {
  message: "Price per piece is required and must be > 0",
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
  
  const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', 'Free Size'];

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      is_pack: false,
      pieces_per_box: 1,
      number_of_boxes: 0,
      quantity: 1,
      size: 'M',
      purchase_price: 0,
      selling_price: 0,
      price_per_piece: 0,
      ...formData, 
    },
  });
  
  const isPack = useWatch({ control, name: 'is_pack' });
  const piecesPerBox = useWatch({ control, name: 'pieces_per_box' }) || 1;
  const numberOfBoxes = useWatch({ control, name: 'number_of_boxes' }) || 0;
  
  React.useEffect(() => {
    if (isPack) {
      const totalQuantity = numberOfBoxes * piecesPerBox;
      setValue('quantity', totalQuantity, { shouldValidate: true });
    }
  }, [isPack, numberOfBoxes, piecesPerBox, setValue]);

  const handleClearForm = () => {
    setFormData({});
    setSavedItem(null);
    // This reset logic is now safe because Schema allows 0 values
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

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    try {
      const itemCode = generateItemCode();
      const isPack = data.is_pack || false;
      const piecesPerBox = isPack ? (data.pieces_per_box || 1) : 1;
      const numBoxes = isPack ? (data.number_of_boxes || 0) : 0;
      
      const { quantity, pieces_per_box, number_of_boxes, is_pack, ...persistentData } = data;
      setFormData(persistentData);
      
      const totalQuantity = isPack 
        ? numBoxes * piecesPerBox + (data.quantity || 0)
        : data.quantity || 0;
      
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
        title: "Item Added",
        description: `Code: ${itemCode}`,
      });
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

  const handlePrint = () => {
    window.print();
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Add New Stock</h1>
          <p className="text-muted-foreground">Register new items & print barcode labels</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* --- LEFT SIDE: FORM --- */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Plus className="h-5 w-5" />
                    Item Details
                  </CardTitle>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={handleClearForm}>
                   <RotateCcw className="h-4 w-4 mr-1"/> Reset
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="item_name">Item Name</Label>
                  <Input id="item_name" {...register("item_name")} placeholder="e.g., Saree" />
                  {errors.item_name && <p className="text-sm text-destructive">{errors.item_name.message}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="make">Make</Label>
                    <Input id="make" {...register("make")} />
                    {errors.make && <p className="text-sm text-destructive">{errors.make.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="brand_name">Brand Name</Label>
                    <Input id="brand_name" {...register("brand_name")} />
                    {errors.brand_name && <p className="text-sm text-destructive">{errors.brand_name.message}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="size">Size</Label>
                    <select id="size" {...register("size")} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      {sizes.map(size => <option key={size} value={size}>{size}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="purchase_price">Purchase Price</Label>
                    <Input id="purchase_price" type="number" step="0.01" {...register("purchase_price")} />
                    {errors.purchase_price && <p className="text-sm text-destructive">{errors.purchase_price.message}</p>}
                  </div>
                </div>

                <div className="space-y-2">
                   <Label htmlFor="selling_price">Selling Price (₹)</Label>
                   <Input id="selling_price" type="number" step="0.01" {...register("selling_price")} />
                   {errors.selling_price && <p className="text-sm text-destructive">{errors.selling_price.message}</p>}
                </div>

                {/* Pack Logic Section */}
                <div className="space-y-4 border rounded-lg p-4 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="is_pack">Pack Item?</Label>
                    <Switch 
                      id="is_pack" 
                      checked={isPack} 
                      onCheckedChange={(checked) => {
                        setValue('is_pack', checked);
                        if (!checked) {
                           setValue('pieces_per_box', 1);
                           setValue('number_of_boxes', 0);
                           setValue('quantity', 1);
                           setValue('price_per_piece', 0); // Safe to set to 0 now
                        } else {
                           setValue('number_of_boxes', 1);
                        }
                      }} 
                    />
                  </div>

                  {isPack ? (
                    <div className="space-y-3">
                       <div className="space-y-2">
                        <Label>Price Per Piece</Label>
                        <Input type="number" step="0.01" {...register("price_per_piece")} />
                        {errors.price_per_piece && <p className="text-sm text-destructive">{errors.price_per_piece.message}</p>}
                       </div>
                       <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-2">
                            <Label>Pcs per Pack</Label>
                            <Input type="number" {...register("pieces_per_box")} />
                         </div>
                         <div className="space-y-2">
                            <Label>No. of Packs</Label>
                            <Input type="number" {...register("number_of_boxes")} />
                         </div>
                       </div>
                       <div className="text-sm text-muted-foreground pt-1">
                          Total Qty: {numberOfBoxes * piecesPerBox} pieces
                       </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="quantity">Quantity</Label>
                      <Input id="quantity" type="number" min="1" {...register("quantity")} />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="supplier_code">Supplier Code</Label>
                    <Input id="supplier_code" {...register("supplier_code")} />
                    {errors.supplier_code && <p className="text-sm text-destructive">{errors.supplier_code.message}</p>}
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Saving..." : "Save Item"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* --- RIGHT SIDE: PREVIEW SECTION --- */}
          {savedItem && (
            <Card className="animate-fade-in border-green-200 bg-green-50/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Printer className="h-5 w-5" /> Barcode Generated
                </CardTitle>
                <CardDescription>Code: {savedItem.item_code}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                
                {/* Single Label Preview */}
                <div className="flex justify-center">
                   <div className="border border-gray-300 bg-white p-2 w-[220px] shadow-sm flex flex-col items-center text-center">
                      <div className="font-bold text-sm">प्रगती'ज सखी कलेक्शन</div>
                      <div className="text-[10px] text-gray-600">साई भवन, शहापूर</div>
                      
                      <div className="my-1 font-bold text-xl">₹{savedItem.selling_price}</div>
                      
                      <Barcode 
                        value={savedItem.item_code} 
                        height={30} 
                        width={1.5} 
                        fontSize={12} 
                        displayValue={true}
                        margin={0}
                      />
                      
                      <div className="mt-1 text-[8px] leading-tight text-gray-500 w-full px-1">
                        सूचना:- सिल्क, जरी & फॅन्सी साड्या ड्रायकलिन कराव्यात. त्यांची कुठलीही गॅरंटी नाही.
                      </div>
                   </div>
                </div>

                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-2">
                    This will generate <strong>{savedItem.quantity}</strong> labels.
                  </p>
                  <Button onClick={handlePrint} className="w-full" size="lg">
                    <Printer className="mr-2 h-4 w-4" />
                    Print Labels
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* --- HIDDEN PRINT AREA --- */}
      {savedItem && (
        <div id="printable-labels" className="hidden print:block">
          <style type="text/css" media="print">
            {`
              body * { visibility: hidden; }
              #printable-labels, #printable-labels * { visibility: visible; }
              #printable-labels { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; background-color: white; }
              @page { size: auto; margin: 5mm; }
            `}
          </style>
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: savedItem.pieces_per_box > 1 ? Math.ceil(savedItem.quantity / savedItem.pieces_per_box) : savedItem.quantity }).map((_, i) => (
              <div key={i} className="border border-gray-400 bg-white p-1 flex flex-col items-center text-center h-[160px] justify-between break-inside-avoid">
                <div className="w-full">
                  <div className="font-bold text-sm text-black">प्रगती'ज सखी कलेक्शन</div>
                  <div className="text-[10px] text-gray-800">साई भवन, शहापूर</div>
                </div>
                <div className="font-extrabold text-xl text-black">₹{savedItem.selling_price}</div>
                <div className="w-full flex justify-center overflow-hidden">
                  <Barcode value={savedItem.item_code} height={35} width={1.4} fontSize={11} displayValue={true} margin={2} />
                </div>
                <div className="text-[7px] leading-tight text-black w-full px-1 mt-1">
                   सूचना:- सिल्क, जरी & फॅन्सी साड्या ड्रायकलिन कराव्यात. गॅरंटी नाही.
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppLayout>
  );
}