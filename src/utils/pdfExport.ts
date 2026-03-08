import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { Report, ReportType } from '@/lib/db';

const typeLabels: Record<ReportType, string> = {
  general: 'General Clinical Note',
  soap: 'SOAP Notes',
  diagnostic: 'Surgical Pathology Report',
};

export function exportReportToPDF(
  report: Report,
  hospitalName = 'PSG Hospital',
  address = 'Peelamedu, Coimbatore - 641004',
  doctorName = '',
  patientId = ''
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - 2 * margin;
  let yPos = 20;

  // Hospital Header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(hospitalName, pageWidth / 2, yPos, { align: 'center' });
  yPos += 7;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(address, pageWidth / 2, yPos, { align: 'center' });
  yPos += 5;
  doc.text('Phone: +91-422-2570170 | Email: info@psghospital.org', pageWidth / 2, yPos, { align: 'center' });
  yPos += 10;

  // Horizontal line
  doc.setLineWidth(0.8);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 8;

  // Report Title
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(typeLabels[report.reportType], pageWidth / 2, yPos, { align: 'center' });
  yPos += 10;

  // Patient & Doctor Info Box
  doc.setDrawColor(200);
  doc.setLineWidth(0.3);
  doc.rect(margin, yPos, contentWidth, 28);
  
  doc.setFontSize(10);
  
  // Left column - Patient Info
  doc.setFont('helvetica', 'bold');
  doc.text('Patient ID:', margin + 5, yPos + 8);
  doc.setFont('helvetica', 'normal');
  doc.text(patientId || report.patientId || 'Not Specified', margin + 35, yPos + 8);
  
  doc.setFont('helvetica', 'bold');
  doc.text('Date:', margin + 5, yPos + 16);
  doc.setFont('helvetica', 'normal');
  doc.text(format(new Date(report.createdAt), 'MMMM d, yyyy h:mm a'), margin + 35, yPos + 16);
  
  doc.setFont('helvetica', 'bold');
  doc.text('Report Type:', margin + 5, yPos + 24);
  doc.setFont('helvetica', 'normal');
  doc.text(typeLabels[report.reportType], margin + 35, yPos + 24);
  
  // Right column - Doctor Info
  doc.setFont('helvetica', 'bold');
  doc.text('Attending Physician:', pageWidth / 2 + 5, yPos + 8);
  doc.setFont('helvetica', 'normal');
  doc.text(doctorName || report.doctorName || 'Not Specified', pageWidth / 2 + 50, yPos + 8);
  
  doc.setFont('helvetica', 'bold');
  doc.text('Duration:', pageWidth / 2 + 5, yPos + 16);
  doc.setFont('helvetica', 'normal');
  doc.text(`${Math.floor(report.duration / 60)}:${(report.duration % 60).toString().padStart(2, '0')}`, pageWidth / 2 + 50, yPos + 16);
  
  doc.setFont('helvetica', 'bold');
  doc.text('Word Count:', pageWidth / 2 + 5, yPos + 24);
  doc.setFont('helvetica', 'normal');
  doc.text(String(report.wordCount), pageWidth / 2 + 50, yPos + 24);
  
  yPos += 35;

  // Report content
  doc.setFontSize(11);
  const lines = doc.splitTextToSize(report.reportContent, contentWidth);
  
  lines.forEach((line: string) => {
    if (yPos > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      yPos = 20;
    }
    
    // Check if line is a section header (all caps or specific patterns)
    const isHeader = (line.trim() === line.trim().toUpperCase() && line.trim().length > 3 && !line.includes('-')) || 
                     /^[A-Z][A-Za-z\s()/]+:?$/.test(line.trim());
    
    if (isHeader && line.trim().length > 0) {
      doc.setFont('helvetica', 'bold');
      yPos += 4;
    } else {
      doc.setFont('helvetica', 'normal');
    }
    
    doc.text(line, margin, yPos);
    yPos += 6;
  });

  // Signature area
  yPos += 15;
  if (yPos > doc.internal.pageSize.getHeight() - 50) {
    doc.addPage();
    yPos = 30;
  }
  
  doc.setLineWidth(0.3);
  doc.line(pageWidth - margin - 60, yPos, pageWidth - margin, yPos);
  yPos += 5;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Physician Signature', pageWidth - margin - 30, yPos, { align: 'center' });
  yPos += 8;
  if (doctorName || report.doctorName) {
    doc.setFont('helvetica', 'bold');
    doc.text(doctorName || report.doctorName || '', pageWidth - margin - 30, yPos, { align: 'center' });
  }

  // Footer
  const pageCount = doc.internal.pages.length - 1;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
    doc.text(
      `PSG Hospital - MediVoice Report • Generated on ${format(new Date(), 'MM/dd/yyyy HH:mm')}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 15,
      { align: 'center' }
    );
  }

  return doc;
}

export function downloadReportAsPDF(report: Report, doctorName?: string, patientId?: string) {
  const doc = exportReportToPDF(report, 'PSG Hospital', 'Peelamedu, Coimbatore - 641004', doctorName, patientId);
  const fileName = `psg-hospital-report-${format(new Date(report.createdAt), 'yyyy-MM-dd-HHmm')}.pdf`;
  doc.save(fileName);
}
