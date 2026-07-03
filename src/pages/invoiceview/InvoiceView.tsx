import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import {
MapPin,
Loader2,
CheckCircle2,
Download,
Clock,
Image as ImageIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function InvoiceView() {
const { id } = useParams();
const [bill, setBill] = useState<any>(null);
const [items, setItems] = useState<any[]>([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
fetchBill();
}, [id]);

const fetchBill = async () => {
if (!id) return;

try {
  const { data: billData, error: billError } = await supabase
    .from("bills")
    .select("*, tenants(tenant_name, tenant_logo)")
    .eq("share_id", id)
    .single();

  if (billError) throw billError;

  const { data: itemsData, error: itemsError } = await supabase
    .from("bill_items")
    .select(
      `
      *,
      items (
        item_name,
        item_code,
        make,
        brand_name,
        image_url
      )
    `
    )
    .eq("bill_id", billData.id);

  if (itemsError) throw itemsError;

  setBill(billData);
  setItems(
    (itemsData || []).map((i: any) => ({
      ...i,
      item_name: i.items?.item_name || "Unknown Item",
      item_code: i.items?.item_code || i.item_code || "-",
      make: i.items?.make || "-",
      brand_name: i.items?.brand_name || "-",
      image_url: i.items?.image_url || "",
    }))
  );
} catch (error) {
  console.error("Error fetching invoice:", error);
} finally {
  setLoading(false);
}

};

const safeNumber = (value: any) => Number(value || 0);

if (loading) {
return ( <div className="h-[100dvh] flex flex-col items-center justify-center bg-slate-50"> <Loader2 className="h-8 w-8 animate-spin text-slate-800 mb-4" /> <p className="text-slate-500 font-medium">Fetching secure receipt...</p> </div>
);
}

if (!bill) {
return ( <div className="h-[100dvh] flex items-center justify-center bg-slate-50 text-slate-500 font-medium">
Invoice not found or link expired. </div>
);
}

const isPaid = bill.payment_status === "paid";
const isPartiallyPaid = safeNumber(bill.balance_due) > 0;
const businessName = bill.tenants?.tenant_name || "Retail Partner";
const tenantLogo = bill.tenants?.tenant_logo || "";

const handlePrint = () => {
window.print();
};

return (
<> <style>
{`           @media print {
            body { background-color: white !important; }
            .no-print { display: none !important; }
            .print-shadow-none { box-shadow: none !important; border: 1px solid #e2e8f0 !important; }
          }
        `} </style>

      <div className="min-h-[100dvh] bg-slate-100 py-8 px-4 flex flex-col items-center selection:bg-slate-200 font-sans">
        <div className="w-full max-w-[400px]">
          <div className="flex justify-center mb-[-12px] z-10 relative">
            <Badge
              className={`px-4 py-1.5 text-xs font-black tracking-widest uppercase shadow-md border-0 ${
            isPaid ? "bg-green-500 text-white" : "bg-orange-500 text-white"
          }`}
        >
          {isPaid
            ? "Payment Successful"
            : isPartiallyPaid
            ? "Advance Booking"
            : "Payment Pending"}
        </Badge>
      </div>

      <Card className="w-full shadow-2xl print-shadow-none border-0 bg-white rounded-3xl overflow-hidden relative">
        <div
          className={`p-8 text-center border-b-[3px] border-dashed relative ${
            isPaid
              ? "bg-green-50/50 border-green-100"
              : "bg-orange-50/50 border-orange-100"
          }`}
        >
          <div className="absolute -bottom-3 -left-3 h-6 w-6 bg-slate-100 rounded-full shadow-inner no-print"></div>
          <div className="absolute -bottom-3 -right-3 h-6 w-6 bg-slate-100 rounded-full shadow-inner no-print"></div>

          <div className="mx-auto w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-4 shadow-sm border border-slate-100 overflow-hidden">
  {tenantLogo ? (
    <img
      src={tenantLogo}
      alt={businessName}
      className="w-full h-full object-contain p-1"
    />
  ) : isPaid ? (
    <CheckCircle2 className="h-6 w-6 text-green-500" />
  ) : (
    <Clock className="h-6 w-6 text-orange-500" />
  )}
</div>

          <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none mb-2">
            {businessName}
          </h1>
          <p className="text-sm text-slate-500 font-medium flex items-center justify-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" /> E-Receipt
          </p>
        </div>

        <CardContent className="p-7 space-y-6">
          <div className="bg-slate-50 p-4 rounded-2xl flex justify-between text-sm border border-slate-100">
            <div className="space-y-1">
              <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">
                Date
              </p>
              <p className="font-bold text-slate-700">
                {new Date(bill.created_at).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
            <div className="space-y-1 text-right">
              <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">
                Invoice No
              </p>
              <p className="font-bold text-slate-700 uppercase">
                {bill.id.toString().slice(0, 8)}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">
              Order Summary
            </h3>

            {items.map((item, idx) => {
              const hasImage = !!item.image_url;

              return (
                <div
                  key={idx}
                  className="flex gap-3 items-start rounded-2xl border border-slate-100 bg-white p-3 shadow-sm"
                >
                  <div className="w-[4.5rem] h-[4.5rem] rounded-xl bg-slate-50 border border-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                    {hasImage ? (
                      <img
                        src={item.image_url}
                        alt={item.item_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-slate-300" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 truncate">
                          {item.item_name}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Code:{" "}
                          <span className="font-semibold text-slate-700">
                            {item.item_code}
                          </span>
                        </p>
                      </div>

                      <span className="font-black text-slate-900 whitespace-nowrap">
                        ₹{Math.abs(safeNumber(item.price_at_sale) * safeNumber(item.quantity)).toFixed(2)}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                      <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600 font-semibold">
                        Qty: {item.quantity}
                      </span>
                      <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600 font-semibold">
                        Make: {item.make}
                      </span>
                      <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600 font-semibold">
                        Brand: {item.brand_name}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-4 border-t-2 border-dashed border-slate-200 space-y-3">
            <div className="flex justify-between text-sm font-bold text-slate-500">
              <span>Subtotal</span>
              <span>₹{Math.abs(safeNumber(bill.total_amount)).toFixed(2)}</span>
            </div>

            {safeNumber(bill.discount_amount) > 0 && (
              <div className="flex justify-between text-sm font-bold text-green-600">
                <span>Discount</span>
                <span>- ₹{safeNumber(bill.discount_amount).toFixed(2)}</span>
              </div>
            )}

            {isPartiallyPaid ? (
              <div className="pt-3 mt-3 border-t border-slate-100 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-slate-900">
                    Total Bill Amount
                  </span>
                  <span className="text-lg font-black text-slate-900">
                    ₹{Math.abs(safeNumber(bill.final_amount)).toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between items-center text-green-600 bg-green-50 p-2 rounded-lg">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold">Advance Paid</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider">
                      Via {bill.payment_method}
                    </span>
                  </div>
                  <span className="text-lg font-black">
                    ₹{safeNumber(bill.advance_paid).toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between items-center text-orange-600 bg-orange-50 p-3 rounded-xl border border-orange-100">
                  <span className="text-sm font-black uppercase tracking-wider">
                    Balance Due
                  </span>
                  <span className="text-2xl font-black">
                    ₹{safeNumber(bill.balance_due).toFixed(2)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex justify-between items-end pt-3 mt-3 border-t border-slate-100">
                <div>
                  <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Total Paid
                  </span>
                  <Badge
                    variant="secondary"
                    className="text-[10px] uppercase font-bold text-slate-500 bg-slate-100"
                  >
                    Via {bill.payment_method}
                  </Badge>
                </div>
                <span className="text-4xl font-black text-slate-900 tracking-tighter">
                  ₹{Math.abs(safeNumber(bill.final_amount)).toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </CardContent>

        <div className="bg-slate-900 p-5 text-center">
          <p className="text-slate-400 text-xs font-medium mb-1">
            Powered by Biillo
          </p>
          <p className="text-slate-500 text-[10px]">
            Please keep this receipt for your records.
          </p>
        </div>
      </Card>

      <div className="mt-6 flex justify-center no-print">
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-full font-semibold text-sm shadow-lg transition-transform active:scale-95"
        >
          <Download size={18} />
          Download / Print PDF
        </button>
      </div>
    </div>
  </div>
</>
);
}
