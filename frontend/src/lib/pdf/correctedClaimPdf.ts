import { jsPDF } from "jspdf";
import { Claim, ClaimFormData } from "@/types/claim";

// Brand colors
const NAVY: [number, number, number] = [10, 22, 40];
const TEAL: [number, number, number] = [0, 180, 166];
const GRAY_DARK: [number, number, number] = [55, 65, 81];
const GRAY_MID: [number, number, number] = [107, 114, 128];
const GRAY_BORDER: [number, number, number] = [200, 205, 214];
const BG_ROW: [number, number, number] = [247, 249, 252];

/**
 * Generate a PDF that looks like a standard NPHIES / MENA insurance claim
 * submission form, populated with the AI-corrected values. This is not a
 * report of what changed — it's the actual claim document ready to submit.
 */
export function generateCorrectedClaimPdf(claim: Claim): void {
  const corrected: ClaimFormData = claim.scrub_result?.corrected_claim ?? {
    patient_name: claim.patient_name,
    patient_id: claim.patient_id,
    date_of_service: claim.date_of_service,
    provider_name: claim.provider_name,
    provider_id: claim.provider_id,
    payer_name: claim.payer_name,
    payer_id: claim.payer_id,
    diagnosis_codes: claim.diagnosis_codes,
    procedure_codes: claim.procedure_codes,
    billed_amount: claim.billed_amount,
    notes: claim.notes,
  };

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 15;
  const contentW = pageW - 2 * marginX;
  let y = 15;

  // =================== Watermark (diagonal, full page) ===================
  drawWatermark(doc, pageW, pageH);

  // =================== Form Header ===================
  // Institutional banner (looks like a government/insurance form header)
  doc.setFillColor(...NAVY);
  doc.rect(marginX, y, contentW, 14, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("UNIFIED HEALTHCARE CLAIM FORM", marginX + 4, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(
    "NPHIES / MENA Standard Submission Format",
    marginX + 4,
    y + 11
  );
  // Right side: form code
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Form UCF-2026-A", pageW - marginX - 4, y + 6, {
    align: "right",
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Standard Health Insurance Claim", pageW - marginX - 4, y + 11, {
    align: "right",
  });

  y += 14;

  // Secondary header band with claim number & date
  doc.setFillColor(235, 240, 247);
  doc.setDrawColor(...GRAY_BORDER);
  doc.rect(marginX, y, contentW, 9, "FD");
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  const claimNum = claim.id.slice(0, 8).toUpperCase();
  doc.text(`Claim Reference No: CR-${claimNum}`, marginX + 3, y + 6);
  const submissionDate = new Date().toISOString().split("T")[0];
  doc.text(
    `Submission Date: ${submissionDate}`,
    pageW - marginX - 3,
    y + 6,
    { align: "right" }
  );
  y += 13;

  // =================== Section: Patient Information ===================
  y = sectionHeader(doc, "1. PATIENT INFORMATION", marginX, y, contentW);
  y = formRow(doc, marginX, y, contentW, [
    { label: "Patient Full Name", value: corrected.patient_name, width: 0.6 },
    { label: "Patient ID / National ID", value: corrected.patient_id, width: 0.4 },
  ]);
  y = formRow(doc, marginX, y, contentW, [
    { label: "Date of Service", value: corrected.date_of_service, width: 0.4 },
    { label: "Service Type", value: "Outpatient", width: 0.3 },
    { label: "Encounter Type", value: "Consultation", width: 0.3 },
  ]);
  y += 2;

  // =================== Section: Provider Information ===================
  y = sectionHeader(
    doc,
    "2. PROVIDER / FACILITY INFORMATION",
    marginX,
    y,
    contentW
  );
  y = formRow(doc, marginX, y, contentW, [
    { label: "Provider / Facility Name", value: corrected.provider_name, width: 0.65 },
    { label: "Provider License / ID", value: corrected.provider_id, width: 0.35 },
  ]);
  y = formRow(doc, marginX, y, contentW, [
    { label: "Facility Type", value: "Licensed Healthcare Facility", width: 0.5 },
    { label: "Country", value: "Jordan", width: 0.5 },
  ]);
  y += 2;

  // =================== Section: Payer / Insurance ===================
  y = sectionHeader(
    doc,
    "3. PAYER / INSURANCE INFORMATION",
    marginX,
    y,
    contentW
  );
  y = formRow(doc, marginX, y, contentW, [
    { label: "Insurance Company / Payer", value: corrected.payer_name, width: 0.65 },
    { label: "Policy / Member ID", value: corrected.payer_id, width: 0.35 },
  ]);
  y += 2;

  // =================== Section: Diagnosis Codes ===================
  y = sectionHeader(
    doc,
    "4. DIAGNOSIS CODES (ICD-10)",
    marginX,
    y,
    contentW
  );
  y = codeTable(
    doc,
    marginX,
    y,
    contentW,
    ["#", "ICD-10 Code", "Type"],
    corrected.diagnosis_codes
      .filter(Boolean)
      .map((code, i) => [
        String(i + 1),
        code,
        i === 0 ? "Primary" : "Secondary",
      ]),
    [12, 40, contentW - 12 - 40]
  );
  y += 2;

  // =================== Section: Procedure Codes ===================
  y = sectionHeader(
    doc,
    "5. PROCEDURE CODES (CPT / HCPCS)",
    marginX,
    y,
    contentW
  );
  y = codeTable(
    doc,
    marginX,
    y,
    contentW,
    ["#", "CPT/HCPCS Code", "Type"],
    corrected.procedure_codes
      .filter(Boolean)
      .map((code, i) => [
        String(i + 1),
        code,
        i === 0 ? "Primary" : "Additional",
      ]),
    [12, 40, contentW - 12 - 40]
  );
  y += 2;

  // =================== Section: Billing ===================
  y = sectionHeader(doc, "6. BILLING DETAILS", marginX, y, contentW);
  y = formRow(doc, marginX, y, contentW, [
    {
      label: "Total Billed Amount",
      value: `${corrected.billed_amount.toFixed(2)} JOD`,
      width: 0.4,
    },
    { label: "Currency", value: "JOD (Jordanian Dinar)", width: 0.3 },
    { label: "Payment Terms", value: "Net 30", width: 0.3 },
  ]);
  y += 2;

  // =================== Section: Clinical Notes ===================
  if (corrected.notes && corrected.notes.trim()) {
    y = sectionHeader(
      doc,
      "7. CLINICAL NOTES",
      marginX,
      y,
      contentW
    );
    y = notesBox(doc, marginX, y, contentW, corrected.notes);
    y += 2;
  }

  // =================== Declaration / Signature Block ===================
  if (y > pageH - 55) {
    doc.addPage();
    drawWatermark(doc, pageW, pageH);
    y = 15;
  }
  y = signatureBlock(doc, marginX, y, contentW);

  // =================== Verified Stamp ===================
  drawVerifiedStamp(doc, pageW, pageH);

  // =================== Footer on every page ===================
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...GRAY_BORDER);
    doc.setLineWidth(0.2);
    doc.line(marginX, pageH - 12, pageW - marginX, pageH - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY_MID);
    doc.text(
      "Generated by ClaimRidge — AI Medical Claims Scrubbing Platform",
      marginX,
      pageH - 7
    );
    doc.text(`Page ${i} of ${pageCount}`, pageW - marginX, pageH - 7, {
      align: "right",
    });
  }

  // Save
  const safeName = claim.patient_name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const dateStr = corrected.date_of_service || new Date().toISOString().split("T")[0];
  doc.save(`claim_submission_${safeName}_${dateStr}.pdf`);
}

