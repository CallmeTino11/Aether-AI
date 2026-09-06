/**
 * Aether AI — Domain: House Business
 *
 * A site lead (captured on the public pricing page) is a prospect who wants to
 * buy Aether AI itself — they have no business record yet, unlike a lead
 * captured by a tenant's Receptionist (`leads`, migration 0001), which belongs
 * to a real signed-up business and is RLS-scoped to its members.
 *
 * The notification outbox (DEC-0015) is scoped by `business_id`, and reusing
 * its tested delivery/retry/backoff machinery for site-lead alerts (rather
 * than inventing a second pipeline) is worth one fixed row: a "house" business
 * that holds no employees or knowledge and is never shown to a customer. It
 * exists only as an anchor so `notification_outbox` and `notification_recipients`
 * work unchanged for alerts that are really about Aether AI's own sales inbox.
 *
 * Seeded by supabase/migrations/0006_signup_leads.sql.
 */

import { asBusinessId, type BusinessId } from "./employee.js";

export const HOUSE_BUSINESS_ID: BusinessId = asBusinessId("00000000-0000-4000-8000-00000000a5e7");
