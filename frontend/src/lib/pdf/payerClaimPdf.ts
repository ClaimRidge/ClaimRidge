import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Claim, ClaimFormData } from "@/types/claim";
import { PAYERS } from "@/data/payers";

// Color tuples
type RGB = [number, number, number];

const WHITE: RGB = [255, 255, 255];
const GRAY_DARK: RGB = [55, 65, 81];
const GRAY_MID: RGB = [107, 114, 128];
const GRAY_BORDER: RGB = [200, 205, 214];
const GRAY_LIGHT: RGB = [243, 244, 246];

const PAYER_COLORS: Record<string, RGB> = {
  GIG_JORDAN: [26, 82, 118],
  ALAI: [20, 90, 50],
  AL_NISR: [110, 47, 10],
  ARAB_ASSURERS: [44, 62, 80],
  JORDAN_INSURANCE: [31, 97, 141],
  MIDDLE_EAST_INS: [125, 102, 8],
  ISLAMIC_INSURANCE: [30, 132, 73],
  MEDNET: [108, 52, 131],
  NEXTCARE: [14, 102, 85],
};

const SUBMISSION_METHODS: Record<string, string> = {
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

function getAccentColor(payerCode: string): RGB {
  return PAYER_COLORS[payerCode] ?? [26, 26, 26];
}

export function generatePayerClaimPdf(claim: Claim): void {
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

  const payer = PAYERS.find((p) => p.name === claim.payer_name);
  const payerCode = payer?.code ?? "GENERIC";
  const payerNameAr = payer?.nameAr ?? "";
  const accent = getAccentColor(payerCode);
  const submissionMethod =
    SUBMISSION_METHODS[payerCode] ?? "Contact payer for submission method";

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const mx = 15;
  const cw = pageW - 2 * mx;
  let y = 12;

  const claimNum = `CR-${claim.id.slice(0, 8).toUpperCase()}`;
  const genDate = new Date().toLocaleDateString("en-GB");

  // =================== Watermark ===================
  const drawWatermark = () => {
    doc.saveGraphicsState();
    // @ts-expect-error — GState runtime helper
    doc.setGState(new doc.GState({ opacity: 0.04 }));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(72);
    doc.setTextColor(...accent);
    doc.text("CLAIMRIDGE", pageW / 2, pageH / 2, {
      align: "center",
      angle: 35,
    });
    doc.restoreGraphicsState();
  };
  drawWatermark();

  // =================== Header — Payer banner ===================
  doc.setFillColor(...accent);
  doc.rect(mx, y, cw, 16, "F");

  // Payer name (English)
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(corrected.payer_name || claim.payer_name, mx + 4, y + 7);

  // Payer name (Arabic) — right-aligned
  if (payerNameAr) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(payerNameAr, pageW - mx - 4, y + 7, { align: "right" });
  }

  // Subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Medical Claim Form", mx + 4, y + 13);

  y += 16;

  // =================== Sub-header with claim number ===================
  doc.setFillColor(235, 240, 247);
  doc.setDrawColor(...GRAY_BORDER);
  doc.rect(mx, y, cw, 10, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...accent);
  doc.text(claimNum, mx + 3, y + 4.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY_MID);
  doc.text(`Generated: ${genDate}`, mx + 3, y + 8.5);
  doc.text(
    `Submission: ${submissionMethod}`,
    pageW - mx - 3,
    y + 4.5,
    { align: "right" }
  );

  y += 14;

  // =================== Section helper ===================
  const sectionHeader = (label: string) => {
    if (y > pageH - 30) {
      doc.addPage();
      drawWatermark();
      y = 15;
    }
    doc.setFillColor(...accent);
    doc.rect(mx, y, cw, 6, "F");
    doc.setTextColor(...WHITE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(label, mx + 2, y + 4.2);
    y += 6;
  };

  // =================== Field row helper ===================
  const formRow = (
    fields: { label: string; value: string; width: number }[]
  ) => {
    if (y > pageH - 20) {
      doc.addPage();
      drawWatermark();
      y = 15;
    }
    const rowH = 11;
    let cx = mx;
    fields.forEach((f) => {
      const w = cw * f.width;
      doc.setDrawColor(...GRAY_BORDER);
      doc.setLineWidth(0.2);
      doc.rect(cx, y, w, rowH);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...GRAY_MID);
      doc.text(f.label.toUpperCase(), cx + 2, y + 3.2);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...GRAY_DARK);
      const val = f.value || "—";
      const lines = doc.splitTextToSize(val, w - 4);
      doc.text(lines[0] ?? "—", cx + 2, y + 8.2);

      cx += w;
    });
    y += rowH;
  };

  // =================== Patient Information ===================
  sectionHeader("PATIENT INFORMATION");
  formRow([
    { label: "Patient Full Name", value: corrected.patient_name, width: 0.6 },
    {
      label: "National ID / Patient ID",
      value: corrected.patient_id,
      width: 0.4,
    },
  ]);
  formRow([
    { label: "Date of Service", value: corrected.date_of_service, width: 0.4 },
    {
      label: "Policy / Member ID",
      value: corrected.payer_id,
      width: 0.6,
    },
  ]);
  y += 2;

  // =================== Provider Information ===================
  sectionHeader("PROVIDER / FACILITY INFORMATION");
  formRow([
    {
      label: "Provider / Facility Name",
      value: corrected.provider_name,
      width: 0.65,
    },
    {
      label: "Provider License / ID",
      value: corrected.provider_id,
      width: 0.35,
    },
  ]);
  y += 2;

  // =================== Payer Information ===================
  sectionHeader("PAYER / INSURANCE INFORMATION");
  formRow([
    {
      label: "Insurance Company / Payer",
      value: corrected.payer_name,
      width: 0.65,
    },
    { label: "Policy / Member ID", value: corrected.payer_id, width: 0.35 },
  ]);
  y += 2;

  // =================== TPA-specific fields ===================
  if (payerCode === "MEDNET") {
    sectionHeader("MEDNET TPA FIELDS");
    formRow([
      { label: "MEDNET Auth Number (MN-)", value: "", width: 0.34 },
      { label: "Underlying Insurer", value: "", width: 0.33 },
      { label: "Contract Number", value: "", width: 0.33 },
    ]);
    y += 2;
  }
  if (payerCode === "NEXTCARE") {
    sectionHeader("NEXTCARE TPA FIELDS");
    formRow([
      { label: "NEXtCare Auth Number (NC-)", value: "", width: 0.34 },
      { label: "Underlying Insurer", value: "", width: 0.33 },
      { label: "Eligibility Verified", value: "", width: 0.33 },
    ]);
    y += 2;
  }

  // =================== Diagnosis Codes ===================
  sectionHeader("DIAGNOSIS CODES (ICD-10)");
  const dxCodes = corrected.diagnosis_codes.filter(Boolean);
  autoTable(doc, {
    startY: y,
    head: [["#", "ICD-10 Code", "Type"]],
    body:
      dxCodes.length > 0
        ? dxCodes.map((code, i) => [
            String(i + 1),
            code,
            i === 0 ? "Primary" : "Secondary",
          ])
        : [["—", "No diagnosis codes", "—"]],
    headStyles: {
      fillColor: accent,
      textColor: WHITE,
      fontSize: 8,
      fontStyle: "bold",
    },
    bodyStyles: { fontSize: 9, textColor: GRAY_DARK, cellPadding: 2.5 },
    alternateRowStyles: { fillColor: GRAY_LIGHT },
    columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 45 } },
    margin: { left: mx, right: mx },
  });
  // @ts-expect-error — autoTable attaches lastAutoTable to jsPDF instance
  y = doc.lastAutoTable.finalY + 4;

  // =================== Procedure Codes ===================
  if (y > pageH - 40) {
    doc.addPage();
    drawWatermark();
    y = 15;
  }
  sectionHeader("PROCEDURE CODES (CPT / HCPCS)");
  const cptCodes = corrected.procedure_codes.filter(Boolean);
  autoTable(doc, {
    startY: y,
    head: [["CPT Code", "Date of Service", "Amount (JOD)", "Type"]],
    body:
      cptCodes.length > 0
        ? cptCodes.map((code, i) => [
            code,
            corrected.date_of_service,
            i === 0 ? corrected.billed_amount.toFixed(3) : "",
            i === 0 ? "Primary" : "Additional",
          ])
        : [["—", "—", "—", "—"]],
    headStyles: {
      fillColor: accent,
      textColor: WHITE,
      fontSize: 8,
      fontStyle: "bold",
    },
    bodyStyles: { fontSize: 9, textColor: GRAY_DARK, cellPadding: 2.5 },
    alternateRowStyles: { fillColor: GRAY_LIGHT },
    margin: { left: mx, right: mx },
  });
  // @ts-expect-error — autoTable attaches lastAutoTable to jsPDF instance
  y = doc.lastAutoTable.finalY + 4;

  // =================== Clinical Notes ===================
  if (corrected.notes && corrected.notes.trim()) {
    if (y > pageH - 40) {
      doc.addPage();
      drawWatermark();
      y = 15;
    }
    sectionHeader("CLINICAL NARRATIVE / MEDICAL JUSTIFICATION");
    const noteLines = doc.splitTextToSize(corrected.notes, cw - 6);
    const boxH = Math.max(18, noteLines.length * 4.5 + 6);
    doc.setDrawColor(...GRAY_BORDER);
    doc.setFillColor(250, 250, 251);
    doc.setLineWidth(0.2);
    doc.rect(mx, y, cw, boxH, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...GRAY_DARK);
    doc.text(noteLines, mx + 3, y + 5);
    y += boxH + 4;
  }

  // =================== Billed Amount ===================
  if (y > pageH - 25) {
    doc.addPage();
    drawWatermark();
    y = 15;
  }
  doc.setFillColor(...accent);
  doc.rect(mx, y, cw, 10, "F");
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(
    `Total Billed Amount: ${corrected.billed_amount.toFixed(3)} JOD`,
    pageW - mx - 4,
    y + 7,
    { align: "right" }
  );
  y += 16;

  // =================== Signature block ===================
  if (y > pageH - 40) {
    doc.addPage();
    drawWatermark();
    y = 15;
  }
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY_MID);
  const decl =
    "I certify that the information provided above is true, complete, and accurate to the best of my knowledge. Services billed were medically necessary and rendered as described.";
  const declLines = doc.splitTextToSize(decl, cw);
  doc.text(declLines, mx, y + 4);
  y += declLines.length * 4 + 6;

  const colW = cw / 3 - 4;
  const boxH = 18;
  const labels = [
    "Provider Signature & Stamp",
    "Date",
    "Authorized Representative",
  ];
  labels.forEach((label, i) => {
    const cx = mx + i * (colW + 6);
    doc.setDrawColor(...GRAY_BORDER);
    doc.setLineWidth(0.3);
    doc.rect(cx, y, colW, boxH);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...GRAY_MID);
    doc.text(label.toUpperCase(), cx + 2, y + boxH - 2);
  });

  // =================== Footer on every page ===================
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...GRAY_BORDER);
    doc.setLineWidth(0.2);
    doc.line(mx, pageH - 12, pageW - mx, pageH - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY_MID);
    doc.text(
      `Generated by ClaimRidge · ${claimNum} · Prepared for ${corrected.payer_name || claim.payer_name}`,
      mx,
      pageH - 7
    );
    doc.text(`Page ${i} of ${pageCount}`, pageW - mx, pageH - 7, {
      align: "right",
    });
  }

  // =================== Save ===================
  const safeName = claim.patient_name
    .replace(/[^a-z0-9]/gi, "_")
    .toLowerCase();
  doc.save(`claim_${payerCode}_${safeName}_${corrected.date_of_service}.pdf`);
}