// =================== Helpers ===================

function sectionHeader(
  doc: jsPDF,
  label: string,
  x: number,
  y: number,
  w: number
): number {
  doc.setFillColor(...NAVY);
  doc.rect(x, y, w, 6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(label, x + 2, y + 4.2);
  return y + 6;
}

interface Field {
  label: string;
  value: string;
  width: number; // fraction of available width
}

function formRow(
  doc: jsPDF,
  x: number,
  y: number,
  totalW: number,
  fields: Field[]
): number {
  const rowH = 11;
  let cx = x;
  fields.forEach((f, i) => {
    const w = totalW * f.width;
    // Cell border
    doc.setDrawColor(...GRAY_BORDER);
    doc.setLineWidth(0.2);
    doc.rect(cx, y, w, rowH);

    // Label
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...GRAY_MID);
    doc.text(f.label.toUpperCase(), cx + 2, y + 3.2);

    // Value
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...GRAY_DARK);
    const valueStr =
      f.value === "" || f.value === null || f.value === undefined
        ? "—"
        : String(f.value);
    const valueLines = doc.splitTextToSize(valueStr, w - 4);
    doc.text(valueLines[0] ?? "—", cx + 2, y + 8.2);

    cx += w;
    // Trailing index suppression
    void i;
  });
  return y + rowH;
}

