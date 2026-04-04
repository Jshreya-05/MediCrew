"""Generate a simple patient + ECG summary PDF (decision-support documentation)."""

import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def build_patient_pdf(
    *,
    patient: dict,
    doctor_name: str,
    ecg_summary: dict | None,
    clinical_notes: list[dict],
) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, rightMargin=48, leftMargin=48, topMargin=56, bottomMargin=56)
    styles = getSampleStyleSheet()
    story = []

    title = styles["Title"]
    h2 = styles["Heading2"]
    body = styles["Normal"]
    body.leading = 14

    story.append(Paragraph("MediCrew — CardioAI report", title))
    story.append(Paragraph(f"Generated {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC", styles["Italic"]))
    story.append(Spacer(1, 0.2 * inch))

    story.append(Paragraph("Clinician", h2))
    story.append(Paragraph(doctor_name or "—", body))
    story.append(Spacer(1, 0.15 * inch))

    story.append(Paragraph("Patient", h2))
    pdata = [
        ["Patient ID", patient.get("patient_code") or "—"],
        ["Name", patient.get("full_name") or "—"],
        ["Age", str(patient.get("age") or "—")],
        ["Gender", patient.get("gender") or "—"],
        ["Blood group", patient.get("blood_group") or "—"],
        ["Blood pressure", _bp_line(patient)],
    ]
    t = Table(pdata, colWidths=[1.4 * inch, 4.5 * inch])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#e8f8f4")),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#111827")),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(t)
    if patient.get("notes"):
        story.append(Spacer(1, 0.1 * inch))
        story.append(Paragraph("<b>Notes</b>", body))
        story.append(Paragraph(_escape(patient["notes"]), body))

    story.append(Spacer(1, 0.2 * inch))

    if ecg_summary:
        story.append(Paragraph("ECG analysis (selected study)", h2))
        m = ecg_summary.get("metrics") or {}
        erows = [
            ["File", ecg_summary.get("file_name", "—")],
            ["Rhythm (model)", ecg_summary.get("rhythm_label", "—")],
            ["Heart rate (est.)", f"{m.get('heart_rate_bpm', '—')} BPM" if m.get("heart_rate_bpm") is not None else "—"],
            ["R-R mean", f"{m.get('rr_interval_ms_mean', '—')} ms" if m.get("rr_interval_ms_mean") is not None else "—"],
            ["Peaks detected", str(m.get("peaks_detected", "—"))],
            ["Signal quality", f"{m.get('signal_quality_0_100', '—')} / 100" if m.get("signal_quality_0_100") is not None else "—"],
        ]
        t2 = Table(erows, colWidths=[1.6 * inch, 4.3 * inch])
        t2.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#fef3c7")),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
                    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ]
            )
        )
        story.append(t2)
        story.append(Spacer(1, 0.08 * inch))
        story.append(
            Paragraph(
                "<i>Model output is probabilistic and not a diagnostic label. "
                "BPM and peaks are heuristic. Not for use as a sole clinical basis.</i>",
                styles["Italic"],
            )
        )
    else:
        story.append(Paragraph("ECG analysis", h2))
        story.append(Paragraph("No ECG study attached to this export.", body))

    story.append(Spacer(1, 0.2 * inch))
    story.append(Paragraph("Other reports / notes on file", h2))
    if not clinical_notes:
        story.append(Paragraph("None recorded.", body))
    else:
        for n in clinical_notes:
            story.append(Paragraph(f"<b>{_escape(n.get('title', ''))}</b> ({_escape(n.get('category') or 'general')})", body))
            story.append(Paragraph(_escape(n.get("content", "")), body))
            story.append(Spacer(1, 0.08 * inch))

    doc.build(story)
    buf.seek(0)
    return buf.read()


def _bp_line(p: dict) -> str:
    s, d = p.get("bp_systolic"), p.get("bp_diastolic")
    if s is not None and d is not None:
        return f"{s}/{d} mmHg"
    return "—"


def _escape(s: str) -> str:
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\n", "<br/>")
    )
