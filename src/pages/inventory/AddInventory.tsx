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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase, Item } from "@/lib/supabase";
import { Printer, Plus, RotateCcw, UploadCloud, X, Layers, CheckCircle2, ChevronRight, ChevronLeft } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { BluetoothSerial } from "@awesome-cordova-plugins/bluetooth-serial";

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
  const [tenantName, setTenantName] = useState<string>("Biillo Retail");
  const [savedItem, setSavedItem] = useState<Item | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<FormData>>({});
  
  // --- RESPONSIVE MOBILE WIZARD STATE ---
  const [isMobile, setIsMobile] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const TOTAL_STEPS = 5;

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
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
    trigger, 
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
  
  // Responsive check
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640); 
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // SECURE TENANT & CATEGORY FETCH
  useEffect(() => {
    const fetchData = async () => {
      const { data: catData } = await supabase.from('items').select('category').not('category', 'is', null);
      if (catData) {
          const uniqueCategories = Array.from(new Set(catData.map(item => item.category)));
          setCategories(uniqueCategories.map(cat => ({ name: cat })));
      }
  
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", session.user.id).single();
        if (profile?.tenant_id) {
          const { data: tenantData } = await supabase.from('tenants').select('tenant_name').eq('id', profile.tenant_id).single();
          if (tenantData) setTenantName(tenantData.tenant_name);
        }
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
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClearForm = () => {
    setFormData({});
    setSavedItem(null);
    removeImage();
    setSizeMode('Standard');
    setCurrentStep(1);
    reset({
      item_name: '', make: '', brand_name: '', category: '', size: 'M',
      dimension_value: '', custom_unit: '', purchase_price: 0, selling_price: 0,
      supplier_code: '', is_pack: false, pieces_per_box: 1, number_of_boxes: 0,
      quantity: 1, price_per_piece: 0, 
    });
  };

  // --- WIZARD NAVIGATION LOGIC ---
  const handleNextStep = async () => {
    let fieldsToValidate: (keyof FormData)[] = [];
    switch(currentStep) {
      case 1: fieldsToValidate = ['item_name']; break;
      case 2: fieldsToValidate = ['make', 'brand_name', 'category']; break;
      case 3: fieldsToValidate = ['size', 'dimension_value', 'custom_unit']; break;
      case 4: fieldsToValidate = ['purchase_price', 'selling_price', 'supplier_code']; break;
    }
    const isValid = await trigger(fieldsToValidate);
    if (isValid) {
      setCurrentStep(prev => Math.min(prev + 1, TOTAL_STEPS));
    }
  };

  const handlePrevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));
  const showStep = (stepNumber: number) => !isMobile || currentStep === stepNumber;

  // KEY FIX: Intercept Keyboard "Enter / Done" to prevent accidental skips
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Stop standard HTML form submission dead in its tracks
      if (isMobile && currentStep < TOTAL_STEPS) {
        handleNextStep();
      } else {
        handleSubmit(onSubmit)();
      }
    }
  };

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    try {
      const itemCode = generateItemCode();
      const isPack = data.is_pack || false;
      const piecesPerBox = isPack ? (data.pieces_per_box || 1) : 1;
      const numBoxes = isPack ? (data.number_of_boxes || 0) : 0;
      
      let finalSize = data.size || 'STD';
      if (sizeMode === 'Inches') finalSize = `${data.dimension_value} inches`;
      else if (sizeMode === 'CMs') finalSize = `${data.dimension_value} cms`;
      else if (sizeMode === 'Feet') finalSize = `${data.dimension_value} ft`;
      else if (sizeMode === 'Custom') finalSize = `${data.dimension_value} ${data.custom_unit}`;

      const { quantity, pieces_per_box, number_of_boxes, is_pack, dimension_value, custom_unit, ...persistentData } = data;
      setFormData(persistentData);
      
      const totalQuantity = isPack ? numBoxes * piecesPerBox + (data.quantity || 0) : data.quantity || 0;
      const price_per_piece = isPack && piecesPerBox > 1 ? data.price_per_piece : data.selling_price;

      let uploadedImageUrl = null;
      if (imageFile) {
        toast({ title: "Compressing image..." });
        const compressedBlob = await compressImage(imageFile);
        const fileName = `${itemCode}-${Date.now()}.jpg`;
        
        toast({ title: "Uploading image..." });
        const { error: uploadError } = await supabase.storage.from("item-images").upload(fileName, compressedBlob, { contentType: "image/jpeg" });
        if (uploadError) throw new Error("Image upload failed: " + uploadError.message);

        const { data: publicUrlData } = supabase.storage.from("item-images").getPublicUrl(fileName);
        uploadedImageUrl = publicUrlData.publicUrl;
      }
      
      const { data: item, error } = await supabase.from("items").insert({
        item_code: itemCode, item_name: data.item_name, make: data.make, brand_name: data.brand_name,
        category: data.category || null, size: finalSize, purchase_price: data.purchase_price,
        selling_price: data.selling_price, price_per_piece: price_per_piece, supplier_code: data.supplier_code,
        quantity: totalQuantity, pieces_per_box: isPack ? piecesPerBox : 1, image_url: uploadedImageUrl,
      }).select().single();

      if (error) throw error;

      setSavedItem(item);
      toast({ title: "Inventory Added Successfully", description: `Code: ${itemCode} | Added ${totalQuantity} units.` });
      
      removeImage();
      setCurrentStep(1); // Safely reset mobile wizard for next item
      
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to add item", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrint = async () => {
    if (!savedItem) return;

    if (Capacitor.isNativePlatform()) {
      const printerMac = localStorage.getItem("printer_mac");
      if (!printerMac) {
        toast({ variant: "destructive", title: "No Printer Found", description: "Please configure a printer in Settings." });
        return;
      }
      try {
        const isConnected = await BluetoothSerial.isConnected().catch(() => false);
        if (!isConnected) {
          await new Promise((resolve, reject) => BluetoothSerial.connect(printerMac).subscribe(resolve, reject));
        }
        let labelCmd = "\x1B\x40\x1B\x61\x01\x1B\x45\x01";       
        labelCmd += `${(savedItem.item_name || "Item").substring(0, 25)}\n\x1B\x45\x00`;
        labelCmd += `${savedItem.make || ''} - ${savedItem.brand_name || ''}\n`;
        labelCmd += `Size: ${savedItem.size || 'STD'}\n`;
        if (savedItem.item_code) {
           labelCmd += `\x1D\x68\x32\x1D\x77\x02\x1D\x6B\x49${String.fromCharCode(savedItem.item_code.length)}${savedItem.item_code}\n${savedItem.item_code}\n`;
        }
        labelCmd += `\x1B\x45\x01Rs. ${savedItem.selling_price}/-\n\x1B\x45\x00\n\n\n`; 

        const qty = savedItem.quantity || 1;
        toast({ title: "Printing...", description: `Sending ${qty} labels to printer` });
        
        for (let i = 0; i < qty; i++) {
          await BluetoothSerial.write(labelCmd);
          if (i > 0 && i % 5 === 0) await new Promise(r => setTimeout(r, 500));
        }
        return;
      } catch (error) {
        toast({ variant: "destructive", title: "Print Failed", description: "Could not connect to printer." });
        return;
      }
    }

    if ((window as any).electronAPI) {
      const printerName = localStorage.getItem("windows_printer_name");
      if (!printerName) {
        toast({ variant: "destructive", title: "No Printer", description: "Select printer in Settings." });
        return;
      }
      const labelContent = document.getElementById("printable-labels");
      if (!labelContent) return;
      const fullHtml = `<html><head><style>body { margin: 0; padding: 0; background-color: white; } @page { size: auto; margin: 2mm; } .label-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 2mm; } .label-card { border: 1px solid black; text-align: center; padding: 4px; page-break-inside: avoid; }</style></head><body>${labelContent.innerHTML}</body></html>`;
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
      <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8 animate-fade-in print:hidden pb-12 font-sans">
        
        {/* --- HEADER --- */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900">Add to Inventory</h1>
            <p className="text-muted-foreground mt-0.5 text-sm font-medium">Register items, configure pricing, and generate barcodes</p>
          </div>
          <Button variant="outline" onClick={handleClearForm} className="bg-white border-zinc-200/80 text-zinc-700 shadow-sm h-10 px-4 self-start sm:self-auto rounded-lg">
             <RotateCcw className="h-4 w-4 mr-2 text-zinc-500"/> Clear Form
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-12 items-start">
          
          <Card className="lg:col-span-8 shadow-[0_1px_3px_rgba(0,0,0,0.02)] border-zinc-200/80 rounded-2xl bg-white">
            <CardHeader className="border-b border-zinc-100 bg-zinc-50/40 pb-4 px-5 sm:px-6">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-zinc-900">
                  <Layers className="h-4 w-4 text-zinc-500" /> Product Details
                </CardTitle>
                
                {isMobile && (
                  <span className="text-xs font-semibold text-zinc-500 bg-zinc-200/50 px-2.5 py-1 rounded-full">
                    Step {currentStep} of {TOTAL_STEPS}
                  </span>
                )}
              </div>

              {isMobile && (
                <div className="h-1.5 w-full bg-zinc-200/60 rounded-full overflow-hidden mt-4">
                  <div className="h-full bg-zinc-900 transition-all duration-500 ease-out" style={{ width: `${(currentStep / TOTAL_STEPS) * 100}%` }} />
                </div>
              )}
            </CardHeader>

            <CardContent className="pt-6 px-5 sm:px-6">
              
              {/* KEY FIX: We completely disable standard form submission and use onKeyDown to capture the mobile 'Done' button */}
              <form onKeyDown={handleKeyDown} onSubmit={(e) => e.preventDefault()} className="space-y-6 sm:space-y-8">
                
                {/* === STEP 1: Basic Identifiers === */}
                <div className={showStep(1) ? "space-y-6 animate-in slide-in-from-right-4 sm:animate-none sm:slide-in-from-right-0" : "hidden"}>
                  <div className="space-y-2 border border-dashed border-zinc-300 rounded-xl p-6 text-center hover:bg-zinc-50/50 transition-colors bg-zinc-50/30">
                    <Label htmlFor="image" className="cursor-pointer block">
                      {imagePreview ? (
                        <div className="relative inline-block group">
                          <img src={imagePreview} alt="Preview" className="h-32 w-32 object-cover rounded-xl shadow-sm border border-zinc-200/80" />
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); removeImage(); }}
                            className="absolute -top-2.5 -right-2.5 bg-white text-zinc-500 border border-zinc-200 shadow-sm rounded-full p-1 hover:text-rose-600 transition-colors"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-zinc-500 py-3">
                          <div className="p-3 bg-white border border-zinc-200/80 rounded-xl shadow-sm mb-1">
                            <UploadCloud className="h-5 w-5 text-zinc-400" />
                          </div>
                          <span className="text-sm font-medium text-zinc-700">Upload product image</span>
                          <span className="text-xs text-zinc-400">JPEG, PNG, WEBP automatically optimized</span>
                        </div>
                      )}
                    </Label>
                    <Input ref={fileInputRef} id="image" type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="item_name" className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Item Name <span className="text-rose-500">*</span></Label>
                    <Input id="item_name" className="h-11 sm:h-10 text-base sm:text-sm border-zinc-200/80 focus-visible:ring-zinc-900 bg-white shadow-sm" {...register("item_name")} placeholder="e.g., Handcrafted Ganpati Idol" />
                    {errors.item_name && <p className="text-xs text-rose-500 font-medium">{errors.item_name.message}</p>}
                  </div>
                </div>

                {/* === STEP 2: Classification === */}
                <div className={showStep(2) ? "grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-4 animate-in slide-in-from-right-4 sm:animate-none sm:slide-in-from-right-0" : "hidden"}>
                  <div className="space-y-2">
                    <Label htmlFor="make" className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Make / Material <span className="text-rose-500">*</span></Label>
                    <Input id="make" className="h-11 sm:h-10 border-zinc-200/80 focus-visible:ring-zinc-900 shadow-sm" {...register("make")} placeholder="e.g., Shadu Mati" />
                    {errors.make && <p className="text-xs text-rose-500 font-medium">{errors.make.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="brand_name" className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Brand Name <span className="text-rose-500">*</span></Label>
                    <Input id="brand_name" className="h-11 sm:h-10 border-zinc-200/80 focus-visible:ring-zinc-900 shadow-sm" {...register("brand_name")} placeholder="e.g., Bappa Arts" />
                    {errors.brand_name && <p className="text-xs text-rose-500 font-medium">{errors.brand_name.message}</p>}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="category" className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Category</Label>
                    <div className="flex items-center gap-2">
                      {isAddingCategory ? (
                        <>
                          <Input 
                            id="category" className="h-11 sm:h-10 flex-1 border-zinc-200/80 focus-visible:ring-zinc-900 shadow-sm" 
                            {...register("category")} placeholder="New category..." autoFocus
                          />
                          <Button type="button" variant="outline" size="icon" className="h-11 w-11 sm:h-10 sm:w-10 shrink-0 border-zinc-200/80 text-zinc-500 hover:text-zinc-900 shadow-sm" onClick={() => { setIsAddingCategory(false); setValue('category', ''); }}>
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <select 
                            id="category" {...register("category")} 
                            className="flex h-11 sm:h-10 w-full flex-1 rounded-lg border border-zinc-200/80 bg-white shadow-sm px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
                          >
                            <option value="">Select Category...</option>
                            {categories.map((cat, index) => <option key={index} value={cat.name}>{cat.name}</option>)}
                          </select>
                          <Button type="button" variant="outline" size="icon" className="h-11 w-11 sm:h-10 sm:w-10 shrink-0 border-zinc-200/80 text-zinc-700 shadow-sm hover:bg-zinc-50" onClick={() => { setIsAddingCategory(true); setValue('category', ''); }}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* === STEP 3: Size & Dimensions === */}
                <div className={showStep(3) ? "grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-4 bg-zinc-50/50 sm:p-4 rounded-xl sm:border border-zinc-200/60 animate-in slide-in-from-right-4 sm:animate-none sm:slide-in-from-right-0" : "hidden"}>
                  <div className="space-y-2">
                    <Label htmlFor="sizeMode" className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Measurement Unit</Label>
                    <select 
                      id="sizeMode" value={sizeMode} onChange={(e) => setSizeMode(e.target.value as any)}
                      className="flex h-11 sm:h-10 w-full rounded-lg border border-zinc-200/80 bg-white shadow-sm px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
                    >
                      <option value="Standard">Apparel (S, M, L)</option>
                      <option value="Inches">Inches (in)</option>
                      <option value="CMs">Centimeters (cm)</option>
                      <option value="Feet">Feet (ft)</option>
                      <option value="Custom">Custom Unit</option>
                    </select>
                  </div>

                  {sizeMode === 'Standard' ? (
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="size" className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Select Size</Label>
                      <select id="size" {...register("size")} className="flex h-11 sm:h-10 w-full rounded-lg border border-zinc-200/80 bg-white shadow-sm px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900">
                        {standardSizes.map(size => <option key={size} value={size}>{size}</option>)}
                      </select>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="dimension_value" className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Dimension</Label>
                        <Input id="dimension_value" className="h-11 sm:h-10 border-zinc-200/80 bg-white shadow-sm" {...register("dimension_value")} placeholder="e.g. 15" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="custom_unit" className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Unit</Label>
                        {sizeMode === 'Custom' ? (
                          <Input id="custom_unit" className="h-11 sm:h-10 border-zinc-200/80 bg-white shadow-sm" {...register("custom_unit")} placeholder="e.g. Grams" />
                        ) : (
                          <Input className="h-11 sm:h-10 bg-zinc-100 text-zinc-500 border-zinc-200/80" disabled value={sizeMode} />
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* === STEP 4: Financials === */}
                <div className={showStep(4) ? "grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-4 animate-in slide-in-from-right-4 sm:animate-none sm:slide-in-from-right-0" : "hidden"}>
                  <div className="space-y-2">
                    <Label htmlFor="purchase_price" className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Purchase Price (₹)</Label>
                    <Input id="purchase_price" className="h-11 sm:h-10 border-zinc-200/80 shadow-sm focus-visible:ring-zinc-900" type="number" step="0.01" {...register("purchase_price")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="selling_price" className="text-xs font-bold text-zinc-900 uppercase tracking-wider">Selling Price (₹) <span className="text-rose-500">*</span></Label>
                    <Input id="selling_price" className="h-11 sm:h-10 border-zinc-300 shadow-sm focus-visible:ring-zinc-900 font-medium" type="number" step="0.01" {...register("selling_price")} />
                    {errors.selling_price && <p className="text-xs text-rose-500 font-medium">{errors.selling_price.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="supplier_code" className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Supplier Code <span className="text-rose-500">*</span></Label>
                    <Input id="supplier_code" className="h-11 sm:h-10 border-zinc-200/80 shadow-sm focus-visible:ring-zinc-900" {...register("supplier_code")} />
                    {errors.supplier_code && <p className="text-xs text-rose-500 font-medium">{errors.supplier_code.message}</p>}
                  </div>
                </div>

                {/* === STEP 5: Packaging & Quantity === */}
                <div className={showStep(5) ? "space-y-4 sm:border border-zinc-200/80 sm:rounded-xl sm:p-5 sm:bg-white sm:shadow-[0_1px_2px_rgba(0,0,0,0.02)] animate-in slide-in-from-right-4 sm:animate-none sm:slide-in-from-right-0" : "hidden"}>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="is_pack" className="text-sm font-semibold text-zinc-900">Bulk Pack Configuration</Label>
                      <p className="text-xs text-zinc-500 mt-0.5">Toggle this if you sell items grouped in boxes/packs.</p>
                    </div>
                    <Switch 
                      id="is_pack" 
                      className="data-[state=checked]:bg-zinc-900"
                      checked={isPack} 
                      onCheckedChange={(checked) => {
                        setValue('is_pack', checked);
                        if (!checked) {
                           setValue('pieces_per_box', 1); setValue('number_of_boxes', 0);
                           setValue('quantity', 1); setValue('price_per_piece', 0); 
                        } else setValue('number_of_boxes', 1);
                      }} 
                    />
                  </div>

                  {isPack ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-4 pt-4 border-t border-zinc-100">
                       <div className="space-y-2">
                         <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Price Per Piece (₹)</Label>
                         <Input className="h-11 sm:h-10 border-zinc-200/80 shadow-sm" type="number" step="0.01" {...register("price_per_piece")} />
                       </div>
                       <div className="space-y-2">
                          <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Pieces per Box</Label>
                          <Input className="h-11 sm:h-10 border-zinc-200/80 shadow-sm" type="number" {...register("pieces_per_box")} />
                       </div>
                       <div className="space-y-2">
                          <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Total Boxes</Label>
                          <Input className="h-11 sm:h-10 border-zinc-200/80 shadow-sm" type="number" {...register("number_of_boxes")} />
                       </div>
                       <div className="sm:col-span-3 text-xs font-semibold text-zinc-700 bg-zinc-50 border border-zinc-200/80 p-3 rounded-lg flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          Total Inventory Added: {numberOfBoxes * piecesPerBox} individual units
                       </div>
                    </div>
                  ) : (
                    <div className="space-y-2 pt-4 border-t border-zinc-100 max-w-xs">
                      <Label htmlFor="quantity" className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Quantity Adding to Stock <span className="text-rose-500">*</span></Label>
                      <Input id="quantity" className="h-11 sm:h-10 border-zinc-200/80 shadow-sm focus-visible:ring-zinc-900" type="number" min="1" {...register("quantity")} />
                    </div>
                  )}
                </div>

                {/* --- NAVIGATION & SUBMIT BUTTONS --- */}
                {isMobile ? (
                  <div className="flex items-center gap-3 pt-4 border-t border-zinc-100">
                    {currentStep > 1 && (
                      <Button type="button" variant="outline" onClick={handlePrevStep} className="flex-1 h-12 rounded-xl text-zinc-700 border-zinc-200/80 shadow-sm font-semibold">
                        <ChevronLeft className="h-4 w-4 mr-1" /> Back
                      </Button>
                    )}
                    
                    {currentStep < TOTAL_STEPS ? (
                      <Button type="button" onClick={handleNextStep} className="flex-[2] h-12 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm font-semibold">
                        Next Step <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    ) : (
                      <Button type="button" onClick={handleSubmit(onSubmit)} disabled={isLoading} className="flex-[2] h-12 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm font-semibold">
                        {isLoading ? "Saving..." : "Save to Database"}
                      </Button>
                    )}
                  </div>
                ) : (
                  <Button type="button" onClick={handleSubmit(onSubmit)} className="w-full h-11 text-sm font-semibold bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm rounded-xl" disabled={isLoading}>
                    {isLoading ? "Saving Inventory..." : "Save Item & Generate Barcode"}
                  </Button>
                )}
                
              </form>
            </CardContent>
          </Card>

          {/* --- BARCODE SUCCESS CARD (Right Column) --- */}
          <div className="lg:col-span-4 sticky top-6">
            {savedItem ? (
              <Card className="animate-fade-in border-zinc-200/80 bg-white shadow-[0_4px_12px_rgba(0,0,0,0.05)] rounded-2xl overflow-hidden">
                <div className="h-1.5 w-full bg-emerald-500" />
                <CardContent className="p-6 space-y-6">
                  
                  <div className="text-center space-y-1">
                    <div className="mx-auto bg-emerald-50 h-10 w-10 rounded-full flex items-center justify-center mb-3">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    </div>
                    <h3 className="font-semibold text-zinc-900">Successfully Generated</h3>
                    <p className="text-xs font-mono text-zinc-500">{savedItem.item_code}</p>
                  </div>
                  
                  {savedItem.image_url && (
                    <div className="flex justify-center">
                      <img src={savedItem.image_url} alt="Uploaded item" className="h-20 w-20 object-cover rounded-xl border border-zinc-200/80 shadow-sm"/>
                    </div>
                  )}

                  {/* Realistic Label Preview */}
                  <div className="flex justify-center">
                      <div className="border border-zinc-200 bg-white p-3 w-[220px] shadow-sm flex flex-col items-center text-center rounded">
                        <div className="font-bold text-[10px] tracking-wider text-zinc-900 uppercase">{tenantName}</div>
                        <div className="text-xs font-semibold text-zinc-800 mt-1.5 leading-tight line-clamp-2">{savedItem.item_name}</div>
                        <div className="text-[10px] text-zinc-500 mt-0.5 font-medium">
                           {savedItem.make} - {savedItem.brand_name} <br/> ({savedItem.size})
                        </div>
                        <div className="my-2 font-bold text-xl text-zinc-900">₹{savedItem.selling_price}</div>
                        <Barcode value={savedItem.item_code} height={30} width={1.4} fontSize={10} displayValue={true} margin={0} />
                      </div>
                  </div>

                  <div className="pt-2">
                    <Button onClick={handlePrint} className="w-full h-11 bg-zinc-900 hover:bg-zinc-800 text-white shadow-sm rounded-xl font-medium">
                      <Printer className="mr-2 h-4 w-4" />
                      Print {savedItem.quantity} Labels
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="hidden lg:flex flex-col items-center justify-center p-8 border border-dashed border-zinc-300 rounded-2xl h-[250px] text-zinc-500 bg-zinc-50/50">
                <Printer className="h-8 w-8 mb-3 text-zinc-300" />
                <p className="text-center font-medium text-sm">Save an item to generate<br/>its barcode label preview.</p>
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
              .label-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 4mm; }
            `}
          </style>
          <div className="label-grid">
            {Array.from({ length: savedItem.pieces_per_box > 1 ? Math.ceil(savedItem.quantity / savedItem.pieces_per_box) : savedItem.quantity }).map((_, i) => (
              <div key={i} className="label-card border border-black bg-white p-2 flex flex-col items-center text-center h-[160px] justify-between break-inside-avoid">
                <div className="w-full">
                <div className="font-bold text-[10px] text-black uppercase">{tenantName}</div>
                  <div className="font-bold text-xs mt-1 truncate">{savedItem.item_name}</div>
                  <div className="text-[10px] text-gray-800">{savedItem.make} {savedItem.brand_name ? `- ${savedItem.brand_name}` : ''}</div>
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