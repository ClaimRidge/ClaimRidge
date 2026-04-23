import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Claim } from "@/types/claim";

// Brand colors (RGB tuples to match jsPDF API)
const NAVY: [number, number, number] = [10, 22, 40];
const TEAL: [number, number, number] = [0, 180, 166];
const GRAY_DARK: [number, number, number] = [55, 65, 81];
const GRAY_MID: [number, number, number] = [107, 114, 128];
const GRAY_LIGHT: [number, number, number] = [243, 244, 246];

function severityColor(severity: string): [number, number, number] {
  switch (severity) {
    case "error":
      return [220, 38, 38]; // red-600
    case "warning":
      return [217, 119, 6]; // amber-600
    case "info":
      return [37, 99, 235]; // blue-600
    default:
      return GRAY_MID;
  }
}

/**
 * Render the actual claimridge-logo-full.svg to a PNG data URL via canvas.
 * Uses a dark background version of the SVG so text is visible on white PDF.
 */
function renderLogoToDataUrl(): Promise<string> {
  // Inline the SVG with dark text (navy) so it's visible on the white PDF background
  const svgMarkup = `<svg width="220" height="50" viewBox="0 0 220 50" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M8 2H36L42 10V30C42 39 33 46 22 49C11 46 2 39 2 30V10L8 2Z" fill="#18d668"/>
  <path d="M11 6H33L38 12V29C38 37 31 43 22 45.5C13 43 6 37 6 29V12L11 6Z" fill="none" stroke="#0a6e33" stroke-width="1.2" stroke-linejoin="round"/>
  <path d="M13 25L19 32L31 17" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="56" y="35" font-family="Inter, Syne, sans-serif" font-weight="700" font-size="26" letter-spacing="-0.8" fill="#0A1628">Claim</text>
  <text x="122" y="35" font-family="Inter, Syne, sans-serif" font-weight="700" font-size="26" letter-spacing="-0.8" fill="#18d668">Ridge</text>
</svg>`;

  return new Promise((resolve) => {
    const scale = 3; // render at 3x for crisp output
    const canvas = document.createElement("canvas");
    canvas.width = 220 * scale;
    canvas.height = 50 * scale;
    const ctx = canvas.getContext("2d")!;
    const img = new Image();
    const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      ctx.drawImage(img, 0, 0, 220 * scale, 50 * scale);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.src = url;
  });
}

