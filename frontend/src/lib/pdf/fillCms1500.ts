import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ClaimData } from "@/types/claim";

/**
 * Fill the CMS-1500 template PDF.
 *
 * The official CMS.gov PDF is a flat (non-fillable) 4-page document at 684×864pt.
 * Page 1 contains the actual CMS-1500 form. We overlay text at calibrated positions
 * matching the standard CMS-1500 box layout.
 *
 * Coordinates are measured from the bottom-left corner of page 1 (684×864).
 * If your template differs, generate a grid overlay to recalibrate:
 *   node -e "..." (see cms1500_grid.pdf)
 */

// Each field: { x, y, size } — y measured from bottom of page
const CMS_FIELDS = {
  // Box 1a — Insured's ID Number (top-right area)
  insuredId:       { x: 400, y: 792, size: 8 },

  // Box 2 — Patient's Name (last, first, middle)
  patientName:     { x: 40,  y: 770, size: 8 },

  // Box 3 — Patient's Birth Date
  patientDob:      { x: 280, y: 770, size: 8 },

  // Box 5 — Patient's Address (used for patient ID here)
  patientId:       { x: 40,  y: 746, size: 8 },

  // Box 11 — Insured's Policy/Group Number
  policyNumber:    { x: 400, y: 722, size: 8 },

  // Box 11c — Insurance Plan Name
  payerName:       { x: 400, y: 676, size: 7 },

  // Box 21 — Diagnosis codes (A, B, C, D)
  dx_a:            { x: 55,  y: 524, size: 8 },
  dx_b:            { x: 55,  y: 510, size: 8 },
  dx_c:            { x: 55,  y: 496, size: 8 },
  dx_d:            { x: 55,  y: 482, size: 8 },

  // Box 24A — Date of Service (From)
  dos_from:        { x: 40,  y: 444, size: 7 },
  // Box 24A — Date of Service (To)
  dos_to:          { x: 108, y: 444, size: 7 },

  // Box 24D — Procedures/CPT (row 1-3)
  cpt_1:           { x: 260, y: 444, size: 8 },
  cpt_2:           { x: 260, y: 420, size: 8 },
  cpt_3:           { x: 260, y: 396, size: 8 },

  // Box 24E — Diagnosis pointer (row 1-3)
  dx_ptr_1:        { x: 340, y: 444, size: 8 },
  dx_ptr_2:        { x: 340, y: 420, size: 8 },
  dx_ptr_3:        { x: 340, y: 396, size: 8 },

  // Box 24F — Charges (row 1-3)
  charge_1:        { x: 400, y: 444, size: 8 },
  charge_2:        { x: 400, y: 420, size: 8 },
  charge_3:        { x: 400, y: 396, size: 8 },

  // Box 28 — Total Charge
  totalCharge:     { x: 400, y: 320, size: 9 },

  // Box 31 — Signature of Physician (Provider name)
  providerSig:     { x: 40,  y: 270, size: 8 },

  // Box 32 — Service Facility (Provider name + ID)
  facilityName:    { x: 290, y: 270, size: 7 },
  facilityId:      { x: 290, y: 258, size: 7 },

  // Box 33 — Billing Provider
  billingName:     { x: 460, y: 270, size: 7 },
  billingId:       { x: 460, y: 258, size: 7 },
};

type FieldKey = keyof typeof CMS_FIELDS;

export async function fillCms1500(claim: ClaimData): Promise<Uint8Array> {
  const templateUrl = `${process.env.NEXT_PUBLIC_APP_URL || ""}/templates/CMS%201500%20template.pdf`;
  const templateBytes = await fetch(templateUrl).then((r) => r.arrayBuffer());

  const pdfDoc = await PDFDocument.load(templateBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const page = pdfDoc.getPages()[0];

  const fill = (field: FieldKey, value: string) => {
    if (!value) return;
    const f = CMS_FIELDS[field];
    page.drawText(value, {
      x: f.x,
      y: f.y,
      size: f.size,
      font,
      color: rgb(0, 0, 0),
    });
  };

  // Header fields
  fill("insuredId", claim.policyNumber);
  fill("patientName", claim.patientName);
  fill("patientDob", claim.patientDob ?? "");
  fill("patientId", claim.patientId);
  fill("policyNumber", claim.policyNumber);
  fill("payerName", claim.payerNameEn);

  // Diagnosis codes (up to 4)
  const dxFields: FieldKey[] = ["dx_a", "dx_b", "dx_c", "dx_d"];
  claim.diagnosisCodes.forEach((code, i) => {
    if (i < dxFields.length && code) {
      fill(dxFields[i], code);
    }
  });

  // Service lines — date of service
  fill("dos_from", claim.dateOfService);
  fill("dos_to", claim.dateOfService);

  // Procedure codes (up to 3 rows)
  const cptFields: FieldKey[] = ["cpt_1", "cpt_2", "cpt_3"];
  const ptrFields: FieldKey[] = ["dx_ptr_1", "dx_ptr_2", "dx_ptr_3"];
  const chargeFields: FieldKey[] = ["charge_1", "charge_2", "charge_3"];

  claim.procedureCodes.forEach((code, i) => {
    if (i < cptFields.length && code) {
      fill(cptFields[i], code);
      fill(ptrFields[i], "A"); // point to first diagnosis
      if (i === 0) {
        fill(chargeFields[i], claim.billedAmount.toFixed(2));
      }
    }
  });

  // Total
  fill("totalCharge", claim.billedAmount.toFixed(2));

  // Provider / facility
  fill("providerSig", claim.providerName);
  fill("facilityName", claim.providerName);
  fill("facilityId", claim.providerId);
  fill("billingName", claim.providerName);
  fill("billingId", claim.providerId);

  return pdfDoc.save();
}
