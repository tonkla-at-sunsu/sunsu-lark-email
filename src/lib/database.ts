import { createClient, SupabaseClient } from '@supabase/supabase-js'



export const getSupabaseServiceClient = (): SupabaseClient => {
    return createClient(process.env.SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");
}