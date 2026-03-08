import jsPDF from 'jspdf';
import { AlignmentType, Document, Packer, Paragraph, TextRun } from 'docx';
import { format } from 'date-fns';
import type { Report, ReportType } from '@/lib/db';
import { buildReportDownloadText, formatDurationLabel } from '@/utils/reportFormatting';

const typeLabels: Record<ReportType, string> = {
  general: 'General Clinical Note',
  soap: 'SOAP Notes',
  diagnostic: 'Diagnostic Report',
};

const SECTION_HEADERS = new Set([
  'Patient Information',
  'Chief Complaint',
  'History of Present Illness',
  'Symptoms',
  'Medical Assessment',
  'Diagnosis',
  'Treatment Plan',
  'Medications',
  'Follow-up Instructions',
]);

function saveBlob(blob: Blob, fileName: string) {
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(blobUrl);
}

function getReportBody(report: Report) {
  return buildReportDownloadText(report);
}

function getMetaLines(report: Report, doctorName = '', patientId = '') {
  return [
    `Date: ${format(new Date(report.createdAt), 'MMMM d, yyyy h:mm a')}`,
    `Type: ${typeLabels[report.reportType]}`,
    `Duration: ${formatDurationLabel(report.duration)}`,
    `Word Count: ${report.wordCount}`,
    `Patient ID: ${patientId || report.patientId || 'Not Specified'}`,
    `Doctor: ${doctorName || report.doctorName || 'Not Specified'}`,
  ];
}

function isSectionHeader(line: string) {
  return SECTION_HEADERS.has(line.trim());
}

export function exportReportToPDF(
  report: Report,
  hospitalName = 'KMCH Hospital',
  address = 'Coimbatore, Tamil Nadu',
  doctorName = '',
  patientId = ''
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - 2 * margin;
  let yPos = 20;

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(hospitalName, pageWidth / 2, yPos, { align: 'center' });
  yPos += 7;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(address, pageWidth / 2, yPos, { align: 'center' });
  yPos += 8;

  doc.setLineWidth(0.6);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 8;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(typeLabels[report.reportType], pageWidth / 2, yPos, { align: 'center' });
  yPos += 10;

  doc.setFontSize(10);
  for (const line of getMetaLines(report, doctorName, patientId)) {
    doc.text(line, margin, yPos);
    yPos += 6;
  }

  yPos += 4;
  doc.setLineWidth(0.3);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 8;

  doc.setFontSize(11);
  const rawLines = getReportBody(report).split('\n');

  for (const rawLine of rawLines) {
    const line = rawLine || ' ';
    const wrappedLines = doc.splitTextToSize(line, contentWidth);
    const linesToRender = wrappedLines.length > 0 ? wrappedLines : [' '];

    for (const wrappedLine of linesToRender) {
      if (yPos > pageHeight - 20) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFont('helvetica', isSectionHeader(rawLine) ? 'bold' : 'normal');
      doc.text(wrappedLine, margin, yPos);
      yPos += rawLine ? 6 : 4;
    }
  }

  const pageCount = doc.internal.pages.length - 1;
  for (let pageIndex = 1; pageIndex <= pageCount; pageIndex += 1) {
    doc.setPage(pageIndex);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Page ${pageIndex} of ${pageCount}`, pageWidth / 2, pageHeight - 10, {
      align: 'center',
    });
    doc.text(
      `KMCH Hospital Voice Recording System | Generated ${format(new Date(), 'MM/dd/yyyy HH:mm')}`,
      pageWidth / 2,
      pageHeight - 15,
      { align: 'center' }
    );
  }

  return doc;
}

export async function exportReportToDOCX(report: Report, doctorName = '', patientId = '') {
  const bodyText = getReportBody(report);
  const reportParagraphs = bodyText.split('\n').map((line) => {
    if (!line.trim()) {
      return new Paragraph({ text: '' });
    }

    return new Paragraph({
      spacing: {
        after: isSectionHeader(line) ? 120 : 80,
      },
      children: [
        new TextRun({
          text: line,
          bold: isSectionHeader(line),
        }),
      ],
    });
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
            children: [new TextRun({ text: 'KMCH Hospital', bold: true, size: 30 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 220 },
            children: [new TextRun({ text: typeLabels[report.reportType], bold: true, size: 24 })],
          }),
          ...getMetaLines(report, doctorName, patientId).map(
            (line) =>
              new Paragraph({
                spacing: { after: 80 },
                children: [new TextRun({ text: line })],
              })
          ),
          new Paragraph({
            spacing: { after: 180 },
            children: [new TextRun({ text: '' })],
          }),
          ...reportParagraphs,
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
}

export function downloadReportAsPDF(report: Report, doctorName?: string, patientId?: string) {
  const doc = exportReportToPDF(report, 'KMCH Hospital', 'Coimbatore, Tamil Nadu', doctorName, patientId);
  const fileName = `kmch-report-${format(new Date(report.createdAt), 'yyyy-MM-dd-HHmm')}.pdf`;
  doc.save(fileName);
}

export async function downloadReportAsDOCX(report: Report, doctorName?: string, patientId?: string) {
  const blob = await exportReportToDOCX(report, doctorName, patientId);
  saveBlob(blob, `kmch-report-${format(new Date(report.createdAt), 'yyyy-MM-dd-HHmm')}.docx`);
}

export function downloadReportAsText(report: Report) {
  saveBlob(
    new Blob([getReportBody(report)], { type: 'text/plain;charset=utf-8' }),
    `kmch-report-${format(new Date(report.createdAt), 'yyyy-MM-dd-HHmm')}.txt`
  );
}
