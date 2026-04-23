import type { ClaimData } from "@/types/claim";

const sharedStyles = `
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 30px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid VAR_ACCENT; padding-bottom: 12px; margin-bottom: 20px; }
    .payer-name { font-size: 18px; font-weight: bold; color: VAR_ACCENT; }
    .payer-name-ar { font-size: 14px; color: #444; direction: rtl; }
    .claim-meta { text-align: right; font-size: 10px; color: #555; }
    .claim-number { font-size: 13px; font-weight: bold; color: #111; }
    .section { margin-bottom: 18px; }
    .section-title { font-size: 12px; font-weight: bold; background: #f0f0f0; padding: 4px 8px; border-left: 4px solid VAR_ACCENT; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
    .field { margin-bottom: 6px; }
    .field-label { font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 2px; }
    .field-value { font-size: 11px; font-weight: 500; border-bottom: 1px solid #ccc; padding-bottom: 2px; min-height: 16px; }
    .narrative-box { border: 1px solid #ccc; padding: 10px; min-height: 80px; font-size: 11px; line-height: 1.6; background: #fafafa; }
    .codes-table { width: 100%; border-collapse: collapse; font-size: 10px; }
    .codes-table th { background: VAR_ACCENT; color: white; padding: 5px 8px; text-align: left; }
    .codes-table td { border: 1px solid #ddd; padding: 5px 8px; }
    .codes-table tr:nth-child(even) td { background: #f9f9f9; }
    .amount-box { background: VAR_ACCENT; color: white; padding: 10px 16px; text-align: right; font-size: 16px; font-weight: bold; margin-top: 10px; }
    .footer { margin-top: 30px; border-top: 1px solid #ccc; padding-top: 12px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }
    .sig-line { border-bottom: 1px solid #999; margin-top: 30px; margin-bottom: 4px; }
    .sig-label { font-size: 9px; color: #666; }
    .preauth-banner { background: #fff3cd; border: 1px solid #ffc107; padding: 8px 12px; margin-bottom: 14px; font-size: 10px; }
    .preauth-banner strong { color: #856404; }
    .watermark-draft { position: fixed; top: 40%; left: 20%; font-size: 80px; color: rgba(0,0,0,0.04); transform: rotate(-30deg); z-index: -1; font-weight: bold; }
  </style>
`;

function applyAccentColor(styles: string, color: string): string {
  return styles.replace(/VAR_ACCENT/g, color);
}

