import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { jsPDF } from "jspdf";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  QrCode, 
  Loader2, 
  Package, 
  AlertTriangle 
} from "lucide-react";

// Schema for editing (simplified version of adding)
const editSchema = z.object({
  item_name: z.string().min(1, "Item name is required"),
  selling_price: z.coerce.number().positive(),
  purchase_price: z.coerce.number().positive(),
  quantity: z.coerce.number().int().min(0),
});

type EditFormData = z.infer<typeof editSchema>;

export default function ManageInventory() {
  const [items, setItems] = useState<Item[]>([]);
  const [filteredItems, setFilteredItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  // Modal States
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [deletingItem, setDeletingItem] = useState<Item | null>(null);

  // Edit Form Hook
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
  });

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
      reset({
        item_name: editingItem.item_name,
        selling_price: editingItem.selling_price,
        purchase_price: editingItem.purchase_price,
        quantity: editingItem.quantity,
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
      const { error } = await supabase
        .from("items")
        .update({
          item_name: data.item_name,
          selling_price: data.selling_price,
          purchase_price: data.purchase_price,
          quantity: data.quantity,
        })
        .eq("id", editingItem.id); // Assuming 'id' is the primary key

      if (error) throw error;

      toast({
        title: "Item Updated",
        description: `${data.item_name} has been updated.`,
      });

      setEditingItem(null);
      fetchItems(); // Refresh list
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

  // Re-used Logic from your Add Page
  const generatePDFLabel = (item: Item) => {
    const doc = new jsPDF();
    const labelsPerRow = 3;
    const labelsPerCol = 5;
    const labelWidth = 60;
    const labelHeight = 60;
    const startX = 15;
    const startY = 15;
    const isPackItem = (item.pieces_per_box || 1) > 1;

    // Calculate how many labels to print (Defaults to current quantity)
    // You could arguably make this a prompt, but usually, you print for current stock
    const totalBoxes = Math.ceil(item.quantity / (item.pieces_per_box || 1));
    const totalLabels = isPackItem ? totalBoxes : item.quantity;

    // Limit to 50 labels max to prevent browser hang on huge stock, 
    // or add a prompt for specific count in a future update.
    const printCount = Math.min(totalLabels, 60); 

    if (printCount === 0) {
        toast({ title: "No Stock", description: "Quantity is 0, nothing to print." });
        return;
    }

    for (let i = 0; i < printCount; i++) {
      const pageIndex = Math.floor(i / (labelsPerRow * labelsPerCol));
      const posInPage = i % (labelsPerRow * labelsPerCol);
      const col = posInPage % labelsPerRow;
      const row = Math.floor(posInPage / labelsPerRow);

      if (i > 0 && posInPage === 0) doc.addPage();

      const x = startX + col * labelWidth;
      const y = startY + row * labelHeight;

      doc.rect(x, y, labelWidth - 5, labelHeight - 5);
      
      doc.setFontSize(8);
      doc.text(item.item_code, x + (labelWidth - 5) / 2, y + 10, { align: "center" });
      
      doc.setFontSize(10);
      doc.text(`Rs. ${item.selling_price}`, x + (labelWidth - 5) / 2, y + 20, { align: "center" });
      
      if (isPackItem) {
        doc.setFontSize(8);
        doc.text(`Pack of ${item.pieces_per_box}`, x + (labelWidth - 5) / 2, y + 30, { align: "center" });
      }
      
      const itemName = item.item_name.length > 15 ? item.item_name.substring(0, 15) + '...' : item.item_name;
      doc.setFontSize(7);
      doc.text(itemName, x + (labelWidth - 5) / 2, y + 40, { align: "center" });
    }

    doc.save(`QR_Labels_${item.item_code}.pdf`);
    toast({ title: "Labels Generated", description: `Generated ${printCount} labels.` });
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in p-4">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Manage Inventory</h1>
            <p className="text-muted-foreground">View, edit, and update your stock levels</p>
          </div>
          
          <div className="relative w-full md:w-72">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search items, brands, or codes..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Stock List</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center items-center h-48">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Item Details</TableHead>
                      <TableHead>Brand/Make</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Pack Info</TableHead>
                      <TableHead className="text-right">Price (Selling)</TableHead>
                      <TableHead className="text-center">Stock</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center h-32 text-muted-foreground">
                          No items found matching "{searchTerm}"
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredItems.map((item) => (
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
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Print QR Labels"
                                onClick={() => generatePDFLabel(item)}
                              >
                                <QrCode className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Edit Item"
                                onClick={() => setEditingItem(item)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                title="Delete Item"
                                onClick={() => setDeletingItem(item)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Modal */}
        <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Edit Item</DialogTitle>
              <DialogDescription>
                Update details for {editingItem?.item_code}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(handleUpdate)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="item_name">Item Name</Label>
                <Input id="item_name" {...register("item_name")} />
                {errors.item_name && <p className="text-sm text-destructive">{errors.item_name.message}</p>}
              </div>
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
              <div className="space-y-2">
                <Label htmlFor="quantity">Total Stock Quantity</Label>
                <Input id="quantity" type="number" {...register("quantity")} />
                {editingItem?.pieces_per_box! > 1 && (
                    <p className="text-xs text-muted-foreground">
                        Note: This is a pack item (Pack of {editingItem?.pieces_per_box}). 
                        Enter total pieces.
                    </p>
                )}
              </div>
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
    </AppLayout>
  );
}