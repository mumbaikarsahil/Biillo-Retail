import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Create client even if credentials are empty
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export type Item = {
  id: string;
  created_at: string;
  item_code: string;
  item_name: string;
  
  // These can be null in the database, so we allow null here to prevent crashes
  make: string | null;       
  brand_name: string | null; 
  supplier_code: string | null; 
  
  purchase_price: number;
  selling_price: number;     
  price_per_piece: number;   
  quantity: number;          
  pieces_per_box: number;    
  size: string;     
  image_url?: string | null;        
  show_on_web: boolean; 
};

export type Bill = {
  id: string;
  created_at: string;
  total_amount: number;
  discount_amount: number;
  final_amount: number;
  customer_phone: string | null;
  
  // --- New Fields for Udhaar & Payment Tracking ---
  customer_name: string | null;
  payment_status: 'paid' | 'pending'; // 'pending' = Udhaar
  payment_method: 'cash' | 'online' | 'udhaar';
  is_udhaar: boolean;
  advance_paid?: number;
  balance_due?: number;
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