import { SupabaseClient } from "@supabase/supabase-js";
import type { Claim, ClaimFormData, ClaimStatus } from "@/types/claim";

function generateClaimNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `CLM-${timestamp}-${random}`;
}

export async function saveClaim(
  supabase: SupabaseClient,
  userId: string,
  formData: ClaimFormData,
  status: ClaimStatus = "draft"
): Promise<{ data: Claim | null; error: string | null }> {
  const claimNumber = generateClaimNumber();

  const { data, error } = await supabase
    .from("claims")
    .insert({
      user_id: userId,
      clinic_id: userId,
      claim_number: claimNumber,
      patient_name: formData.patient_name,
      patient_id: formData.patient_id,
      date_of_service: formData.date_of_service,
      provider_name: formData.provider_name,
      provider_id: formData.provider_id,
      payer_name: formData.payer_name,
      payer_id: formData.payer_id,
      diagnosis_codes: formData.diagnosis_codes,
      procedure_codes: formData.procedure_codes,
      billed_amount: formData.billed_amount,
      notes: formData.notes,
      status,
    })
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as Claim, error: null };
}

export async function getClinicClaims(
  supabase: SupabaseClient,
  clinicId: string,
  statusFilter?: ClaimStatus
): Promise<{ data: Claim[]; error: string | null }> {
  let query = supabase
    .from("claims")
    .select("*")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false });

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data as Claim[]) || [], error: null };
}

export async function getInsurerClaims(
  supabase: SupabaseClient,
  statusFilter?: ClaimStatus
): Promise<{ data: Claim[]; error: string | null }> {
  let query = supabase
    .from("claims")
    .select("*")
    .order("created_at", { ascending: false });

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data as Claim[]) || [], error: null };
}

export async function getClaimById(
  supabase: SupabaseClient,
  claimId: string
): Promise<{ data: Claim | null; error: string | null }> {
  const { data, error } = await supabase
    .from("claims")
    .select("*")
    .eq("id", claimId)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as Claim, error: null };
}

export async function checkIsInsurer(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("insurer_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  return !!data;
}
