import { createClient } from "@supabase/supabase-js";

// Load credentials from your .env file
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Create a single reusable client for the entire app
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
