import React, { useState, useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Barcode from "react-barcode"; // Changed from QRCode
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
  Printer, // Changed Icon
  Loader2, 
  Package, 
  AlertTriangle,
} from "lucide-react";

// Expanded Schema to include Size and Pack Details
const editSchema = z.object({
  item_name: z.string().min(1, "Item name is required"),
  size: z.string().min(1, "Size is required"),
  selling_price: z.coerce.number().positive(),
  purchase_price: z.coerce.number().positive(),
  quantity: z.coerce.number().int().min(0),
  
  // Pack specific fields
  is_pack: z.boolean().default(false),
  pieces_per_box: z.coerce.number().int().min(1).default(1),
  number_of_boxes: z.coerce.number().int().min(0).default(0).optional(),
  price_per_piece: z.coerce.number().min(0).optional(),
});

type EditFormData = z.infer<typeof editSchema>;

// Common sizes (Same as Add Page)
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', 'Free Size'];

export default function ManageInventory() {
  const [items, setItems] = useState<Item[]>([]);
  const [filteredItems, setFilteredItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  // Modal States
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [deletingItem, setDeletingItem] = useState<Item | null>(null);
  const [printingItem, setPrintingItem] = useState<Item | null>(null); // New Print State

  // Edit Form Hook
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      is_pack: false,
      pieces_per_box: 1,
      quantity: 0
    }
  });

  // Watch fields for calculation logic
  const watchedIsPack = useWatch({ control, name: "is_pack" });
  const watchedPieces = useWatch({ control, name: "pieces_per_box" });
  const watchedBoxes = useWatch({ control, name: "number_of_boxes" });

  // Auto-calculate quantity when pack fields change
  useEffect(() => {
    if (watchedIsPack && watchedPieces && watchedBoxes !== undefined) {
      const total = watchedPieces * watchedBoxes;
      setValue("quantity", total);
    }
  }, [watchedIsPack, watchedPieces, watchedBoxes, setValue]);

  // Fetch Items on Load
  useEffect(() => {
    fetchItems();
  }, []);

  // Filter logic
  useEffect(() => {
    const results = items.filter((item) =>
      item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.item_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.brand_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.supplier_code && item.supplier_code.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    setFilteredItems(results);
  }, [searchTerm, items]);

  // Open Edit Modal and set default values
  useEffect(() => {
    if (editingItem) {
      const isPack = (editingItem.pieces_per_box || 1) > 1;
      const pieces = editingItem.pieces_per_box || 1;
      
      // Calculate estimated boxes (floor)
      const estimatedBoxes = Math.floor(editingItem.quantity / pieces);

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
      });
    }
  }, [editingItem, reset]);

  const fetchItems = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setItems(data || []);
      setFilteredItems(data || []);
    } catch (error: any) {
      toast({
        title: "Error fetching inventory",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdate = async (data: EditFormData) => {
    if (!editingItem) return;

    try {
      const isPack = data.is_pack;
      
      const { error } = await supabase
        .from("items")
        .update({
          item_name: data.item_name,
          size: data.size,
          selling_price: data.selling_price,
          purchase_price: data.purchase_price,
          quantity: data.quantity,
          // Update Pack Fields
          pieces_per_box: isPack ? data.pieces_per_box : 1,
          price_per_piece: isPack ? data.price_per_piece : data.selling_price,
        })
        .eq("id", editingItem.id);

      if (error) throw error;

      toast({
        title: "Item Updated",
        description: `${data.item_name} has been updated.`,
      });

      setEditingItem(null);
      fetchItems(); 
    } catch (error: any) {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deletingItem) return;

    try {
      const { error } = await supabase
        .from("items")
        .delete()
        .eq("item_code", deletingItem.item_code);

      if (error) throw error;

      toast({
        title: "Item Deleted",
        description: "The item has been removed from inventory.",
      });

      setDeletingItem(null);
      fetchItems();
    } catch (error: any) {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handlePrintLabel = (item: Item) => {
    if (item.quantity <= 0) {
        toast({ title: "No Stock", description: "Cannot print labels for 0 quantity.", variant: "destructive" });
        return;
    }
    setPrintingItem(item);
    // Wait for state to update, then print
    setTimeout(() => {
        window.print();
    }, 100);
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in p-4 print:hidden">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Manage Inventory</h1>
            <p className="text-muted-foreground">View, edit, and update your stock levels</p>
          </div>
          
          <div className="relative w-full md:w-72">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search items..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="flex justify-center items-center h-48">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredItems.length === 0 ? (
           <Card>
             <CardContent className="flex flex-col items-center justify-center h-32 text-muted-foreground pt-6">
                <Package className="h-8 w-8 mb-2 opacity-50" />
                <p>No items found matching "{searchTerm}"</p>
             </CardContent>
           </Card>
        ) : (
          <>
            {/* --- MOBILE VIEW: Cards (Hidden on Desktop) --- */}
            <div className="grid grid-cols-1 gap-4 md:hidden">
              {filteredItems.map((item) => (
                <Card key={item.item_code} className="border shadow-sm">
                  <CardContent className="p-4 space-y-3">
                    {/* Row 1: Name and Price */}
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold text-base">{item.item_name}</h3>
                        <p className="text-xs text-muted-foreground font-mono">{item.item_code}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg">₹{item.selling_price}</p>
                      </div>
                    </div>

                    {/* Row 2: Details Grid */}
                    <div className="grid grid-cols-2 gap-2 text-sm bg-muted/30 p-2 rounded-md">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-muted-foreground uppercase">Brand</span>
                        <span className="font-medium truncate">{item.brand_name}</span>
                      </div>
                      <div className="flex flex-col">
                          <span className="text-[10px] text-muted-foreground uppercase">Size</span>
                          <span className="font-medium">{item.size}</span>
                      </div>
                      <div className="flex flex-col">
                          <span className="text-[10px] text-muted-foreground uppercase">Stock</span>
                          <span className={`font-bold ${item.quantity < 5 ? 'text-red-600' : 'text-foreground'}`}>
                            {item.quantity} units
                          </span>
                      </div>
                      <div className="flex flex-col">
                          <span className="text-[10px] text-muted-foreground uppercase">Pack</span>
                          <span>{item.pieces_per_box > 1 ? `Pack of ${item.pieces_per_box}` : 'Single'}</span>
                      </div>
                    </div>

                    {/* Row 3: Actions */}
                    <div className="flex justify-between items-center pt-2 border-t mt-2">
                        <div className="flex items-center">
                          {item.quantity < 5 && (
                            <span className="text-xs text-red-500 flex items-center gap-1 bg-red-50 px-2 py-1 rounded-full">
                                <AlertTriangle className="h-3 w-3" /> Low Stock
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2">
                         <Button variant="outline" size="sm" onClick={() => handlePrintLabel(item)}>
                            <Printer className="h-4 w-4" />
                         </Button>
                         <Button variant="outline" size="sm" onClick={() => setEditingItem(item)}>
                            <Pencil className="h-4 w-4" />
                         </Button>
                         <Button variant="outline" size="sm" className="text-destructive border-destructive/20" onClick={() => setDeletingItem(item)}>
                            <Trash2 className="h-4 w-4" />
                         </Button>
                        </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* --- DESKTOP VIEW: Table (Hidden on Mobile) --- */}
            <Card className="hidden md:block">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Stock List</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Item Details</TableHead>
                        <TableHead>Brand/Make</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead>Pack Info</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-center">Stock</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredItems.map((item) => (
                          <TableRow key={item.item_code}>
                            <TableCell className="font-mono text-xs">{item.item_code}</TableCell>
                            <TableCell className="font-medium">{item.item_name}</TableCell>
                            <TableCell>
                              <div className="flex flex-col text-xs">
                                  <span>{item.brand_name}</span>
                                  <span className="text-muted-foreground">{item.make}</span>
                              </div>
                            </TableCell>
                            <TableCell>{item.size}</TableCell>
                            <TableCell>
                              {item.pieces_per_box > 1 ? (
                                <Badge variant="secondary" className="whitespace-nowrap">
                                  Pack of {item.pieces_per_box}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">₹{item.selling_price}</TableCell>
                            <TableCell className="text-center">
                              <div className="flex flex-col items-center">
                                  <span className={`font-bold ${item.quantity < 5 ? 'text-red-500' : ''}`}>
                                      {item.quantity}
                                  </span>
                                  {item.quantity < 5 && (
                                      <span className="text-[10px] text-red-500 flex items-center gap-1">
                                          <AlertTriangle className="h-3 w-3" /> Low
                                      </span>
                                  )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button variant="ghost" size="icon" onClick={() => handlePrintLabel(item)}>
                                  <Printer className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => setEditingItem(item)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeletingItem(item)}>
                                  <Trash2 className="h-4 w-4" />
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

        {/* --- EDIT MODAL (Expanded with Pack Logic) --- */}
        <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
          <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Item</DialogTitle>
              <DialogDescription>
                Update details for {editingItem?.item_code}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(handleUpdate)} className="space-y-4">
              
              {/* Basic Info */}
              <div className="space-y-2">
                <Label htmlFor="item_name">Item Name</Label>
                <Input id="item_name" {...register("item_name")} />
                {errors.item_name && <p className="text-sm text-destructive">{errors.item_name.message}</p>}
              </div>

              {/* Size Dropdown */}
              <div className="space-y-2">
                <Label htmlFor="size">Size</Label>
                <select
                  id="size"
                  {...register("size")}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                >
                  {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Prices */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="purchase_price">Buy Price</Label>
                  <Input id="purchase_price" type="number" {...register("purchase_price")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="selling_price">Sell Price</Label>
                  <Input id="selling_price" type="number" {...register("selling_price")} />
                </div>
              </div>

              {/* PACK TOGGLE */}
              <div className="flex items-center justify-between border p-3 rounded-md bg-muted/20">
                <div className="space-y-0.5">
                    <Label className="text-base">Pack Item</Label>
                    <p className="text-xs text-muted-foreground">Is this item sold in boxes/packs?</p>
                </div>
                <Switch 
                  checked={watchedIsPack}
                  onCheckedChange={(val) => {
                    setValue("is_pack", val);
                    // Reset pack logic if turning off
                    if(!val) {
                        setValue("pieces_per_box", 1);
                        setValue("price_per_piece", undefined);
                    }
                  }}
                />
              </div>

              {/* DYNAMIC PACK FIELDS */}
              {watchedIsPack ? (
                  <div className="space-y-4 border-l-2 border-primary pl-4 bg-muted/10 py-2 rounded-r-md">
                      <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="pieces_per_box">Pieces per Pack</Label>
                            <Input id="pieces_per_box" type="number" {...register("pieces_per_box")} />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="number_of_boxes">No. of Packs</Label>
                            <Input 
                                id="number_of_boxes" 
                                type="number" 
                                placeholder="Auto-calcs Total"
                                {...register("number_of_boxes")} 
                            />
                          </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="price_per_piece">Price Per Piece (Optional)</Label>
                        <Input id="price_per_piece" type="number" {...register("price_per_piece")} />
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <span className="font-semibold text-primary">
                            Total Calculation:
                        </span> {watchedBoxes || 0} packs × {watchedPieces || 1} pcs = {watchedIsPack && watchedBoxes ? (watchedBoxes * (watchedPieces || 1)) : 0} units
                      </div>
                  </div>
              ) : (
                  // Regular Quantity Input (Non-Pack)
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Total Stock Quantity</Label>
                    <Input id="quantity" type="number" {...register("quantity")} />
                  </div>
              )}

              {/* Hidden Quantity Field for Pack Logic Sync */}
              {watchedIsPack && <input type="hidden" {...register("quantity")} />}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingItem(null)}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deletingItem} onOpenChange={(open) => !open && setDeletingItem(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete 
                <span className="font-bold"> {deletingItem?.item_name} </span> 
                from your inventory.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete Item
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>

      {/* --- HIDDEN PRINT AREA --- */}
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
              <div key={i} className="border border-gray-400 bg-white p-1 flex flex-col items-center text-center h-[160px] justify-between break-inside-avoid">
                <div className="w-full">
                  <div className="font-bold text-sm text-black">प्रगती'ज सखी कलेक्शन</div>
                  <div className="text-[10px] text-gray-800">साई भवन, शहापूर</div>
                </div>
                <div className="font-extrabold text-xl text-black">₹{printingItem.selling_price}</div>
                <div className="w-full flex justify-center overflow-hidden">
                  <Barcode value={printingItem.item_code} height={35} width={1.4} fontSize={11} displayValue={true} margin={2} />
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