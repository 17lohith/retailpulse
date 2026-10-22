import iconv from 'iconv-lite';
import ExcelJS from 'exceljs';

export const cleanSales = () => Buffer.from(['Date,Item Name,Item Code,Quantity,Sale Amount',
  '01/09/2026,Amul Milk 500 ml,MILK1,10,300', '01/09/2026,Parle-G 200 g,BISC1,5,100', '02/09/2026,Amul Milk 500 ml,MILK1,12,360', '02/09/2026,Parle-G 200 g,BISC1,4,80'].join('\n'));

/** title rows, header on row 4, totals row, bad date, negative qty (return), zero qty, unknown item, rupee symbol + Latin-1 */
export const messySales = () => iconv.encode(['My Store - Item wise sales report', 'Printed on 05/09/2026', '',
  'Date,Item Name,Qty,Amount',
  '01/09/2026,Amul Milk 500 ml,"1,000",Rs. 30000', '13/09/2026,Parle-G 200 g,5,"₹ 100.50"', '31/02/2026,Parle-G 200 g,5,100', '03/09/2026,Parle-G 200 g,-2,-40',
  '03/09/2026,Amul Milk 500 ml,0,0', '04/09/2026,Mystery Biscuit XL,7,70', '05/09/2026,Amul Milk 500 ml,abc,10', ',Amul Milk 500 ml,3,90', 'Total,,1017,30170'].join('\r\n'), 'latin1');

export const billTotals = () => Buffer.from(['Bill No,Date,Customer,Total', '1,01/09/2026,A,300', '2,01/09/2026,B,120'].join('\n'));
export const ambiguousDates = () => Buffer.from(['Date,Item Name,Quantity', '03/04/2026,Amul Milk 500 ml,3', '04/05/2026,Amul Milk 500 ml,4', '05/06/2026,Amul Milk 500 ml,5'].join('\n'));
export const pdfBytes = () => Buffer.from('%PDF-1.4 fake');
export const xlsBytes = () => Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
export const stockFile = () => Buffer.from(['Item Name,Item Code,Closing Stock', 'Amul Milk 500 ml,MILK1,36', 'Parle-G 200 g,BISC1,60'].join('\n'));
export const productsFile = () => Buffer.from(['Item Name,Item Code,Barcode,Category,MRP,Cost Price', 'Tata Salt 1 kg,SALT1,8901234567890,GROCERY,28,22', 'Amul Milk 500 ml,MILK1,,DAIRY,31,27'].join('\n'));
export async function salesXlsx() {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Sales');
  ws.addRow(['Sales Report']); ws.addRow([]); ws.addRow(['Date', 'Product', 'Qty Sold', 'Net Amount']);
  ws.addRow([new Date(Date.UTC(2026, 8, 1)), 'Amul Milk 500 ml', 8, 240]); ws.addRow([new Date(Date.UTC(2026, 8, 2)), 'Parle-G 200 g', 6, 120]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** UTF-8 with BOM and the rupee sign, Indian lakh-style grouping */
export const utf8Rupee = () => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Date,Item Name,Quantity,Amount\n01/09/2026,Amul Milk 500 ml,"1,00,000","₹ 12,34,567.50"\n', 'utf8')]);
