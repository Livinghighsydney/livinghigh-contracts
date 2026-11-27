"""
Generates a DEMO Living High residential tenancy agreement for end-to-end testing.

    cd backend
    .venv/Scripts/python generate_demo_template.py   ->  demo_tenancy_agreement.pdf

No placeholder text: every value has a clear label and an empty line/box, so you can
place fields on it in the template editor exactly like a real agreement.
This is a sample document for testing only — not legal advice and not the official NSW form.
"""
from fpdf import FPDF

L, R = 18, 18
W = 210 - L - R            # usable width (mm)
INK = (33, 37, 41)
MUTED = (110, 116, 124)
RULE = (170, 176, 184)
BAND = (240, 243, 247)


class Agreement(FPDF):
    def header(self):
        self.set_text_color(*INK)
        self.set_font("Helvetica", "B", 9)
        self.cell(W / 2, 6, "LIVING HIGH", new_x="RIGHT")
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*MUTED)
        self.cell(W / 2, 6, "Residential Tenancy Agreement  |  DEMO", align="R", new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(*RULE)
        self.line(L, self.get_y() + 1, L + W, self.get_y() + 1)
        self.ln(6)

    def footer(self):
        self.set_y(-16)
        self.set_draw_color(*RULE)
        self.line(L, self.get_y(), L + W, self.get_y())
        self.ln(2)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*MUTED)
        self.cell(W / 2, 6, f"Page {self.page_no()} of {{nb}}", new_x="RIGHT")
        # Initials box on every page (place an Initials field here)
        self.cell(W / 2 - 22, 6, "Tenant initials", align="R", new_x="RIGHT")
        self.set_draw_color(*RULE)
        self.rect(self.get_x() + 2, self.get_y() - 0.5, 20, 7)

    # ---- building blocks ----
    def doc_title(self, text, sub):
        self.set_text_color(*INK)
        self.set_font("Helvetica", "B", 18)
        self.cell(W, 9, text, new_x="LMARGIN", new_y="NEXT")
        self.set_font("Helvetica", "", 9.5)
        self.set_text_color(*MUTED)
        self.multi_cell(W, 5, sub, new_x="LMARGIN", new_y="NEXT")
        self.ln(4)

    def section(self, number, text):
        self.ln(2)
        self.set_fill_color(*BAND)
        self.set_text_color(*INK)
        self.set_font("Helvetica", "B", 10)
        self.cell(W, 7.5, f"  {number}.  {text.upper()}", fill=True, new_x="LMARGIN", new_y="NEXT")
        self.ln(3)

    def line_field(self, label, width=None, x=None, label_w=42):
        """Label + empty underline where a value goes (no placeholder text)."""
        width = width or W
        if x is not None:
            self.set_x(x)
        start_x = self.get_x()
        self.set_font("Helvetica", "", 9.5)
        self.set_text_color(*MUTED)
        self.cell(label_w, 8, label, new_x="RIGHT")
        self.set_draw_color(*RULE)
        y = self.get_y() + 6.8
        self.line(self.get_x(), y, start_x + width, y)
        return start_x

    def pair(self, left, right, label_w=42):
        half = (W - 8) / 2
        y = self.get_y()
        self.line_field(left, width=half, x=L, label_w=label_w)
        self.set_y(y)
        self.line_field(right, width=half, x=L + half + 8, label_w=label_w)
        self.ln(11)

    def full(self, label, label_w=42):
        self.line_field(label, x=L, label_w=label_w)
        self.ln(11)

    def para(self, text, size=9.5):
        self.set_font("Helvetica", "", size)
        self.set_text_color(*INK)
        self.multi_cell(W, 5.2, text, new_x="LMARGIN", new_y="NEXT")
        self.ln(1.5)

    def numbered(self, items):
        self.set_font("Helvetica", "", 9.5)
        self.set_text_color(*INK)
        for i, item in enumerate(items, 1):
            self.cell(7, 5.4, f"{i}.", new_x="RIGHT")
            self.multi_cell(W - 7, 5.4, item, new_x="LMARGIN", new_y="NEXT")
            self.ln(0.8)

    def tick_options(self, label, options):
        """A question with printed tick boxes (place Tick box fields exactly over them)."""
        self.set_font("Helvetica", "", 9.5)
        self.set_text_color(*MUTED)
        self.cell(52, 7, label, new_x="RIGHT")
        self.set_text_color(*INK)
        self.set_draw_color(*RULE)
        for opt in options:
            x, y = self.get_x(), self.get_y() + 1.5
            self.rect(x, y, 4, 4)
            self.set_x(x + 6)
            self.cell(self.get_string_width(opt) + 9, 7, opt, new_x="RIGHT")
        self.ln(10)

    def signature_block(self, who):
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(*INK)
        self.cell(W, 7, who, new_x="LMARGIN", new_y="NEXT")
        self.ln(14)  # room for the signature
        half = (W - 12) / 2
        y = self.get_y()
        self.set_draw_color(*INK)
        self.line(L, y, L + half, y)
        self.line(L + half + 12, y, L + W, y)
        self.set_font("Helvetica", "", 8.5)
        self.set_text_color(*MUTED)
        self.set_xy(L, y + 1)
        self.cell(half, 5, "Signature", new_x="RIGHT")
        self.set_x(L + half + 12)
        self.cell(half, 5, "Date", new_x="LMARGIN", new_y="NEXT")
        self.ln(7)
        self.line_field("Full name", width=half, x=L, label_w=22)
        self.ln(14)


