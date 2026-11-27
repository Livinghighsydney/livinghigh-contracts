import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
export async function makeAgreement(certificate = false) {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 0; i < (certificate ? 1 : 2); i++) {
    const page = doc.addPage([595, 842]);
    const green = rgb(0.1, 0.13, 0.21);
    const ink = rgb(0.22, 0.22, 0.24);
    const text = (value: string, x: number, y: number, size = 10, strong = false) =>
      page.drawText(value, { x, y, size, font: strong ? bold : regular, color: ink });
    page.drawRectangle({ x: 0, y: 800, width: 595, height: 42, color: green });
    page.drawText("LIVING HIGH", { x: 55, y: 815, size: 12, font: bold, color: rgb(1, 1, 1) });
    text(
      certificate
        ? "Sample signing certificate"
        : i === 0
          ? "Residential tenancy agreement"
          : "Terms & tenant acceptance",
      55,
      745,
      23,
      true,
    );
    text("NEW SOUTH WALES  |  SAMPLE AGREEMENT", 55, 716, 9);
    if (certificate) {
      text("Preview document - not a legally executed certificate.", 55, 660, 12);
      text("No tenant signature has been collected in this workspace preview.", 55, 630);
    } else if (i === 0) {
      text("1. The parties", 55, 667, 13, true);
      text("Landlord / managing agent", 55, 638, 10, true);
      text("Living High Property Management, Sydney NSW", 55, 617);
      text("Tenant full name", 55, 589, 9);
      text("2. The premises", 55, 548, 13, true);
      text("Property address", 55, 532, 9);
      text("3. Rent and bond", 55, 486, 13, true);
      text("Weekly rent", 55, 478, 9);
      text("Bond amount", 327, 478, 9);
      text("Start date", 55, 424, 9);
      text("Room / end date", 327, 424, 9);
      text("4. Agreement", 55, 365, 13, true);
      [
        "The landlord agrees to let the residential premises to the tenant.",
        "The tenant agrees to pay rent on time and keep the premises clean.",
        "The bond will be lodged in accordance with NSW requirements.",
        "The parties agree to the terms set out in the following pages.",
      ].forEach((line, j) => text(line, 55, 335 - j * 23));
      text("This sample is for preview only and is not legal advice.", 55, 169, 9);
    } else {
      [
        "1. Rent is payable weekly to the account nominated by the managing agent.",
        "2. The tenant must take reasonable care of the property and shared spaces.",
        "3. The tenant must notify the managing agent of damage or necessary repairs.",
        "4. The landlord will maintain the premises in a reasonable state of repair.",
        "5. Access and inspections will follow the notice requirements in NSW law.",
        "6. Neither party may change the agreement without written consent.",
        "7. Ending the tenancy requires notice in accordance with the applicable law.",
      ].forEach((line, j) => text(line, 55, 665 - j * 38));
      text("Tenant acceptance", 55, 329, 15, true);
      text("I have read and agree to the terms of this tenancy agreement.", 55, 302);
      text("Tenant signature", 55, 282, 9);
      text("Date signed", 375, 282, 9);
      text("Managing agent: Living High", 55, 159, 11, true);
      text("This is a sample document. No legal signature has been collected.", 55, 137, 9);
    }
    page.drawLine({
      start: { x: 55, y: 75 },
      end: { x: 540, y: 75 },
      thickness: 0.6,
      color: rgb(0.82, 0.81, 0.79),
    });
    text("LIVING HIGH  /  RESIDENTIAL TENANCY", 55, 54, 8);
    text(`${i + 1} / ${certificate ? 1 : 2}`, 510, 54, 8);
  }
  return doc.save();
}
export async function downloadSample(certificate: boolean, name: string) {
  const bytes = await makeAgreement(certificate);
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}-${certificate ? "sample-certificate" : "sample-agreement"}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
