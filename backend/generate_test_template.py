"""
Generates a Living High tenancy agreement PDF for use as a Documenso template.
Run: python generate_test_template.py
Then upload the PDF to Documenso and add fields (labels listed at the end).
"""
from fpdf import FPDF

L, R, T = 15, 15, 20
W = 210 - L - R  # usable width = 180mm


class PDF(FPDF):
    def header(self):
        self.set_font("Helvetica", "B", 15)
        self.cell(W, 10, "RESIDENTIAL TENANCY AGREEMENT", align="C", new_x="LMARGIN", new_y="NEXT")
        self.set_font("Helvetica", "", 9)
        self.set_text_color(100, 100, 100)
        self.cell(W, 6, "Living High Pty Ltd  |  Sydney, NSW", align="C", new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(0, 0, 0)
        self.ln(3)

    def footer(self):
        self.set_y(-13)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(150, 150, 150)
        self.cell(W, 8, f"Page {self.page_no()}  |  Living High Residential Tenancy Agreement", align="C")
        self.set_text_color(0, 0, 0)

    def section_title(self, title):
        self.set_font("Helvetica", "B", 10)
        self.set_fill_color(235, 235, 235)
        self.cell(W, 7, f"  {title}", fill=True, new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def field_row(self, label, hint=""):
        self.set_font("Helvetica", "", 10)
        self.cell(55, 7, label + ":", new_x="END", new_y="TOP")
        self.set_font("Helvetica", "I", 10)
        self.set_text_color(170, 170, 170)
        self.cell(W - 55, 7, hint, new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(0, 0, 0)
        self.ln(1)

    def body(self, text):
        self.set_font("Helvetica", "", 9)
        self.set_text_color(70, 70, 70)
        self.set_x(L)
        self.multi_cell(W, 5, text)
        self.set_text_color(0, 0, 0)
        self.ln(2)


pdf = PDF()
pdf.set_margins(L, T, R)
pdf.set_auto_page_break(auto=True, margin=18)
pdf.add_page()

# 1. PARTIES
pdf.section_title("1. PARTIES")
pdf.field_row("Tenant Full Name",   "[tenant_name]")
pdf.field_row("Tenant Email",       "[tenant_email]")
pdf.set_font("Helvetica", "", 10)
pdf.cell(55, 7, "Landlord:", new_x="END", new_y="TOP")
pdf.cell(W - 55, 7, "Living High Pty Ltd", new_x="LMARGIN", new_y="NEXT")
pdf.ln(4)

# 2. PROPERTY
pdf.section_title("2. PROPERTY")
pdf.field_row("Property Address",   "[property_address]")
pdf.field_row("Room / Unit",        "[room_number]")
pdf.ln(4)

# 3. TERM
pdf.section_title("3. TENANCY TERM")
pdf.field_row("Start Date",         "[start_date]")
pdf.field_row("End Date",           "[end_date]")
pdf.body("This agreement is a fixed-term residential tenancy. At the end of the fixed term "
         "it will convert to a periodic tenancy unless otherwise agreed in writing.")

# 4. RENT & BOND
pdf.section_title("4. RENT AND BOND")
pdf.field_row("Weekly Rent (AUD)",  "[weekly_rent]")
pdf.field_row("Bond Amount (AUD)",  "[bond_amount]")
pdf.body("Rent is payable weekly in advance. The bond will be lodged with NSW Fair Trading "
         "within 10 working days of receipt.")

# 5. OBLIGATIONS
pdf.section_title("5. TENANT OBLIGATIONS")
items = [
    "Pay rent on time and in full.",
    "Keep the premises clean and in good condition.",
    "Not cause nuisance or interfere with neighbours' quiet enjoyment.",
    "Report any damage or repairs required promptly.",
    "Not sub-let or assign without written consent.",
    "Comply with all relevant NSW tenancy legislation.",
]
for i, item in enumerate(items, 1):
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(70, 70, 70)
    pdf.set_x(L)
    pdf.multi_cell(W, 5, f"{i}.  {item}")
    pdf.set_text_color(0, 0, 0)
pdf.ln(2)

# 6. E-SIGN CONSENT
pdf.section_title("6. ELECTRONIC SIGNATURE CONSENT")
pdf.body("By signing electronically, the tenant confirms they have read and understood this agreement, "
         "consent to signing electronically under the Electronic Transactions Act 1999 (Cth), "
         "and acknowledge this signature is legally binding.")

# --- PAGE 2: SIGNATURES ---
pdf.add_page()
pdf.section_title("7. SIGNATURES")
pdf.ln(6)

for signer, hint in [
    ("Tenant Signature", "[ place SIGNATURE field here in Documenso ]"),
    ("Landlord / Agent Signature", "[ place SIGNATURE field here in Documenso ]"),
]:
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(W, 6, signer, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(12)
    pdf.set_draw_color(120, 120, 120)
    pdf.line(L, pdf.get_y(), L + 110, pdf.get_y())
    pdf.ln(2)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(160, 160, 160)
    pdf.cell(W, 5, hint, new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)
    pdf.ln(14)

out = "living_high_tenancy_template.pdf"
pdf.output(out)

print(f"\nGenerated: {out}\n")
print("=" * 55)
print("NEXT STEPS — Documenso setup")
print("=" * 55)
print("1. Go to app.documenso.com > Templates > New Template")
print("2. Upload:  living_high_tenancy_template.pdf")
print("3. Add TEXT fields with these exact labels:")
labels = ["tenant_name", "tenant_email", "property_address",
          "room_number", "weekly_rent", "bond_amount", "start_date"]
for lbl in labels:
    print(f"     {lbl}")
print("4. Add a SIGNATURE field on page 2 for the tenant")
print("5. Save the template")
print("6. Copy the template envelope ID (starts with 'envelope_...')")
print("7. Paste it into TEMPLATE_MAP in:")
print("   backend/app/services/contract_service.py")
print('   e.g.  "tenancy_standard": "envelope_xxxxxxxxxxxx"')
