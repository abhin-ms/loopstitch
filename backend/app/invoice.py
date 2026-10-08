import io
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_RIGHT, TA_LEFT

BRAND_INK = colors.HexColor("#0B0B0D")
BRAND_RED = colors.HexColor("#FF3B5C")
BRAND_GREY = colors.HexColor("#6B6B70")


def generate_invoice_pdf(order) -> bytes:
    """order: models.Order instance (with .items loaded)"""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        topMargin=20 * mm, bottomMargin=20 * mm,
        leftMargin=18 * mm, rightMargin=18 * mm,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("Title", parent=styles["Title"], textColor=BRAND_INK, fontSize=26, spaceAfter=0)
    small_grey = ParagraphStyle("SmallGrey", parent=styles["Normal"], textColor=BRAND_GREY, fontSize=9)
    normal = ParagraphStyle("Normal2", parent=styles["Normal"], fontSize=10, leading=14)
    right = ParagraphStyle("Right", parent=normal, alignment=TA_RIGHT)
    section = ParagraphStyle("Section", parent=styles["Normal"], fontSize=10, textColor=BRAND_RED, spaceAfter=4)

    elements = []

    # Header
    header_table = Table(
        [[Paragraph("LOOPSTITCH CO.", title_style), Paragraph(f"INVOICE<br/>#{order.order_number}", right)]],
        colWidths=[100 * mm, 70 * mm],
    )
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    elements.append(header_table)
    elements.append(Paragraph("Custom printed streetwear &amp; anime tees", small_grey))
    elements.append(Spacer(1, 4 * mm))
    elements.append(Paragraph(f"Date: {order.created_at.strftime('%d %b %Y, %I:%M %p')}", small_grey))
    elements.append(Spacer(1, 8 * mm))

    # Bill to
    elements.append(Paragraph("BILL TO", section))
    bill_to = (
        f"{order.customer_name}<br/>"
        f"{order.shipping_address}<br/>"
        f"{order.city} {order.state} {order.pincode}<br/>"
        f"{order.customer_phone} &nbsp;|&nbsp; {order.customer_email}"
    )
    elements.append(Paragraph(bill_to, normal))
    elements.append(Spacer(1, 8 * mm))

    # Items table
    data = [["ITEM", "SIZE", "QTY", "UNIT PRICE", "AMOUNT"]]
    for item in order.items:
        data.append([
            f"{item.product_name}{f' ({item.color_name})' if item.color_name else ''}",
            item.size,
            str(item.quantity),
            f"Rs. {item.unit_price:,.2f}",
            f"Rs. {item.unit_price * item.quantity:,.2f}",
        ])

    items_table = Table(data, colWidths=[70 * mm, 20 * mm, 15 * mm, 32 * mm, 33 * mm])
    items_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (1, 0), (1, -1), "CENTER"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F5F7")]),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, BRAND_INK),
    ]))
    elements.append(items_table)
    elements.append(Spacer(1, 6 * mm))

    # Totals
    totals_data = [
        ["Subtotal", f"Rs. {order.subtotal:,.2f}"],
    ]
    if getattr(order, "discount_amount", 0) and order.discount_amount > 0:
        label = (order.offer_label or "Discount").upper()
        totals_data.append([f"Discount ({label})", f"- Rs. {order.discount_amount:,.2f}"])
    if getattr(order, "coupon_discount", 0) and order.coupon_discount > 0:
        code = (order.coupon_code or "COUPON").upper()
        totals_data.append([f"Coupon ({code})", f"- Rs. {order.coupon_discount:,.2f}"])
    totals_data.append(["Shipping", f"Rs. {order.shipping_fee:,.2f}"])
    totals_data.append(["TOTAL", f"Rs. {order.total:,.2f}"])

    # COD advance payment breakdown
    if getattr(order, "payment_method", "") == "cod" and getattr(order, "cod_advance_paid", 0) > 0:
        totals_data.append(["", ""])
        totals_data.append([f"Advance paid online ({order.cod_advance_percent:.0f}%)", f"Rs. {order.cod_advance_paid:,.2f}"])
        balance = round(order.total - order.cod_advance_paid, 2)
        totals_data.append(["Balance on delivery", f"Rs. {balance:,.2f}"])
    totals_table = Table(totals_data, colWidths=[140 * mm, 30 * mm], hAlign="RIGHT")
    totals_table.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, -1), (-1, -1), 12),
        ("TEXTCOLOR", (0, -1), (-1, -1), BRAND_RED),
        ("LINEABOVE", (0, -1), (-1, -1), 0.75, BRAND_INK),
        ("TOPPADDING", (0, -1), (-1, -1), 6),
    ]))
    elements.append(totals_table)
    elements.append(Spacer(1, 14 * mm))

    elements.append(Paragraph(
        "Thank you for supporting an independent streetwear brand. "
        "For order queries, reply to the confirmation email.",
        small_grey,
    ))
    elements.append(Paragraph("Loopstitch — printed on demand, made for fans.", small_grey))

    doc.build(elements)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes
