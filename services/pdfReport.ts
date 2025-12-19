import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BakeryStore } from '../src/models/BakeryStore';

export const generateShiftReport = (store: BakeryStore) => {
    const doc = new jsPDF();
    const { shift, items, inventorySheetData, totalRevenue, totalCost } = store;
    
    const shiftDate = shift.startTime ? new Date(shift.startTime) : new Date();
    const dateStr = shiftDate.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    const timeStart = shift.startTime ? new Date(shift.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A';
    const timeEnd = shift.endTime ? new Date(shift.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Header
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text("Nik's Bakery", 105, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('Daily Shift Report', 105, 28, { align: 'center' });
    
    // Shift Info Box
    doc.setFontSize(10);
    doc.setDrawColor(200, 200, 200);
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(14, 35, 182, 25, 3, 3, 'FD');
    
    doc.setFont('helvetica', 'bold');
    doc.text('Date:', 20, 43);
    doc.text('Shift Time:', 20, 51);
    doc.text('Shift ID:', 120, 43);
    
    doc.setFont('helvetica', 'normal');
    doc.text(dateStr, 35, 43);
    doc.text(`${timeStart} - ${timeEnd}`, 45, 51);
    doc.text(shift.id, 140, 43);

    // Inventory Table
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Inventory Summary', 14, 70);

    const tableData = inventorySheetData.map(row => [
        row.item.name,
        row.item.category,
        row.beg.toString(),
        row.prod.toString(),
        row.total.toString(),
        (row.end !== undefined ? row.end : 0).toString(),
        row.sold.toString(),
        `₱${row.item.sellingPrice.toFixed(2)}`,
        `₱${row.amount.toFixed(2)}`
    ]);

    autoTable(doc, {
        startY: 75,
        head: [['Item', 'Category', 'Beg', 'Prod', 'Total', 'End', 'Sold', 'Price', 'Amount']],
        body: tableData,
        theme: 'grid',
        styles: {
            fontSize: 8,
            cellPadding: 2,
        },
        headStyles: {
            fillColor: [120, 80, 40],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
        },
        columnStyles: {
            0: { cellWidth: 35 },
            1: { cellWidth: 20 },
            2: { cellWidth: 12, halign: 'center' },
            3: { cellWidth: 12, halign: 'center' },
            4: { cellWidth: 12, halign: 'center' },
            5: { cellWidth: 12, halign: 'center' },
            6: { cellWidth: 12, halign: 'center' },
            7: { cellWidth: 20, halign: 'right' },
            8: { cellWidth: 25, halign: 'right' },
        },
        alternateRowStyles: {
            fillColor: [252, 250, 245],
        },
    });

    // Get final Y position after table
    const finalY = (doc as any).lastAutoTable.finalY + 10;

    // Summary Section
    doc.setFillColor(250, 250, 245);
    doc.roundedRect(14, finalY, 182, 40, 3, 3, 'F');
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary', 20, finalY + 10);
    
    doc.setDrawColor(200, 200, 200);
    doc.line(20, finalY + 13, 190, finalY + 13);
    
    doc.setFontSize(10);
    const totalSold = inventorySheetData.reduce((acc, r) => acc + r.sold, 0);
    
    // Left column
    doc.setFont('helvetica', 'normal');
    doc.text('Total Items Sold:', 20, finalY + 22);
    doc.text('Production Cost:', 20, finalY + 30);
    
    doc.setFont('helvetica', 'bold');
    doc.text(`${totalSold} units`, 60, finalY + 22);
    doc.text(`₱${totalCost.toFixed(2)}`, 60, finalY + 30);
    
    // Right column
    doc.setFont('helvetica', 'normal');
    doc.text('Total Revenue:', 120, finalY + 22);
    doc.text('Estimated Profit:', 120, finalY + 30);
    
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 128, 0);
    doc.text(`₱${totalRevenue.toFixed(2)}`, 160, finalY + 22);
    doc.setTextColor(0, 100, 0);
    doc.text(`₱${(totalRevenue - totalCost).toFixed(2)}`, 160, finalY + 30);
    
    // Reset text color
    doc.setTextColor(0, 0, 0);

    // Production Details (if any)
    if (shift.production.length > 0) {
        const prodY = finalY + 50;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Production Log', 14, prodY);

        const prodData = shift.production.map(p => {
            const item = items.find(i => i.id === p.itemId);
            return [
                item?.name || 'Unknown',
                p.quantity.toString(),
                new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            ];
        });

        autoTable(doc, {
            startY: prodY + 5,
            head: [['Item', 'Quantity', 'Time']],
            body: prodData,
            theme: 'striped',
            styles: {
                fontSize: 8,
                cellPadding: 2,
            },
            headStyles: {
                fillColor: [180, 130, 70],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
            },
        });
    }

    // Footer
    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(150, 150, 150);
    doc.text(`Generated on ${new Date().toLocaleString()}`, 105, pageHeight - 10, { align: 'center' });
    doc.text("Nik's Bakery System", 105, pageHeight - 5, { align: 'center' });

    // Generate filename with date and time
    const fileName = `NiksBakery_ShiftReport_${shiftDate.toISOString().split('T')[0]}_${timeEnd.replace(':', '')}.pdf`;
    
    // Download the PDF
    doc.save(fileName);
};