def build(path: str) -> None:
    pdf = Agreement(format="A4")
    pdf.alias_nb_pages()
    pdf.set_margins(L, 16, R)
    pdf.set_auto_page_break(True, margin=22)
    pdf.set_title("Living High Residential Tenancy Agreement (Demo)")
    pdf.set_author("Living High")

    # ---------------- Page 1: parties, premises, term, rent ----------------
    pdf.add_page()
    pdf.doc_title(
        "Residential Tenancy Agreement",
        "Demo agreement between Living High Pty Ltd (the landlord's agent) and the tenant named below. "
        "For testing the Living High contracts workspace only.",
    )

    pdf.section(1, "The parties")
    pdf.para("Landlord's agent: Living High Pty Ltd, Sydney NSW 2000.")
    pdf.full("Tenant full name")
    pdf.pair("Tenant email", "Tenant phone", label_w=28)

    pdf.section(2, "The premises")
    pdf.full("Property address")
    pdf.pair("Room / unit", "Number of occupants", label_w=38)
    pdf.tick_options("Furnished", ["Yes", "No"])

    pdf.section(3, "Term of the agreement")
    pdf.pair("Start date", "End date", label_w=28)
    pdf.tick_options("Lease length", ["3 months", "6 months", "12 months"])
    pdf.para(
        "At the end of the fixed term this agreement continues as a periodic agreement unless the tenant "
        "or the landlord's agent gives notice in writing as required by law."
    )

    pdf.section(4, "Rent and bond")
    pdf.pair("Weekly rent (AUD)", "Bond amount (AUD)", label_w=38)
    pdf.tick_options("Rent paid by", ["Bank transfer", "Direct debit", "Rent card"])
    pdf.para(
        "Rent is payable weekly in advance. The bond will be lodged with NSW Fair Trading within "
        "10 working days of receipt and will not be more than four weeks' rent."
    )

    # ---------------- Page 2: terms + optional extras ----------------
    pdf.add_page()
    pdf.section(5, "Tenant responsibilities")
    pdf.numbered([
        "Pay the rent on time and in full.",
        "Keep the room and shared areas clean, tidy and free of hazards.",
        "Not cause or allow a nuisance, and respect other residents' peace, comfort and privacy.",
        "Report any damage or repairs needed to Living High as soon as possible.",
        "Not sub-let, transfer or allow others to live in the room without written consent.",
        "Follow the house rules provided at move-in, which form part of this agreement.",
    ])

    pdf.section(6, "Landlord's agent responsibilities")
    pdf.numbered([
        "Provide the premises in a reasonably clean and fit condition at the start of the tenancy.",
        "Carry out repairs within a reasonable time after being told about them.",
        "Give proper written notice before entering the premises, except in an emergency.",
        "Respect the tenant's reasonable peace, comfort and privacy.",
    ])

    pdf.section(7, "Additional details")
    pdf.tick_options("Car parking required", ["Yes", "No"])
    pdf.full("Emergency contact name", label_w=52)
    pdf.full("Emergency contact phone", label_w=52)
    pdf.full("Special conditions", label_w=52)
    pdf.ln(4)
    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(*INK)
    pdf.set_draw_color(*RULE)
    x, y = pdf.get_x(), pdf.get_y() + 1.5
    pdf.rect(x, y, 4, 4)
    pdf.set_x(x + 7)
    pdf.multi_cell(W - 7, 5.2, "I have received and read the house rules, and I agree to follow them.",
                   new_x="LMARGIN", new_y="NEXT")

    # ---------------- Page 3: consent + signatures ----------------
    pdf.add_page()
    pdf.section(8, "Electronic signing")
    pdf.para(
        "By signing electronically, the tenant confirms they have read and understood this agreement, consent "
        "to sign it electronically under the Electronic Transactions Act 1999 (Cth) and the Electronic "
        "Transactions Act 2000 (NSW), and agree that their electronic signature is legally binding. "
        "A signed copy will be emailed to the tenant."
    )

    pdf.section(9, "Signatures")
    pdf.signature_block("Tenant")
    pdf.signature_block("For Living High Pty Ltd (landlord's agent)")

    pdf.ln(4)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(*MUTED)
    pdf.multi_cell(W, 4.5, "Demo document for testing the Living High contracts workspace. It is not legal advice "
                   "and is not the official NSW Fair Trading standard form.", new_x="LMARGIN", new_y="NEXT")

    pdf.output(path)


if __name__ == "__main__":
    out = "demo_tenancy_agreement.pdf"
    build(out)
    print(f"Created {out}")
