import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Item = {
  id: string;
  item_code: string;
  make: string;
  brand_name: string;
  purchase_price: number;
  selling_price: number;
  supplier_code: string;
  quantity: number;
  item_name: string;
};

export type Bill = {
  id: string;
  created_at: string;
  total_amount: number;
  discount_amount: number;
  final_amount: number;
  customer_phone: string | null;
};

export type BillItem = {
  id: string;
  bill_id: string;
  item_id: string;
  quantity: number;
  price_at_sale: number;
};

export type CartItem = Item & {
  cartQuantity: number;
};
