import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { writeFileSync } from 'fs';

async function generateInvoice() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4 size
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  let y = 792;
  
  // Header
  page.drawText('INVOICE', {
    x: 50,
    y: y,
    size: 24,
    font: boldFont,
    color: rgb(0, 0, 0.5)
  });
  
  y -= 40;
  
  // Company info
  page.drawText('NCP Technologies', { x: 50, y, size: 14, font: boldFont });
  y -= 20;
  page.drawText('123 Tech Street', { x: 50, y, size: 10, font });
  y -= 15;
  page.drawText('San Francisco, CA 94105', { x: 50, y, size: 10, font });
  y -= 40;
  
  // Invoice details
  const invoiceDate = new Date().toISOString().split('T')[0];
  page.drawText(`Invoice #: INV-2024-001`, { x: 50, y, size: 12, font });
  y -= 20;
  page.drawText(`Date: ${invoiceDate}`, { x: 50, y, size: 12, font });
  y -= 20;
  page.drawText('Due Date: 2025-01-23', { x: 50, y, size: 12, font });
  y -= 40;
  
  // Bill to
  page.drawText('Bill To:', { x: 50, y, size: 12, font: boldFont });
  y -= 20;
  page.drawText('Acme Corporation', { x: 50, y, size: 10, font });
  y -= 15;
  page.drawText('456 Business Ave', { x: 50, y, size: 10, font });
  y -= 15;
  page.drawText('New York, NY 10001', { x: 50, y, size: 10, font });
  y -= 40;
  
  // Items header
  page.drawText('Description', { x: 50, y, size: 12, font: boldFont });
  page.drawText('Quantity', { x: 350, y, size: 12, font: boldFont });
  page.drawText('Amount', { x: 470, y, size: 12, font: boldFont });
  
  // Draw line under header
  y -= 5;
  page.drawLine({
    start: { x: 50, y },
    end: { x: 545, y },
    thickness: 1,
    color: rgb(0, 0, 0)
  });
  y -= 20;
  
  // Invoice items
  const items = [
    { description: 'NCP Enterprise License', quantity: 1, amount: 5000 },
    { description: 'Technical Support (Annual)', quantity: 1, amount: 2000 },
    { description: 'Training & Onboarding', quantity: 3, amount: 1500 },
    { description: 'Custom Integration', quantity: 1, amount: 3500 }
  ];
  
  items.forEach(item => {
    page.drawText(item.description, { x: 50, y, size: 10, font });
    page.drawText(item.quantity.toString(), { x: 370, y, size: 10, font });
    page.drawText(`$${item.amount.toFixed(2)}`, { x: 470, y, size: 10, font });
    y -= 20;
  });
  
  y -= 10;
  
  // Draw line before total
  page.drawLine({
    start: { x: 350, y },
    end: { x: 545, y },
    thickness: 1,
    color: rgb(0, 0, 0)
  });
  y -= 20;
  
  // Calculate total
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const tax = subtotal * 0.08; // 8% tax
  const total = subtotal + tax;
  
  // Subtotal
  page.drawText('Subtotal:', { x: 400, y, size: 10, font });
  page.drawText(`$${subtotal.toFixed(2)}`, { x: 470, y, size: 10, font });
  y -= 20;
  
  // Tax
  page.drawText('Tax (8%):', { x: 400, y, size: 10, font });
  page.drawText(`$${tax.toFixed(2)}`, { x: 470, y, size: 10, font });
  y -= 20;
  
  // Draw line before total
  page.drawLine({
    start: { x: 400, y },
    end: { x: 545, y },
    thickness: 2,
    color: rgb(0, 0, 0)
  });
  y -= 20;
  
  // Total
  page.drawText('Total:', { x: 400, y, size: 12, font: boldFont });
  page.drawText(`$${total.toFixed(2)}`, { x: 470, y, size: 12, font: boldFont });
  
  // Payment terms at bottom
  y = 100;
  page.drawText('Payment Terms:', { x: 50, y, size: 10, font: boldFont });
  y -= 15;
  page.drawText('Payment due within 30 days', { x: 50, y, size: 9, font });
  y -= 12;
  page.drawText('Make checks payable to: NCP Technologies', { x: 50, y, size: 9, font });
  y -= 12;
  page.drawText('Wire transfer details available upon request', { x: 50, y, size: 9, font });
  
  // Thank you message
  y -= 30;
  page.drawText('Thank you for your business!', {
    x: 50,
    y,
    size: 10,
    font: boldFont,
    color: rgb(0, 0.53, 0.71)
  });
  
  return await pdfDoc.save();
}

console.log('Generating invoice PDF...');
const pdfBytes = await generateInvoice();
console.log(`✅ Generated PDF (${pdfBytes.length} bytes)`);

writeFileSync('/tmp/ncp-invoice.pdf', pdfBytes);
console.log('✅ Saved to: /tmp/ncp-invoice.pdf');
console.log('\n📄 Open the PDF with: open /tmp/ncp-invoice.pdf');
