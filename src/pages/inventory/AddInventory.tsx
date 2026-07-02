import React, { useState, useRef, useEffect } from "react";
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
import { Printer, Plus, RotateCcw, UploadCloud, X, Layers } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { BluetoothSerial } from "@awesome-cordova-plugins/bluetooth-serial";



// Updated Schema with Category and Dynamic Size Fields
const formSchema = z.object({
  item_name: z.string().min(1, "Item name is required"),
  make: z.string().min(1, "Make is required"),
  brand_name: z.string().min(1, "Brand name is required"),
  category: z.string().optional(),
  size: z.string().optional(),
  dimension_value: z.string().optional(),
  custom_unit: z.string().optional(),
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
        
        if (scaleSize < 1) {
          canvas.width = MAX_WIDTH;
          canvas.height = img.height * scaleSize;
        } else {
          canvas.width = img.width;
          canvas.height = img.height;
        }

        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        
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
  const [tenantName, setTenantName] = useState<string>("Biillo Systems");
  const [savedItem, setSavedItem] = useState<Item | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<FormData>>({});
  
  // Image State
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Category & Size States
  const [categories, setCategories] = useState<{name: string}[]>([]);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [sizeMode, setSizeMode] = useState<'Standard' | 'Inches' | 'CMs' | 'Feet' | 'Custom'>('Standard');
  
  const { toast } = useToast();
  const standardSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', 'Free Size'];

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
  
  // Fetch Unique Categories from existing items on Mount
  useEffect(() => {
    const fetchData = async () => {
      // 1. Fetch Categories
      const { data: catData } = await supabase.from('items').select('category').not('category', 'is', null);
      if (catData) {
          const uniqueCategories = Array.from(new Set(catData.map(item => item.category)));
          setCategories(uniqueCategories.map(cat => ({ name: cat })));
      }
  
      // 2. Fetch Tenant Name
      // We use the tenant_id that should be available via your auth session or profile
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
          const { data: tenantData } = await supabase
              .from('tenants')
              .select('tenant_name')
              .eq('id', user.app_metadata.tenant_id) // Adjust this path based on your auth structure
              .single();
              
          if (tenantData) setTenantName(tenantData.tenant_name);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
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
    setSizeMode('Standard');
    reset({
      item_name: '',
      make: '',
      brand_name: '',
      category: '',
      size: 'M',
      dimension_value: '',
      custom_unit: '',
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
      
      // Process Size Based on Mode
      let finalSize = data.size || 'STD';
      if (sizeMode === 'Inches') finalSize = `${data.dimension_value} inches`;
      else if (sizeMode === 'CMs') finalSize = `${data.dimension_value} cms`;
      else if (sizeMode === 'Feet') finalSize = `${data.dimension_value} ft`;
      else if (sizeMode === 'Custom') finalSize = `${data.dimension_value} ${data.custom_unit}`;

      // Extract transient data so we don't save it to local state for the next form reset
      const { quantity, pieces_per_box, number_of_boxes, is_pack, dimension_value, custom_unit, ...persistentData } = data;
      setFormData(persistentData);
      
      const totalQuantity = isPack 
        ? numBoxes * piecesPerBox + (data.quantity || 0)
        : data.quantity || 0;
      
      const price_per_piece = isPack && piecesPerBox > 1 
        ? data.price_per_piece 
        : data.selling_price;

      // Handle Image Upload
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
      
      // Insert into Database (Assumes you added a 'category' column to your items table)
      const { data: item, error } = await supabase
        .from("items")
        .insert({
          item_code: itemCode,
          item_name: data.item_name,
          make: data.make,
          brand_name: data.brand_name,
          category: data.category || null,
          size: finalSize,
          purchase_price: data.purchase_price,
          selling_price: data.selling_price,
          price_per_piece: price_per_piece,
          supplier_code: data.supplier_code,
          quantity: totalQuantity,
          pieces_per_box: isPack ? piecesPerBox : 1,
          image_url: uploadedImageUrl,
        })
        .select()
        .single();

      if (error) throw error;

      setSavedItem(item);
      toast({
        title: "Item Added",
        description: `Code: ${itemCode} | Size: ${finalSize}`,
      });
      
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
      {/* max-w-7xl makes it span wider on desktop screens */}
      <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8 animate-fade-in print:hidden pb-12">
        
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Add New Stock</h1>
          <p className="text-muted-foreground mt-1">Register new items, upload photos & print barcode labels</p>
        </div>

        {/* 12-column grid to allow the form to stretch across 8 columns and the barcode on 4 */}
        <div className="grid gap-6 lg:grid-cols-12 items-start">
          
          <Card className="lg:col-span-8 shadow-sm">
            <CardHeader className="border-b bg-muted/10 pb-4">
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Layers className="h-5 w-5 text-primary" />
                  Inventory Details
                </CardTitle>
                <Button type="button" variant="outline" size="sm" onClick={handleClearForm}>
                   <RotateCcw className="h-4 w-4 mr-1"/> Reset
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                
                {/* Image Upload Area */}
                <div className="space-y-2 border-2 border-dashed rounded-xl p-6 text-center hover:bg-muted/30 transition-colors bg-muted/10">
                  <Label htmlFor="image" className="cursor-pointer block">
                    {imagePreview ? (
                      <div className="relative inline-block group">
                        <img 
                          src={imagePreview} 
                          alt="Preview" 
                          className="h-40 w-40 object-cover rounded-xl shadow-sm border-2 border-primary/20"
                        />
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); removeImage(); }}
                          className="absolute -top-3 -right-3 bg-destructive text-destructive-foreground rounded-full p-1.5 shadow-lg hover:bg-destructive/90 transition-transform hover:scale-110"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground py-4">
                        <div className="p-3 bg-background rounded-full shadow-sm mb-2">
                          <UploadCloud className="h-6 w-6 text-primary" />
                        </div>
                        <span className="text-sm font-semibold text-foreground">Tap to upload product image</span>
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

                {/* Main Item Details (Wider Grid) */}
                <div className="space-y-2">
                  <Label htmlFor="item_name">Item Name</Label>
                  <Input id="item_name" className="h-12 md:h-10 text-base md:text-sm" {...register("item_name")} placeholder="e.g., Handcrafted Ganpati Idol" />
                  {errors.item_name && <p className="text-sm text-destructive">{errors.item_name.message}</p>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="make">Make</Label>
                    <Input id="make" className="h-12 md:h-10" {...register("make")} placeholder="e.g., Shadu Mati" />
                    {errors.make && <p className="text-sm text-destructive">{errors.make.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="brand_name">Brand Name</Label>
                    <Input id="brand_name" className="h-12 md:h-10" {...register("brand_name")} placeholder="e.g., Bappa Murti Art" />
                    {errors.brand_name && <p className="text-sm text-destructive">{errors.brand_name.message}</p>}
                  </div>
                  {/* Category Field with "Add New" Toggle */}
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <div className="flex items-center gap-2">
                      {isAddingCategory ? (
                        <>
                          <Input 
                            id="category" 
                            className="h-12 md:h-10 flex-1 border-primary/50 focus-visible:ring-primary" 
                            {...register("category")} 
                            placeholder="Type new category name..." 
                            autoFocus
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-12 w-12 md:h-10 md:w-10 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            onClick={() => {
                              setIsAddingCategory(false);
                              setValue('category', ''); // Clear the typed text if they cancel
                            }}
                            title="Cancel adding new category"
                          >
                            <X className="h-5 w-5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <select 
                            id="category" 
                            {...register("category")} 
                            className="flex h-12 md:h-10 w-full flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            <option value="">Select Category...</option>
                            {categories.map((cat, index) => (
                              <option key={index} value={cat.name}>{cat.name}</option>
                            ))}
                          </select>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-12 w-12 md:h-10 md:w-10 shrink-0 text-primary border-primary/20 hover:bg-primary/10 transition-colors"
                            onClick={() => {
                              setIsAddingCategory(true);
                              setValue('category', ''); // Clear the select value so they can type fresh
                            }}
                            title="Add a brand new category"
                          >
                            <Plus className="h-5 w-5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  </div>

                {/* Dynamic Size Engine */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-muted/20 p-4 rounded-xl border">
                  <div className="space-y-2">
                    <Label htmlFor="sizeMode">Unit Format</Label>
                    <select 
                      id="sizeMode" 
                      value={sizeMode}
                      onChange={(e) => setSizeMode(e.target.value as any)}
                      className="flex h-12 md:h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    >
                      <option value="Standard">Apparel (S, M, L)</option>
                      <option value="Inches">Inches (in)</option>
                      <option value="CMs">Centimeters (cm)</option>
                      <option value="Feet">Feet (ft)</option>
                      <option value="Custom">Custom Unit</option>
                    </select>
                  </div>

                  {sizeMode === 'Standard' ? (
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="size">Select Size</Label>
                      <select id="size" {...register("size")} className="flex h-12 md:h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                        {standardSizes.map(size => <option key={size} value={size}>{size}</option>)}
                      </select>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="dimension_value">Size Value</Label>
                        <Input id="dimension_value" className="h-12 md:h-10" {...register("dimension_value")} placeholder="e.g. 15, 2.5" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="custom_unit">Unit Measure</Label>
                        {sizeMode === 'Custom' ? (
                          <Input id="custom_unit" className="h-12 md:h-10" {...register("custom_unit")} placeholder="e.g. Grams, Liters" />
                        ) : (
                          <Input className="h-12 md:h-10 bg-muted text-muted-foreground" disabled value={sizeMode} />
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Pricing & Supply */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="purchase_price">Purchase Price (₹)</Label>
                    <Input id="purchase_price" className="h-12 md:h-10" type="number" step="0.01" {...register("purchase_price")} />
                    {errors.purchase_price && <p className="text-sm text-destructive">{errors.purchase_price.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="selling_price" className="font-bold text-primary">Selling Price (₹)</Label>
                    <Input id="selling_price" className="h-12 md:h-10 border-primary/50 focus-visible:ring-primary" type="number" step="0.01" {...register("selling_price")} />
                    {errors.selling_price && <p className="text-sm text-destructive">{errors.selling_price.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="supplier_code">Supplier Code</Label>
                    <Input id="supplier_code" className="h-12 md:h-10" {...register("supplier_code")} />
                    {errors.supplier_code && <p className="text-sm text-destructive">{errors.supplier_code.message}</p>}
                  </div>
                </div>

                {/* Packaging Logic */}
                <div className="space-y-4 border rounded-xl p-5 bg-card shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="is_pack" className="text-base font-semibold">Is this a Box/Pack item?</Label>
                      <p className="text-sm text-muted-foreground">Enable if selling in bulk packets</p>
                    </div>
                    <Switch 
                      id="is_pack" 
                      className="data-[state=checked]:bg-primary"
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
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
                       <div className="space-y-2">
                         <Label>Price Per Piece (₹)</Label>
                         <Input className="h-12 md:h-10" type="number" step="0.01" {...register("price_per_piece")} />
                         {errors.price_per_piece && <p className="text-sm text-destructive">{errors.price_per_piece.message}</p>}
                       </div>
                       <div className="space-y-2">
                          <Label>Pieces per Pack</Label>
                          <Input className="h-12 md:h-10" type="number" {...register("pieces_per_box")} />
                       </div>
                       <div className="space-y-2">
                          <Label>Total Packs Adding</Label>
                          <Input className="h-12 md:h-10" type="number" {...register("number_of_boxes")} />
                       </div>
                       <div className="md:col-span-3 text-sm font-semibold text-primary bg-primary/10 p-3 rounded-lg">
                          Total Inventory Added: {numberOfBoxes * piecesPerBox} individual pieces
                       </div>
                    </div>
                  ) : (
                    <div className="space-y-2 pt-4 border-t max-w-xs">
                      <Label htmlFor="quantity">Quantity Adding to Stock</Label>
                      <Input id="quantity" className="h-12 md:h-10" type="number" min="1" {...register("quantity")} />
                    </div>
                  )}
                </div>

                <Button type="submit" className="w-full h-12 md:h-12 text-base font-bold shadow-md" disabled={isLoading}>
                  {isLoading ? "Saving Inventory..." : "Save Item & Generate Barcode"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Barcode Success Card */}
          <div className="lg:col-span-4 sticky top-6">
            {savedItem ? (
              <Card className="animate-fade-in border-green-200 bg-green-50 shadow-md">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-green-700 text-lg">
                    <Printer className="h-5 w-5" /> Barcode Generated
                  </CardTitle>
                  <CardDescription className="font-mono text-green-800">Code: {savedItem.item_code}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  
                  {savedItem.image_url && (
                    <div className="flex justify-center mb-4">
                      <img 
                        src={savedItem.image_url} 
                        alt="Uploaded item" 
                        className="h-28 w-28 object-cover rounded-xl border-4 border-white shadow-md"
                      />
                    </div>
                  )}

                  <div className="flex justify-center">
                      <div className="border border-gray-300 bg-white p-3 w-[240px] shadow-sm flex flex-col items-center text-center rounded-lg">
                      <div className="font-medium text-xs tracking-wider">{tenantName}</div>
                        <div className="text-xs font-bold text-gray-800 uppercase mt-2 leading-tight line-clamp-2">
                          {savedItem.item_name}
                        </div>
                        <div className="text-[11px] text-gray-600 mt-1">
                           {savedItem.make} - {savedItem.brand_name} <br/> ({savedItem.size})
                        </div>
                        
                        <div className="my-2 font-black text-2xl text-black">₹{savedItem.selling_price}</div>
                        
                        <Barcode 
                          value={savedItem.item_code} 
                          height={35} 
                          width={1.6} 
                          fontSize={12} 
                          displayValue={true}
                          margin={0}
                        />
                      </div>
                  </div>

                  <div className="text-center pt-2">
                    <p className="text-sm text-green-800 mb-3 font-medium">
                      This will print <strong>{savedItem.quantity}</strong> adhesive labels.
                    </p>
                    <Button onClick={handlePrint} className="w-full h-12 bg-green-600 hover:bg-green-700 text-white shadow-md" size="lg">
                      <Printer className="mr-2 h-5 w-5" />
                      Print Labels Now
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="hidden lg:flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl h-[300px] text-muted-foreground bg-muted/10">
                <Printer className="h-10 w-10 mb-3 text-muted-foreground/50" />
                <p className="text-center font-medium">Save an item to generate<br/>and preview its barcode label.</p>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Hidden Print Wrapper */}
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
                <div className="font-medium text-xs text-black">{tenantName}</div>
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