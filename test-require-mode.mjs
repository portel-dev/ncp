import { NCPOrchestrator } from './dist/orchestrator/ncp-orchestrator.js';

async function test() {
  console.log('Testing require() in code mode...\n');
  
  const orchestrator = new NCPOrchestrator('all');
  await orchestrator.initialize();
  
  // Test 1: Simple require() test
  const code1 = `
const { PDFDocument } = require('pdf-lib');
return { success: true, hasPDFDocument: typeof PDFDocument === 'function' };
`;
  
  try {
    const result1 = await orchestrator.executeCode(code1);
    console.log('✅ Test 1 - Basic require():', JSON.stringify(result1, null, 2));
  } catch (error) {
    console.log('❌ Test 1 failed:', error.message);
  }
  
  // Test 2: Create actual PDF
  const code2 = `
const { PDFDocument, rgb } = require('pdf-lib');

const pdfDoc = await PDFDocument.create();
const page = pdfDoc.addPage([600, 400]);
page.drawText('Hello from NCP Code Mode!', {
  x: 50,
  y: 350,
  size: 30,
  color: rgb(0, 0, 0)
});

const pdfBytes = await pdfDoc.save();
return {
  success: true,
  size: pdfBytes.length,
  preview: Array.from(pdfBytes).slice(0, 20)
};
`;
  
  try {
    const result2 = await orchestrator.executeCode(code2);
    console.log('\n✅ Test 2 - Create PDF:', JSON.stringify(result2, null, 2));
  } catch (error) {
    console.log('\n❌ Test 2 failed:', error.message);
  }
  
  await orchestrator.shutdown();
  console.log('\n🎉 All tests complete!');
}

test().catch(console.error);