export async function generateClaimPdf(claim: Claim): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 15;
  let y = 15;

  // -------- Header --------
  const logoDataUrl = await renderLogoToDataUrl();
  // Logo SVG is 220x50 — render at ~50mm wide x ~11.4mm tall
  const logoW = 50;
  const logoH = logoW * (50 / 220);
  doc.addImage(logoDataUrl, "PNG", marginX, y - 2, logoW, logoH);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY_MID);
  doc.text("AI Medical Claims Scrubbing Report", marginX, y + logoH + 1);

  // Timestamp on right
  const generatedAt = new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  doc.setFontSize(8);
  doc.setTextColor(...GRAY_MID);
  doc.text(`Generated: ${generatedAt}`, pageWidth - marginX, y + 4, {
    align: "right",
  });
  doc.text(`Claim ID: ${claim.id.slice(0, 8)}`, pageWidth - marginX, y + 9, {
    align: "right",
  });

  y += 16;

  // Divider
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.3);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 8;

  // -------- Scrub Result Summary --------
  const result = claim.scrub_result;
  if (result) {
    doc.setFillColor(...GRAY_LIGHT);
    doc.roundedRect(marginX, y, pageWidth - 2 * marginX, 22, 2, 2, "F");

    // Score
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    const score = result.overall_score;
    const scoreColor: [number, number, number] =
      score >= 80 ? [22, 163, 74] : score >= 60 ? [217, 119, 6] : [220, 38, 38];
    doc.setTextColor(...scoreColor);
    doc.text(`${score}`, marginX + 6, y + 14);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY_MID);
    doc.text("/100", marginX + 20, y + 14);

    // Status label
    doc.setFontSize(9);
    doc.setTextColor(...GRAY_MID);
    doc.text("Scrub Score", marginX + 6, y + 19);

    // Status badge
    const statusLabel =
      result.status === "clean"
        ? "CLEAN"
        : result.status === "warnings"
        ? "WARNINGS FOUND"
        : "ERRORS FOUND";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...scoreColor);
    doc.text(`Status: ${statusLabel}`, marginX + 40, y + 9);

    // Issue counts
    const errs = result.issues.filter((i) => i.severity === "error").length;
    const warns = result.issues.filter((i) => i.severity === "warning").length;
    const info = result.issues.filter((i) => i.severity === "info").length;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...GRAY_DARK);
    doc.text(
      `${errs} error${errs !== 1 ? "s" : ""}  ·  ${warns} warning${
        warns !== 1 ? "s" : ""
      }  ·  ${info} suggestion${info !== 1 ? "s" : ""}`,
      marginX + 40,
      y + 16
    );

    y += 28;
  }

  // Helper: two-column key/value rows
  const sectionHeader = (label: string) => {
    if (y > pageHeight - 30) {
      doc.addPage();
      y = 15;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text(label, marginX, y);
    // Teal underline
    doc.setDrawColor(...TEAL);
    doc.setLineWidth(0.6);
    doc.line(marginX, y + 1.5, marginX + 35, y + 1.5);
    y += 6;
  };

  const keyValue = (label: string, value: string | number) => {
    if (y > pageHeight - 20) {
      doc.addPage();
      y = 15;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...GRAY_MID);
    doc.text(label, marginX, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...GRAY_DARK);
    const valueStr = value === "" || value === null || value === undefined ? "—" : String(value);
    doc.text(valueStr, marginX + 50, y);
    y += 6;
  };

  // -------- Patient Information --------
  sectionHeader("Patient Information");
  keyValue("Patient Name", claim.patient_name);
  keyValue("Patient ID", claim.patient_id);
  keyValue("Date of Service", claim.date_of_service);
  y += 2;

  // -------- Provider Information --------
  sectionHeader("Provider Information");
  keyValue("Provider / Facility", claim.provider_name);
  keyValue("Provider ID", claim.provider_id);
  y += 2;

  // -------- Payer Information --------
  sectionHeader("Payer Information");
  keyValue("Payer / Insurance", claim.payer_name);
  keyValue("Policy / Member ID", claim.payer_id);
  y += 2;

  // -------- Codes --------
  sectionHeader("Diagnosis & Procedure Codes");
  keyValue(
    "Diagnosis Codes",
    claim.diagnosis_codes.filter(Boolean).join(", ") || "—"
  );
  keyValue(
    "Procedure Codes",
    claim.procedure_codes.filter(Boolean).join(", ") || "—"
  );
  keyValue("Billed Amount", `${claim.billed_amount.toFixed(2)} JOD`);
  if (claim.notes) {
    keyValue("Notes", claim.notes);
  }
  y += 4;

  // -------- Issues Table --------
  if (result && result.issues.length > 0) {
    if (y > pageHeight - 40) {
      doc.addPage();
      y = 15;
    }
    sectionHeader("AI Scrub Flags");

    autoTable(doc, {
      startY: y,
      head: [["Severity", "Field", "Issue", "Suggestion"]],
      body: result.issues.map((issue) => [
        issue.severity.toUpperCase(),
        issue.field,
        issue.message,
        issue.suggestion,
      ]),
      headStyles: {
        fillColor: NAVY,
        textColor: [255, 255, 255],
        fontSize: 9,
        fontStyle: "bold",
      },
      bodyStyles: {
        fontSize: 9,
        textColor: GRAY_DARK,
        cellPadding: 3,
      },
      alternateRowStyles: { fillColor: [250, 250, 251] },
      columnStyles: {
        0: { cellWidth: 22, fontStyle: "bold" },
        1: { cellWidth: 30 },
        2: { cellWidth: 60 },
        3: { cellWidth: "auto" },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 0) {
          const severity = result.issues[data.row.index].severity;
          data.cell.styles.textColor = severityColor(severity);
        }
      },
      margin: { left: marginX, right: marginX },
    });

    // @ts-expect-error — autoTable attaches lastAutoTable to jsPDF instance
    y = doc.lastAutoTable.finalY + 6;
  }

  // -------- Recommendations --------
  if (result && result.recommendations && result.recommendations.length > 0) {
    if (y > pageHeight - 30) {
      doc.addPage();
      y = 15;
    }
    sectionHeader("Recommendations");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...GRAY_DARK);
    for (const rec of result.recommendations) {
      if (y > pageHeight - 15) {
        doc.addPage();
        y = 15;
      }
      const lines = doc.splitTextToSize(`• ${rec}`, pageWidth - 2 * marginX);
      doc.text(lines, marginX, y);
      y += lines.length * 4.5 + 1;
    }
  }

  // -------- Footer on every page --------
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.2);
    doc.line(
      marginX,
      pageHeight - 12,
      pageWidth - marginX,
      pageHeight - 12
    );
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY_MID);
    doc.text("ClaimRidge — AI Medical Claims Scrubbing", marginX, pageHeight - 7);
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth - marginX,
      pageHeight - 7,
      { align: "right" }
    );
  }

  // -------- Save --------
  const safeName = claim.patient_name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const dateStr = claim.date_of_service || new Date().toISOString().split("T")[0];
  doc.save(`claimridge_${safeName}_${dateStr}.pdf`);
}
