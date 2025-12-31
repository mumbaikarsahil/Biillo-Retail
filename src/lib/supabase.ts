import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://czdokbkmecadjxbippjm.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6ZG9rYmttZWNhZGp4YmlwcGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxNzY4ODUsImV4cCI6MjA4Mjc1Mjg4NX0.Eb_f56lYLXolVbU0utVdZrvsnQ77FtKktTQtpSgMwB4';

// Create client even if credentials are empty - pages will handle the missing connection gracefully
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

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