function getSubmissionMethod(payerCode: string): string {
  const methods: Record<string, string> = {
    ARAB_ORIENT: "Mixed (Portal / Email)",
    GIG_JORDAN: "Portal Only — claims.gig.com.jo",
    ALAI: "Email Submission",
    AL_NISR: "Mixed (Portal / Paper)",
    ARAB_ASSURERS: "Email Submission",
    JORDAN_INSURANCE: "Mixed (Portal / Paper)",
    MIDDLE_EAST_INS: "Mixed (Portal / Paper)",
    ISLAMIC_INSURANCE: "Paper / Email",
    MEDNET: "TPA Portal — MEDNET",
    NEXTCARE: "TPA Portal — NEXtCare",
  };
  return methods[payerCode] ?? "Contact payer for submission method";
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function baseTemplate(
  claim: ClaimData,
  accentColor: string,
  extraFields: string = ""
): string {
  const diagRows = claim.diagnosisCodes
    .filter(Boolean)
    .map(
      (dx, i) =>
        `<tr><td>${i + 1}</td><td>${escapeHtml(dx)}</td><td>${i === 0 ? "Primary" : "Secondary"}</td></tr>`
    )
    .join("");

  const cptRows = claim.procedureCodes
    .filter(Boolean)
    .map(
      (cpt, i) =>
        `<tr><td>${escapeHtml(cpt)}</td><td>${escapeHtml(claim.dateOfService)}</td><td>${i === 0 ? claim.billedAmount.toFixed(3) + " JOD" : ""}</td><td>${i === 0 ? "Primary" : "Additional"}</td></tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  ${applyAccentColor(sharedStyles, accentColor)}
</head>
<body>
  <div class="watermark-draft">CLAIMRIDGE</div>

  <div class="header">
    <div>
      <div class="payer-name">${escapeHtml(claim.payerNameEn)}</div>
      <div class="payer-name-ar">${escapeHtml(claim.payerNameAr)}</div>
      <div style="font-size:10px;color:#666;margin-top:4px;">Medical Claim Form</div>
    </div>
    <div class="claim-meta">
      <div class="claim-number">${escapeHtml(claim.claimNumber)}</div>
      <div>Generated: ${new Date(claim.generatedAt).toLocaleDateString("en-GB")}</div>
      <div>Submission Method: ${getSubmissionMethod(claim.payerCode)}</div>
    </div>
  </div>

  ${
    claim.preauthNumber
      ? `<div class="preauth-banner">
    <strong>Pre-Authorization Number: ${escapeHtml(claim.preauthNumber)}</strong> — Include this number in all correspondence
  </div>`
      : ""
  }

  <div class="section">
    <div class="section-title">Patient Information</div>
    <div class="grid-2">
      <div class="field"><div class="field-label">Patient Full Name</div><div class="field-value">${escapeHtml(claim.patientName)}</div></div>
      <div class="field"><div class="field-label">National ID / Patient ID</div><div class="field-value">${escapeHtml(claim.patientId)}</div></div>
      <div class="field"><div class="field-label">Date of Service</div><div class="field-value">${escapeHtml(claim.dateOfService)}</div></div>
      <div class="field"><div class="field-label">Policy / Member ID</div><div class="field-value">${escapeHtml(claim.policyNumber)}</div></div>
      ${claim.patientDob ? `<div class="field"><div class="field-label">Date of Birth</div><div class="field-value">${escapeHtml(claim.patientDob)}</div></div>` : ""}
      ${claim.patientGender ? `<div class="field"><div class="field-label">Gender</div><div class="field-value">${escapeHtml(claim.patientGender)}</div></div>` : ""}
    </div>
  </div>

  <div class="section">
    <div class="section-title">Provider Information</div>
    <div class="grid-2">
      <div class="field"><div class="field-label">Provider / Facility Name</div><div class="field-value">${escapeHtml(claim.providerName)}</div></div>
      <div class="field"><div class="field-label">Provider License / ID</div><div class="field-value">${escapeHtml(claim.providerId)}</div></div>
      ${claim.providerSpecialty ? `<div class="field"><div class="field-label">Specialty</div><div class="field-value">${escapeHtml(claim.providerSpecialty)}</div></div>` : ""}
    </div>
  </div>

  <div class="section">
    <div class="section-title">Diagnosis Codes (ICD-10)</div>
    <table class="codes-table">
      <thead><tr><th>#</th><th>ICD-10 Code</th><th>Type</th></tr></thead>
      <tbody>${diagRows || '<tr><td colspan="3" style="text-align:center;color:#999;">No diagnosis codes</td></tr>'}</tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Procedure Codes (CPT/HCPCS)</div>
    <table class="codes-table">
      <thead><tr><th>CPT Code</th><th>Date of Service</th><th>Amount (JOD)</th><th>Type</th></tr></thead>
      <tbody>${cptRows || '<tr><td colspan="4" style="text-align:center;color:#999;">No procedure codes</td></tr>'}</tbody>
    </table>
  </div>

  ${extraFields}

  <div class="section">
    <div class="section-title">Clinical Narrative / Medical Justification</div>
    <div class="narrative-box">${escapeHtml(claim.clinicalNarrative || "No clinical narrative provided.")}</div>
  </div>

  ${claim.additionalNotes ? `
  <div class="section">
    <div class="section-title">Additional Notes</div>
    <div class="narrative-box">${escapeHtml(claim.additionalNotes)}</div>
  </div>` : ""}

  <div class="amount-box">
    Total Billed Amount: ${claim.billedAmount.toFixed(3)} JOD
  </div>

  <div class="footer">
    <div>
      <div class="sig-line"></div>
      <div class="sig-label">Provider Signature &amp; Stamp</div>
    </div>
    <div>
      <div class="sig-line"></div>
      <div class="sig-label">Date</div>
    </div>
    <div>
      <div class="sig-line"></div>
      <div class="sig-label">Authorized Representative</div>
    </div>
  </div>

  <div style="margin-top:16px;font-size:9px;color:#aaa;text-align:center;">
    Generated by ClaimRidge &middot; ${escapeHtml(claim.claimNumber)} &middot; This document is prepared for submission to ${escapeHtml(claim.payerNameEn)}
  </div>
</body>
</html>`;
}

function getMednetExtras(claim: ClaimData): string {
  return `
  <div class="section">
    <div class="section-title">MEDNET TPA Fields</div>
    <div class="grid-3">
      <div class="field"><div class="field-label">MEDNET Auth Number (MN-)</div><div class="field-value">${escapeHtml(claim.preauthNumber ?? "")}</div></div>
      <div class="field"><div class="field-label">Underlying Insurer</div><div class="field-value"></div></div>
      <div class="field"><div class="field-label">Contract Number</div><div class="field-value"></div></div>
    </div>
  </div>`;
}

function getNextcareExtras(claim: ClaimData): string {
  return `
  <div class="section">
    <div class="section-title">NEXtCare TPA Fields</div>
    <div class="grid-3">
      <div class="field"><div class="field-label">NEXtCare Auth Number (NC-)</div><div class="field-value">${escapeHtml(claim.preauthNumber ?? "")}</div></div>
      <div class="field"><div class="field-label">Underlying Insurer</div><div class="field-value"></div></div>
      <div class="field"><div class="field-label">Eligibility Verified</div><div class="field-value">&#9744; Yes  &#9744; No</div></div>
    </div>
  </div>`;
}

const PAYER_COLORS: Record<string, string> = {
  ARAB_ORIENT: "#1B4F72",
  GIG_JORDAN: "#1A5276",
  ALAI: "#145A32",
  AL_NISR: "#6E2F0A",
  ARAB_ASSURERS: "#2C3E50",
  JORDAN_INSURANCE: "#1F618D",
  MIDDLE_EAST_INS: "#7D6608",
  ISLAMIC_INSURANCE: "#1E8449",
  MEDNET: "#6C3483",
  NEXTCARE: "#0E6655",
};

export function generatePayerHTML(claim: ClaimData): string {
  const color = PAYER_COLORS[claim.payerCode] ?? "#1a1a1a";

  let extras = "";
  if (claim.payerCode === "MEDNET") extras = getMednetExtras(claim);
  if (claim.payerCode === "NEXTCARE") extras = getNextcareExtras(claim);

  return baseTemplate(claim, color, extras);
}
