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
import { Printer, Plus, RotateCcw, Image as ImageIcon, UploadCloud, X } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { BluetoothSerial } from "@awesome-cordova-plugins/bluetooth-serial";
import { Toast } from '@capacitor/toast';

const formSchema = z.object({
  item_name: z.string().min(1, "Item name is required"),
  make: z.string().min(1, "Make is required"),
  brand_name: z.string().min(1, "Brand name is required"),
  size: z.string().default('M'),
  purchase_price: z.coerce.number().min(0, "Must be positive"),
  selling_price: z.coerce.number().min(0, "Must be positive"),
  is_pack: z.boolean().default(false),
  price_per_piece: z.coerce.number().min(0).optional(), 
  supplier_code: z.string().min(1, "Supplier code is required"),
  pieces_per_box: z.coerce.number().int().min(1, "Must be at least 1").default(1).optional(),
  number_of_boxes: z.coerce.number().int().min(0, "Cannot be negative").default(0).optional(),
  quantity: z.coerce.number().int().min(0, "Cannot be negative").default(0),
}).refine(data => {
  if (data.purchase_price <= 0 || data.selling_price <= 0) return false;
  return true;
}, {
  message: "Prices must be greater than 0",
  path: ["selling_price"],
}).refine(data => {
  if (data.is_pack) return (data.number_of_boxes || 0) > 0 || data.quantity > 0;
  return data.quantity > 0;
}, {
  message: "Quantity must be greater than 0",
  path: ["quantity"],
}).refine(data => {
  if (data.is_pack && (data.pieces_per_box || 0) > 1) return (data.price_per_piece || 0) > 0;
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

// --- NEW: Client-side Image Compression ---
const compressImage = (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 800;
        const scaleSize = MAX_WIDTH / img.width;
        
        // Only scale down if image is larger than MAX_WIDTH
        if (scaleSize < 1) {
          canvas.width = MAX_WIDTH;
          canvas.height = img.height * scaleSize;
        } else {
          canvas.width = img.width;
          canvas.height = img.height;
        }

        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Output as JPEG at 70% quality
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Canvas to Blob failed"));
        }, "image/jpeg", 0.7);
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

export default function AddInventory() {
  const [savedItem, setSavedItem] = useState<Item | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<FormData>>({});
  
  // --- NEW: Image State ---
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
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

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClearForm = () => {
    setFormData({});
    setSavedItem(null);
    removeImage();
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

      // --- NEW: Handle Image Upload ---
      let uploadedImageUrl = null;
      if (imageFile) {
        toast({ title: "Compressing image..." });
        const compressedBlob = await compressImage(imageFile);
        const fileName = `${itemCode}-${Date.now()}.jpg`;
        
        toast({ title: "Uploading image..." });
        const { error: uploadError } = await supabase.storage
          .from("item-images")
          .upload(fileName, compressedBlob, {
            contentType: "image/jpeg",
          });

        if (uploadError) throw new Error("Image upload failed: " + uploadError.message);

        const { data: publicUrlData } = supabase.storage
          .from("item-images")
          .getPublicUrl(fileName);
          
        uploadedImageUrl = publicUrlData.publicUrl;
      }
      
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
          image_url: uploadedImageUrl, // Append URL here
        })
        .select()
        .single();

      if (error) throw error;

      setSavedItem(item);
      toast({
        title: "Item Added",
        description: `Code: ${itemCode}`,
      });
      
      // Keep form data but clear image for next item
      removeImage();
      
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

  const printLabelBluetooth = async (item: any) => {
    const printerMac = localStorage.getItem("printer_mac");
    if (!printerMac) {
      toast({ variant: "destructive", title: "No Printer", description: "Set Default Printer in Settings." });
      return false;
    }

    try {
      const isConnected = await BluetoothSerial.isConnected().catch(() => false);
      if (!isConnected) {
        await new Promise((resolve, reject) => {
          BluetoothSerial.connect(printerMac).subscribe(resolve, reject);
        });
      }

      let labelCmd = "";
      labelCmd += "\x1B\x40";       
      labelCmd += "\x1B\x61\x01";   
      
      labelCmd += "\x1B\x45\x01";   
      labelCmd += `${(item.item_name || "Item").substring(0, 25)}\n`;
      labelCmd += "\x1B\x45\x00";   
      labelCmd += `${item.make || ''} - ${item.brand_name || ''}\n`;
      labelCmd += `Size: ${item.size || 'STD'}\n`;

      if (item.item_code) {
         labelCmd += `\x1D\x68\x32`; 
         labelCmd += `\x1D\x77\x02`; 
         labelCmd += `\x1D\x6B\x49${String.fromCharCode(item.item_code.length)}${item.item_code}`;
         labelCmd += `\n${item.item_code}\n`;
      }

      labelCmd += "\x1B\x45\x01";
      labelCmd += `Rs. ${item.selling_price}/-\n`;
      labelCmd += "\x1B\x45\x00";
      labelCmd += "\n\n\n"; 

      const qty = item.quantity || 1;
      toast({ title: "Printing...", description: `${qty} Labels` });
      
      for (let i = 0; i < qty; i++) {
        await BluetoothSerial.write(labelCmd);
        if (i > 0 && i % 5 === 0) await new Promise(r => setTimeout(r, 500));
      }

      return true;

    } catch (error) {
      console.error("Print Error", error);
      toast({ variant: "destructive", title: "Print Failed", description: "Check connection" });
      return false;
    }
  };

  const handlePrint = async () => {
    if (!savedItem) return;

    if (Capacitor.isNativePlatform()) {
      await printLabelBluetooth(savedItem);
      return;
    }

    if ((window as any).electronAPI) {
      const printerName = localStorage.getItem("windows_printer_name");
      if (!printerName) {
        toast({ variant: "destructive", title: "No Printer", description: "Select printer in Settings first." });
        return;
      }

      const labelContent = document.getElementById("printable-labels");
      if (!labelContent) return;

      const fullHtml = `
        <html>
          <head>
            <style>
              body { margin: 0; padding: 0; background-color: white; }
              @page { size: auto; margin: 2mm; }
              .label-grid {
                 display: grid;
                 grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); 
                 gap: 2mm;
              }
              .label-card {
                 border: 1px solid black;
                 text-align: center;
                 padding: 4px;
                 page-break-inside: avoid; 
              }
            </style>
          </head>
          <body>
            ${labelContent.innerHTML}
          </body>
        </html>
      `;

      toast({ title: "Printing Labels..." });
      try {
        await (window as any).electronAPI.printComponent(fullHtml, printerName);
        toast({ title: "Sent to Printer" });
      } catch(e) {
        toast({ variant: "destructive", title: "Print Failed" });
      }
      return;
    }

    window.print();
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Add New Stock</h1>
          <p className="text-muted-foreground">Register new items, upload photos & print barcode labels</p>
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
                </div>
                <Button type="button" variant="outline" size="sm" onClick={handleClearForm}>
                   <RotateCcw className="h-4 w-4 mr-1"/> Reset
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                
                {/* --- NEW: Image Upload Field --- */}
                <div className="space-y-2 border-2 border-dashed rounded-lg p-4 text-center hover:bg-muted/50 transition-colors">
                  <Label htmlFor="image" className="cursor-pointer block">
                    {imagePreview ? (
                      <div className="relative inline-block">
                        <img 
                          src={imagePreview} 
                          alt="Preview" 
                          className="h-32 w-32 object-cover rounded-md shadow-sm border"
                        />
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); removeImage(); }}
                          className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 shadow-md hover:bg-destructive/90"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <UploadCloud className="h-8 w-8 mb-1" />
                        <span className="text-sm font-medium text-foreground">Click to upload image</span>
                        <span className="text-xs">JPEG, PNG, WEBP (Auto-compressed)</span>
                      </div>
                    )}
                  </Label>
                  <Input 
                    ref={fileInputRef}
                    id="image" 
                    type="file" 
                    accept="image/*" 
                    onChange={handleImageChange}
                    className="hidden" 
                  />
                </div>

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
                           setValue('price_per_piece', 0); 
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

          {savedItem && (
            <Card className="animate-fade-in border-green-200 bg-green-50/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Printer className="h-5 w-5" /> Barcode Generated
                </CardTitle>
                <CardDescription>Code: {savedItem.item_code}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                
                {/* NEW: Optional thumbnail preview on the success card */}
                {savedItem.image_url && (
                  <div className="flex justify-center mb-4">
                    <img 
                      src={savedItem.image_url} 
                      alt="Uploaded item" 
                      className="h-20 w-20 object-cover rounded-md border shadow-sm"
                    />
                  </div>
                )}

                <div className="flex justify-center">
                    <div className="border border-gray-300 bg-white p-2 w-[220px] shadow-sm flex flex-col items-center text-center">
                      <div className="font-bold text-sm">SAKHI COLLECTIONS</div>
                      <div className="text-[10px] font-bold text-gray-800 uppercase mt-1">
                        {savedItem.item_name}
                      </div>
                      <div className="text-[10px] text-gray-600">
                         {savedItem.make} - {savedItem.brand_name} ({savedItem.size})
                      </div>
                      
                      <div className="my-1 font-bold text-xl">₹{savedItem.selling_price}</div>
                      
                      <Barcode 
                        value={savedItem.item_code} 
                        height={30} 
                        width={1.5} 
                        fontSize={12} 
                        displayValue={true}
                        margin={0}
                      />
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

      {savedItem && (
        <div id="printable-labels" className="hidden print:block">
          <style type="text/css" media="print">
            {`
              body * { visibility: hidden; }
              #printable-labels, #printable-labels * { visibility: visible; }
              #printable-labels { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; }
              @page { size: auto; margin: 5mm; }
              
              .label-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 4mm;
              }
            `}
          </style>
          
          <div className="label-grid">
            {Array.from({ length: savedItem.pieces_per_box > 1 ? Math.ceil(savedItem.quantity / savedItem.pieces_per_box) : savedItem.quantity }).map((_, i) => (
              <div key={i} className="label-card border border-black bg-white p-2 flex flex-col items-center text-center h-[160px] justify-between break-inside-avoid">
                <div className="w-full">
                  <div className="font-bold text-sm text-black">SAKHI COLLECTIONS</div>
                  <div className="font-bold text-xs mt-1 truncate">{savedItem.item_name}</div>
                  <div className="text-[10px] text-gray-800">
                    {savedItem.make} {savedItem.brand_name ? `- ${savedItem.brand_name}` : ''}
                  </div>
                </div>
                <div className="font-extrabold text-xl text-black">₹{savedItem.selling_price}</div>
                <div className="w-full flex justify-center overflow-hidden">
                  <Barcode value={savedItem.item_code} height={35} width={1.4} fontSize={11} displayValue={true} margin={2} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppLayout>
  );
}