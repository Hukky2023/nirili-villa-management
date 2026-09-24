declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    SUPABASE_URL?: string;
    SUPABASE_PUBLISHABLE_KEY?: string;
    NEXT_PUBLIC_SUPABASE_URL?: string;
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
    SUPABASE_SECRET_KEY?: string;
    CHANNEX_API_KEY?: string;
    CHANNEX_STAGING_API_KEY?: string;
    CHANNEX_PRODUCTION_API_KEY?: string;
    CHANNEX_WEBHOOK_TOKEN?: string;
    CHANNEX_API_BASE_URL?: string;
    RESEND_API_KEY?: string;
    BOOKING_EMAIL_FROM?: string;
    BOOKING_EMAIL_REPLY_TO?: string;
  }
}