function codeTable(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  headers: string[],
  rows: string[][],
  colWidths: number[]
): number {
  const rowH = 7;
  const headerH = 6;

  // Header
  doc.setFillColor(...NAVY);
  doc.rect(x, y, w, headerH, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  let cx = x;
  headers.forEach((h, i) => {
    doc.text(h, cx + 2, y + 4);
    cx += colWidths[i];
  });
  y += headerH;

  // Body
  if (rows.length === 0) {
    doc.setDrawColor(...GRAY_BORDER);
    doc.setLineWidth(0.2);
    doc.rect(x, y, w, rowH);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY_MID);
    doc.text("— No codes provided —", x + w / 2, y + 4.7, { align: "center" });
    return y + rowH;
  }

  rows.forEach((row, rowIdx) => {
    if (rowIdx % 2 === 0) {
      doc.setFillColor(...BG_ROW);
      doc.rect(x, y, w, rowH, "F");
    }
    doc.setDrawColor(...GRAY_BORDER);
    doc.setLineWidth(0.2);
    doc.rect(x, y, w, rowH);

    let cellX = x;
    row.forEach((cell, i) => {
      doc.setFont(i === 1 ? "courier" : "helvetica", i === 1 ? "bold" : "normal");
      doc.setFontSize(9);
      doc.setTextColor(...GRAY_DARK);
      doc.text(cell, cellX + 2, y + 4.7);
      cellX += colWidths[i];
    });
    y += rowH;
  });

  return y;
}

function notesBox(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  text: string
): number {
  const lines = doc.splitTextToSize(text, w - 4);
  const h = Math.max(14, lines.length * 4.5 + 4);
  doc.setDrawColor(...GRAY_BORDER);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY_DARK);
  doc.text(lines, x + 2, y + 5);
  return y + h;
}

function signatureBlock(
  doc: jsPDF,
  x: number,
  y: number,
  w: number
): number {
  const colW = w / 2 - 2;

  // Declaration
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY_MID);
  const decl =
    "I certify that the information provided above is true, complete, and accurate to the best of my knowledge. Services billed were medically necessary and rendered as described.";
  const declLines = doc.splitTextToSize(decl, w);
  doc.text(declLines, x, y + 4);
  y += declLines.length * 4 + 6;

  // Two signature columns
  const boxH = 20;
  // Provider
  doc.setDrawColor(...GRAY_BORDER);
  doc.setLineWidth(0.3);
  doc.rect(x, y, colW, boxH);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...GRAY_MID);
  doc.text("PROVIDER SIGNATURE & STAMP", x + 2, y + 4);
  doc.text("Date: _____________________", x + 2, y + boxH - 3);

  // Biller / Authorized person
  doc.rect(x + colW + 4, y, colW, boxH);
  doc.text("AUTHORIZED BILLER SIGNATURE", x + colW + 6, y + 4);
  doc.text("Date: _____________________", x + colW + 6, y + boxH - 3);

  return y + boxH;
}

// Diagonal "VERIFIED BY CLAIMRIDGE" watermark across the page
function drawWatermark(doc: jsPDF, pageW: number, pageH: number) {
  doc.saveGraphicsState();
  // jsPDF uses 0-1 opacity via GState
  // @ts-expect-error — GState is a runtime helper not fully typed
  doc.setGState(new doc.GState({ opacity: 0.05 }));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(72);
  doc.setTextColor(...TEAL);
  doc.text("CLAIMRIDGE VERIFIED", pageW / 2, pageH / 2, {
    align: "center",
    angle: 35,
  });
  doc.restoreGraphicsState();
}

// Round stamp in the bottom-right corner that reads "VERIFIED BY CLAIMRIDGE"
function drawVerifiedStamp(doc: jsPDF, pageW: number, pageH: number) {
  const cx = pageW - 30;
  const cy = pageH - 35;
  const outerR = 16;
  const innerR = 12.5;

  doc.saveGraphicsState();
  // @ts-expect-error — GState runtime helper
  doc.setGState(new doc.GState({ opacity: 0.85 }));

  // Outer ring
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(1.2);
  doc.circle(cx, cy, outerR, "S");
  // Inner ring
  doc.setLineWidth(0.5);
  doc.circle(cx, cy, innerR, "S");

  // Text (3 lines)
  doc.setTextColor(...TEAL);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("VERIFIED", cx, cy - 3, { align: "center" });
  doc.setFontSize(10);
  doc.text("ClaimRidge", cx, cy + 1.5, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.text("AI-SCRUBBED", cx, cy + 5.5, { align: "center" });

  // Date under stamp
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(...GRAY_MID);
  const dateStr = new Date().toISOString().split("T")[0];
  doc.text(dateStr, cx, cy + 9, { align: "center" });

  doc.restoreGraphicsState();
}
