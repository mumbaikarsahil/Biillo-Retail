import React, { useState, useEffect, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Barcode from "react-barcode"; 
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase, Item } from "@/lib/supabase";
import { 
  Search, 
  Pencil, 
  Trash2, 
  Printer,
  Loader2, 
  Package, 
  AlertTriangle,
  Image as ImageIcon,
  Globe,
  UploadCloud
} from "lucide-react";

// Image Compressor Utility
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

const editSchema = z.object({
  item_name: z.string().min(1, "Item name is required"),
  size: z.string().min(1, "Size is required"),
  selling_price: z.coerce.number().positive(),
  purchase_price: z.coerce.number().positive(),
  quantity: z.coerce.number().int().min(0),
  is_pack: z.boolean().default(false),
  pieces_per_box: z.coerce.number().int().min(1).default(1),
  number_of_boxes: z.coerce.number().int().min(0).default(0).optional(),
  price_per_piece: z.coerce.number().min(0).optional(),
  show_on_web: z.boolean().default(true),
});

type EditFormData = z.infer<typeof editSchema>;

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', 'Free Size'];

export default function ManageInventory() {
  const [items, setItems] = useState<Item[]>([]);
  const [filteredItems, setFilteredItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState("Loading...");
  const { toast } = useToast();

  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [deletingItem, setDeletingItem] = useState<Item | null>(null);
  const [printingItem, setPrintingItem] = useState<Item | null>(null); 
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Photo Edit States
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const [removeImageFlag, setRemoveImageFlag] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      is_pack: false,
      pieces_per_box: 1,
      quantity: 0,
      show_on_web: true
    }
  });

  const watchedIsPack = useWatch({ control, name: "is_pack" });
  const watchedPieces = useWatch({ control, name: "pieces_per_box" });
  const watchedBoxes = useWatch({ control, name: "number_of_boxes" });
  const watchedShowOnWeb = useWatch({ control, name: "show_on_web" });

  useEffect(() => {
    if (watchedIsPack && watchedPieces && watchedBoxes !== undefined) {
      const total = watchedPieces * watchedBoxes;
      setValue("quantity", total);
    }
  }, [watchedIsPack, watchedPieces, watchedBoxes, setValue]);

  useEffect(() => {
    const initializeTenantData = async () => {
      setIsLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("tenant_id")
          .eq("id", session.user.id)
          .single();

        if (profile && profile.tenant_id) {
          setCurrentTenantId(profile.tenant_id);
          await fetchStoreDetails(profile.tenant_id);
          await fetchItems(profile.tenant_id);
        }
      } catch (error) {
        console.error("Failed to initialize tenant data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    initializeTenantData();
  }, []);

  useEffect(() => {
    const results = items.filter((item) =>
      item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.item_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.brand_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.supplier_code && item.supplier_code.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    setFilteredItems(results);
  }, [searchTerm, items]);

  useEffect(() => {
    if (editingItem) {
      const isPack = (editingItem.pieces_per_box || 1) > 1;
      const pieces = editingItem.pieces_per_box || 1;
      const estimatedBoxes = Math.floor(editingItem.quantity / pieces);

      // Reset photo states
      setEditImagePreview(editingItem.image_url || null);
      setEditImageFile(null);
      setRemoveImageFlag(false);

      reset({
        item_name: editingItem.item_name,
        size: editingItem.size || 'M',
        selling_price: editingItem.selling_price,
        purchase_price: editingItem.purchase_price,
        quantity: editingItem.quantity,
        is_pack: isPack,
        pieces_per_box: pieces,
        number_of_boxes: estimatedBoxes,
        price_per_piece: editingItem.price_per_piece || 0,
        show_on_web: editingItem.show_on_web ?? true,
      });
    }
  }, [editingItem, reset]);

  const fetchStoreDetails = async (tenantId: string) => {
    try {
      const { data } = await supabase.from("tenants").select("tenant_name").eq("id", tenantId).single();
      if (data && data.tenant_name) setStoreName(data.tenant_name);
    } catch (error) {}
  };

  const fetchItems = async (tenantId: string) => {
    try {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setItems(data || []);
      setFilteredItems(data || []);
    } catch (error: any) {
      toast({ title: "Error fetching inventory", description: error.message, variant: "destructive" });
    }
  };

  const toggleWebVisibility = async (item: Item, currentState: boolean) => {
    if (!currentTenantId) return;
    try {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, show_on_web: !currentState } : i));
      const { error } = await supabase.from("items").update({ show_on_web: !currentState }).eq("id", item.id).eq("tenant_id", currentTenantId);
      if (error) throw error;
      toast({ title: "Visibility Updated", description: `${item.item_name} is ${!currentState ? 'now visible' : 'now hidden'} on the website.` });
    } catch (error: any) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, show_on_web: currentState } : i));
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    }
  };

  // Handle local image selection
  const handleEditImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setEditImageFile(file);
      setEditImagePreview(URL.createObjectURL(file));
      setRemoveImageFlag(false);
    }
  };

  // Flag image for removal
  const handleRemoveEditPhoto = () => {
    setEditImageFile(null);
    setEditImagePreview(null);
    setRemoveImageFlag(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUpdate = async (data: EditFormData) => {
    if (!editingItem || !currentTenantId) return;

    try {
      const isPack = data.is_pack;
      let finalImageUrl = editingItem.image_url;

      // 1. Handle Image Upload or Deletion
      if (removeImageFlag) {
        finalImageUrl = null;
      } else if (editImageFile) {
        toast({ title: "Compressing & Uploading image..." });
        const compressedBlob = await compressImage(editImageFile);
        const fileName = `${editingItem.item_code}-${Date.now()}.jpg`;
        
        const { error: uploadError } = await supabase.storage.from("item-images").upload(fileName, compressedBlob, { contentType: "image/jpeg" });
        if (uploadError) throw new Error("Image upload failed: " + uploadError.message);

        const { data: publicUrlData } = supabase.storage.from("item-images").getPublicUrl(fileName);
        finalImageUrl = publicUrlData.publicUrl;
      }
      
      // 2. Update Database
      const { error } = await supabase
        .from("items")
        .update({
          item_name: data.item_name,
          size: data.size,
          selling_price: data.selling_price,
          purchase_price: data.purchase_price,
          quantity: data.quantity,
          pieces_per_box: isPack ? data.pieces_per_box : 1,
          price_per_piece: isPack ? data.price_per_piece : data.selling_price,
          show_on_web: data.show_on_web,
          image_url: finalImageUrl
        })
        .eq("id", editingItem.id)
        .eq("tenant_id", currentTenantId);

      if (error) throw error;

      toast({ title: "Item Updated", description: `${data.item_name} has been updated.` });
      setEditingItem(null);
      fetchItems(currentTenantId); 
    } catch (error: any) {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deletingItem || !currentTenantId) return;
    try {
      const { error } = await supabase.from("items").delete().eq("item_code", deletingItem.item_code).eq("tenant_id", currentTenantId);
      if (error) throw error;
      toast({ title: "Item Deleted", description: "The item has been removed from inventory." });
      setDeletingItem(null);
      fetchItems(currentTenantId);
    } catch (error: any) {
      toast({ title: "Delete Failed", description: error.message, variant: "destructive" });
    }
  };

  const handlePrintLabel = (item: Item) => {
    if (item.quantity <= 0) {
        toast({ title: "No Stock", description: "Cannot print labels for 0 quantity.", variant: "destructive" });
        return;
    }
    setPrintingItem(item);
    setTimeout(() => { window.print(); }, 100);
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-24 md:pb-8 font-sans print:hidden">
        
        {/* --- HEADER --- */}
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 sticky top-0 z-20 bg-zinc-50/80 backdrop-blur-md py-4 -mx-4 px-4 md:static md:bg-transparent md:p-0 md:mx-0 border-b border-zinc-200/60 md:border-0">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900">Manage Inventory</h1>
            <p className="text-muted-foreground mt-0.5 text-xs sm:text-sm font-medium">View, edit, and print barcodes for stock</p>
          </div>
          
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="Search by name, code, brand..."
              className="pl-9 h-11 bg-white border-zinc-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)] rounded-xl focus-visible:ring-zinc-900"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col justify-center items-center h-48 gap-3 text-zinc-400">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-900" />
            <span className="text-sm font-medium">Loading inventory...</span>
          </div>
        ) : filteredItems.length === 0 ? (
           <Card className="border border-dashed border-zinc-300 shadow-none bg-zinc-50/50">
             <CardContent className="flex flex-col items-center justify-center py-16 text-zinc-500">
                <Package className="h-10 w-10 mb-3 text-zinc-300" />
                <p className="font-semibold text-zinc-900">No items found</p>
                <p className="text-sm mt-1">We couldn't find anything matching "{searchTerm}"</p>
             </CardContent>
           </Card>
        ) : (
          <>
            {/* --- MOBILE VIEW --- */}
            <div className="grid grid-cols-1 gap-4 md:hidden">
              {filteredItems.map((item) => (
                <Card key={item.item_code} className="border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] rounded-2xl overflow-hidden bg-white">
                  <CardContent className="p-4 space-y-4">
                    
                    <div className="flex gap-3">
                      <button 
                        onClick={() => item.image_url && setPreviewImage(item.image_url)}
                        className={`h-16 w-16 rounded-xl border border-zinc-200/80 overflow-hidden flex items-center justify-center shrink-0 bg-zinc-50 ${item.image_url ? 'cursor-pointer active:scale-95 transition-transform' : ''}`}
                      >
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.item_name} className="h-full w-full object-cover" />
                        ) : (
                          <ImageIcon className="h-5 w-5 text-zinc-300" />
                        )}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <div className="min-w-0 pr-2">
                            <h3 className="font-semibold text-sm text-zinc-900 truncate">{item.item_name}</h3>
                            <p className="text-[11px] text-zinc-500 font-mono mt-0.5">{item.item_code}</p>
                          </div>
                          <p className="font-bold text-base text-zinc-900 shrink-0">₹{item.selling_price}</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-zinc-50/80 border border-zinc-200/60 p-2.5 rounded-xl">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Brand</span>
                        <span className="font-medium text-zinc-800 truncate">{item.brand_name}</span>
                      </div>
                      <div className="flex flex-col">
                          <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Size</span>
                          <span className="font-medium text-zinc-800">{item.size}</span>
                      </div>
                      <div className="flex flex-col">
                          <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Stock</span>
                          <span className={`font-bold ${item.quantity < 5 ? 'text-rose-600' : 'text-zinc-900'}`}>
                            {item.quantity} units
                          </span>
                      </div>
                      <div className="flex items-center justify-between col-span-2 pt-1 border-t border-zinc-200/80 mt-1">
                        <span className="text-[10px] font-semibold text-zinc-500 flex items-center gap-1.5"><Globe className="h-3.5 w-3.5"/> Website</span>
                        <Switch checked={item.show_on_web ?? true} onCheckedChange={() => toggleWebVisibility(item, item.show_on_web ?? true)} className="scale-75 data-[state=checked]:bg-zinc-900" />
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-1">
                        <div className="flex items-center">
                          {item.quantity < 5 && (
                            <span className="text-[10px] font-bold text-rose-600 flex items-center gap-1 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md uppercase tracking-wider">
                                <AlertTriangle className="h-3 w-3" /> Low Stock
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2">
                         <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg border-zinc-200/80 text-zinc-600 shadow-sm" onClick={() => handlePrintLabel(item)}>
                            <Printer className="h-4 w-4" />
                         </Button>
                         <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg border-zinc-200/80 text-zinc-600 shadow-sm" onClick={() => setEditingItem(item)}>
                            <Pencil className="h-4 w-4" />
                         </Button>
                         <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg border-rose-200 text-rose-600 hover:bg-rose-50 shadow-sm" onClick={() => setDeletingItem(item)}>
                            <Trash2 className="h-4 w-4" />
                         </Button>
                        </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* --- DESKTOP VIEW --- */}
            <Card className="hidden md:block shadow-[0_1px_3px_rgba(0,0,0,0.02)] border-zinc-200/80 rounded-2xl overflow-hidden bg-white">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-zinc-50/50">
                      <TableRow className="border-b border-zinc-200/80">
                        <TableHead className="w-16 text-center">Photo</TableHead>
                        <TableHead className="font-semibold text-zinc-500 uppercase tracking-wider text-[11px]">Code</TableHead>
                        <TableHead className="font-semibold text-zinc-500 uppercase tracking-wider text-[11px]">Item Details</TableHead>
                        <TableHead className="font-semibold text-zinc-500 uppercase tracking-wider text-[11px]">Brand/Size</TableHead>
                        <TableHead className="font-semibold text-zinc-500 uppercase tracking-wider text-[11px] text-center">Web</TableHead>
                        <TableHead className="font-semibold text-zinc-500 uppercase tracking-wider text-[11px] text-right">Price</TableHead>
                        <TableHead className="font-semibold text-zinc-500 uppercase tracking-wider text-[11px] text-center">Stock</TableHead>
                        <TableHead className="font-semibold text-zinc-500 uppercase tracking-wider text-[11px] text-right pr-6">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredItems.map((item) => (
                          <TableRow key={item.item_code} className="border-b border-zinc-100 hover:bg-zinc-50/50 transition-colors">
                            <TableCell className="p-3 text-center">
                               <button 
                                onClick={() => item.image_url && setPreviewImage(item.image_url)}
                                className={`h-10 w-10 mx-auto rounded-lg border border-zinc-200/80 overflow-hidden flex items-center justify-center bg-zinc-50 ${item.image_url ? 'cursor-pointer hover:border-zinc-400 transition-colors' : ''}`}
                               >
                                 {item.image_url ? (
                                   <img src={item.image_url} alt={item.item_name} className="h-full w-full object-cover" />
                                 ) : (
                                   <ImageIcon className="h-4 w-4 text-zinc-300" />
                                 )}
                               </button>
                            </TableCell>
                            <TableCell className="font-mono text-[11px] font-medium text-zinc-500">{item.item_code}</TableCell>
                            <TableCell className="font-semibold text-sm text-zinc-900">{item.item_name}</TableCell>
                            <TableCell>
                              <div className="flex flex-col text-xs">
                                  <span className="font-semibold text-zinc-800">{item.brand_name}</span>
                                  <span className="text-zinc-500">{item.size}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                               <Switch checked={item.show_on_web ?? true} onCheckedChange={() => toggleWebVisibility(item, item.show_on_web ?? true)} className="scale-75 data-[state=checked]:bg-zinc-900" />
                            </TableCell>
                            <TableCell className="text-right font-semibold text-zinc-900">₹{item.selling_price}</TableCell>
                            <TableCell className="text-center">
                              <div className="flex flex-col items-center">
                                  <span className={`font-bold ${item.quantity < 5 ? 'text-rose-600' : 'text-zinc-900'}`}>
                                      {item.quantity}
                                  </span>
                                  {item.quantity < 5 && (
                                      <span className="text-[10px] text-rose-500 font-bold uppercase tracking-wider mt-0.5">Low</span>
                                  )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right pr-6">
                              <div className="flex justify-end gap-1.5">
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md text-zinc-500 hover:bg-white hover:text-zinc-900 shadow-sm border border-transparent hover:border-zinc-200/80" onClick={() => handlePrintLabel(item)}>
                                  <Printer className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md text-zinc-500 hover:bg-white hover:text-zinc-900 shadow-sm border border-transparent hover:border-zinc-200/80" onClick={() => setEditingItem(item)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md text-zinc-500 hover:bg-rose-50 hover:text-rose-600 shadow-sm border border-transparent hover:border-rose-200" onClick={() => setDeletingItem(item)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
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

        {/* IMAGE PREVIEW MODAL */}
        <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
          <DialogContent className="sm:max-w-md p-2 bg-transparent border-0 shadow-none">
             {previewImage && (
                <div className="relative rounded-2xl overflow-hidden bg-zinc-900/50 backdrop-blur-md">
                   <img src={previewImage} alt="Product preview" className="w-full h-auto object-contain max-h-[80vh] rounded-2xl" />
                </div>
             )}
          </DialogContent>
        </Dialog>

        {/* EDIT ITEM MODAL */}
        <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto rounded-2xl p-6 border-zinc-200/80 shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold tracking-tight text-zinc-900">Edit Inventory</DialogTitle>
              <DialogDescription className="text-sm font-medium text-zinc-500">
                Update stock details for {editingItem?.item_code}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(handleUpdate)} className="space-y-5 py-2">
              
              {/* IMAGE EDIT SECTION */}
              <div className="flex items-center gap-4 p-4 border border-zinc-200/80 rounded-xl bg-zinc-50/50">
                 <div className="h-16 w-16 rounded-xl border border-zinc-200/80 overflow-hidden bg-white flex items-center justify-center shrink-0 shadow-sm">
                    {editImagePreview ? (
                       <img src={editImagePreview} alt="Preview" className="h-full w-full object-cover" />
                    ) : (
                       <ImageIcon className="h-6 w-6 text-zinc-300" />
                    )}
                 </div>
                 <div className="flex flex-col gap-2 flex-1">
                    <Label htmlFor="edit-image" className="cursor-pointer bg-white border border-zinc-200/80 text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100 text-xs font-semibold px-3 py-2 rounded-lg text-center shadow-sm transition-colors flex items-center justify-center gap-2">
                       <UploadCloud className="h-3.5 w-3.5" />
                       {editImagePreview ? "Change Photo" : "Upload Photo"}
                    </Label>
                    <Input ref={fileInputRef} id="edit-image" type="file" accept="image/*" className="hidden" onChange={handleEditImageChange} />
                    {editImagePreview && (
                       <button type="button" onClick={handleRemoveEditPhoto} className="text-xs font-semibold text-rose-500 hover:text-rose-700 text-center">
                          Remove Photo
                       </button>
                    )}
                 </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="item_name" className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Item Name</Label>
                <Input id="item_name" className="h-11 rounded-xl border-zinc-200/80 shadow-sm focus-visible:ring-zinc-900" {...register("item_name")} />
                {errors.item_name && <p className="text-xs font-medium text-rose-500">{errors.item_name.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="size" className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Size</Label>
                <select id="size" {...register("size")} className="flex h-11 w-full rounded-xl border border-zinc-200/80 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900">
                  {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="purchase_price" className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Buy Price</Label>
                  <Input id="purchase_price" type="number" className="h-11 rounded-xl border-zinc-200/80 shadow-sm focus-visible:ring-zinc-900" {...register("purchase_price")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="selling_price" className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Sell Price</Label>
                  <Input id="selling_price" type="number" className="h-11 rounded-xl border-zinc-200/80 shadow-sm focus-visible:ring-zinc-900 font-semibold" {...register("selling_price")} />
                </div>
              </div>

              {/* Website Toggle in Edit Modal */}
              <div className="flex items-center justify-between border border-zinc-200/80 p-4 rounded-xl bg-white shadow-sm">
                <div className="space-y-0.5 flex flex-col">
                    <Label className="text-sm font-semibold text-zinc-900 flex items-center gap-2"><Globe className="h-4 w-4 text-zinc-500"/> Website Catalog</Label>
                    <span className="text-[11px] font-medium text-zinc-500">Show this item on the public storefront</span>
                </div>
                <Switch 
                  checked={watchedShowOnWeb}
                  onCheckedChange={(val) => setValue("show_on_web", val)}
                  className="data-[state=checked]:bg-zinc-900"
                />
              </div>

              <div className="flex items-center justify-between border border-zinc-200/80 p-4 rounded-xl bg-zinc-50/50 shadow-sm">
                <div className="space-y-0.5 flex flex-col">
                    <Label className="text-sm font-semibold text-zinc-900">Bulk Pack Setup</Label>
                    <span className="text-[11px] font-medium text-zinc-500">Sold in boxes/packs</span>
                </div>
                <Switch 
                  checked={watchedIsPack}
                  onCheckedChange={(val) => {
                    setValue("is_pack", val);
                    if(!val) {
                        setValue("pieces_per_box", 1);
                        setValue("price_per_piece", undefined);
                    }
                  }}
                  className="data-[state=checked]:bg-zinc-900"
                />
              </div>

              {watchedIsPack ? (
                  <div className="space-y-4 border border-zinc-200/80 p-4 bg-white rounded-xl shadow-sm">
                      <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="pieces_per_box" className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Pieces per Pack</Label>
                            <Input id="pieces_per_box" type="number" className="h-11 rounded-lg border-zinc-200/80 focus-visible:ring-zinc-900" {...register("pieces_per_box")} />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="number_of_boxes" className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">No. of Packs</Label>
                            <Input id="number_of_boxes" type="number" className="h-11 rounded-lg border-zinc-200/80 focus-visible:ring-zinc-900" {...register("number_of_boxes")} />
                          </div>
                      </div>
                      <div className="text-xs font-semibold text-zinc-700 bg-zinc-50 p-2 rounded-lg border border-zinc-200/50 text-center">
                         Total Units: {watchedBoxes || 0} packs × {watchedPieces || 1} pcs = {watchedIsPack && watchedBoxes ? (watchedBoxes * (watchedPieces || 1)) : 0} units
                      </div>
                  </div>
              ) : (
                  <div className="space-y-2">
                    <Label htmlFor="quantity" className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Total Stock Quantity</Label>
                    <Input id="quantity" type="number" className="h-11 rounded-xl border-zinc-200/80 shadow-sm focus-visible:ring-zinc-900" {...register("quantity")} />
                  </div>
              )}

              {watchedIsPack && <input type="hidden" {...register("quantity")} />}

              <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
                <Button type="button" variant="outline" className="h-11 rounded-xl font-semibold border-zinc-200/80 text-zinc-700 w-full sm:w-auto" onClick={() => setEditingItem(null)}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting} className="h-11 rounded-xl font-semibold bg-zinc-900 text-white w-full sm:w-auto">
                    {isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* DELETE CONFIRMATION */}
        <AlertDialog open={!!deletingItem} onOpenChange={(open) => !open && setDeletingItem(null)}>
          <AlertDialogContent className="rounded-2xl border-zinc-200/80 shadow-2xl sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-semibold text-zinc-900">Confirm Deletion</AlertDialogTitle>
              <AlertDialogDescription className="font-medium text-zinc-500">
                Are you sure you want to delete <span className="font-bold text-zinc-900">{deletingItem?.item_name}</span>? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-4 gap-2 sm:gap-0">
              <AlertDialogCancel className="h-11 rounded-xl font-semibold border-zinc-200/80 text-zinc-700 w-full sm:w-auto mt-0">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="h-11 rounded-xl font-semibold bg-rose-600 hover:bg-rose-700 text-white w-full sm:w-auto shadow-sm">
                Delete Item
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>

      {/* --- DYNAMIC PRINT AREA --- */}
      {printingItem && (
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
            {Array.from({ length: printingItem.pieces_per_box > 1 ? Math.ceil(printingItem.quantity / printingItem.pieces_per_box) : printingItem.quantity }).map((_, i) => (
              <div key={i} className="border border-black bg-white p-1 flex flex-col items-center text-center h-[160px] justify-between break-inside-avoid">
                <div className="w-full">
                  <div className="font-bold text-[10px] text-black uppercase truncate">{storeName}</div>
                  <div className="text-[10px] font-bold text-gray-900 truncate mt-1">{printingItem.item_name}</div>
                  <div className="text-[9px] text-gray-700 mt-0.5">{printingItem.brand_name} - {printingItem.size}</div>
                </div>
                <div className="font-extrabold text-xl text-black">₹{printingItem.selling_price}</div>
                <div className="w-full flex justify-center overflow-hidden">
                  <Barcode value={printingItem.item_code} height={35} width={1.4} fontSize={11} displayValue={true} margin={2} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppLayout>
  );
}