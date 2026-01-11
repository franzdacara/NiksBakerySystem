import React, { useEffect, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BakeryStore, ShiftReport } from '../models/BakeryStore';

interface ShiftReportsPanelProps {
    store: BakeryStore;
}

export const ShiftReportsPanel: React.FC<ShiftReportsPanelProps> = ({ store }) => {
    const [reports, setReports] = useState<ShiftReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedReport, setSelectedReport] = useState<ShiftReport | null>(null);

    useEffect(() => {
        loadReports();
    }, []);

    const loadReports = async () => {
        setLoading(true);
        const data = await store.getShiftReports(50);
        setReports(data);
        setLoading(false);
    };

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString('en-PH', {
            timeZone: 'Asia/Manila',
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const formatTime = (timestamp: number) => {
        return new Date(timestamp).toLocaleTimeString('en-PH', {
            timeZone: 'Asia/Manila',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    const generatePDF = (report: ShiftReport) => {
        const doc = new jsPDF();
        const { items } = store;

        // Header
        doc.setFontSize(24);
        doc.setFont('helvetica', 'bold');
        doc.text("Nik's Bakery", 105, 20, { align: 'center' });

        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.text('Shift Report', 105, 28, { align: 'center' });

        // Shift Info Box
        doc.setFontSize(10);
        doc.setDrawColor(200, 200, 200);
        doc.setFillColor(250, 250, 250);
        doc.roundedRect(14, 35, 182, 30, 3, 3, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.text('Staff:', 20, 45);
        doc.text('Date:', 20, 53);
        doc.text('Shift Time:', 20, 61);

        doc.setFont('helvetica', 'normal');
        doc.text(report.userDisplayName || 'Unknown', 40, 45);
        doc.text(formatDate(report.startTime), 40, 53);
        doc.text(`${formatTime(report.startTime)} - ${formatTime(report.endTime)}`, 50, 61);

        // Inventory Table
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Inventory Summary', 14, 78);

        const tableData = items
            .filter(item => {
                const start = report.inventoryStart[item.id] || 0;
                const end = report.inventoryEnd[item.id] || 0;
                return start > 0 || end > 0;
            })
            .map(item => {
                const start = report.inventoryStart[item.id] || 0;
                const end = report.inventoryEnd[item.id] || 0;
                const sold = Math.max(0, start - end);
                return [
                    item.name,
                    start.toString(),
                    end.toString(),
                    sold.toString(),
                    `P${(sold * item.sellingPrice).toFixed(2)}`
                ];
            });

        autoTable(doc, {
            startY: 83,
            head: [['Item', 'Beginning', 'Ending', 'Sold', 'Amount']],
            body: tableData,
            theme: 'grid',
            styles: { fontSize: 9, cellPadding: 3 },
            headStyles: {
                fillColor: [120, 80, 40],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
            },
            columnStyles: {
                0: { cellWidth: 60 },
                1: { cellWidth: 25, halign: 'center' },
                2: { cellWidth: 25, halign: 'center' },
                3: { cellWidth: 25, halign: 'center' },
                4: { cellWidth: 35, halign: 'right' },
            },
        });

        const finalY = (doc as any).lastAutoTable.finalY + 10;

        // Summary Section
        doc.setFillColor(250, 250, 245);
        doc.roundedRect(14, finalY, 182, 35, 3, 3, 'F');

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Summary', 20, finalY + 10);

        doc.setDrawColor(200, 200, 200);
        doc.line(20, finalY + 13, 190, finalY + 13);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Total Items Sold:', 20, finalY + 22);
        doc.text('Total Production:', 20, finalY + 30);

        doc.setFont('helvetica', 'bold');
        doc.text(`${report.totalSoldQty} units`, 60, finalY + 22);
        doc.text(`${report.totalProduction} units`, 60, finalY + 30);

        doc.setFont('helvetica', 'normal');
        doc.text('Total Sales:', 120, finalY + 22);
        doc.text('Discharges (BO):', 120, finalY + 30);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 128, 0);
        doc.text(`P${report.totalSales.toFixed(2)}`, 160, finalY + 22);
        doc.setTextColor(200, 100, 0);
        doc.text(`${report.totalDischarges} units`, 160, finalY + 30);

        // Footer
        doc.setTextColor(150, 150, 150);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        const pageHeight = doc.internal.pageSize.height;
        doc.text(`Generated on ${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}`, 105, pageHeight - 10, { align: 'center' });

        // Save
        const fileName = `ShiftReport_${report.userDisplayName || 'Unknown'}_${formatDate(report.startTime).replace(/\s/g, '')}.pdf`;
        doc.save(fileName);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <i className="fas fa-spinner fa-spin text-4xl text-amber-700"></i>
            </div>
        );
    }

    return (
        <div className="animate-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-stone-200 bg-stone-50">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-bold text-stone-800 flex items-center">
                                <i className="fas fa-file-alt mr-3 text-amber-700"></i>
                                Shift Reports History
                            </h3>
                            <p className="text-xs text-stone-500 mt-1">View and download past shift reports</p>
                        </div>
                        <button
                            onClick={loadReports}
                            className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-lg transition flex items-center"
                        >
                            <i className="fas fa-sync-alt mr-2"></i>
                            Refresh
                        </button>
                    </div>
                </div>

                {/* Reports List */}
                <div className="divide-y divide-stone-100">
                    {reports.length === 0 ? (
                        <div className="p-12 text-center text-stone-400">
                            <i className="fas fa-inbox text-4xl mb-3 opacity-30"></i>
                            <p>No shift reports found.</p>
                        </div>
                    ) : (
                        reports.map((report) => (
                            <div
                                key={report.id}
                                className="p-4 hover:bg-stone-50 transition cursor-pointer"
                                onClick={() => setSelectedReport(selectedReport?.id === report.id ? null : report)}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-4">
                                        <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                                            <i className="fas fa-user text-amber-700"></i>
                                        </div>
                                        <div>
                                            <p className="font-bold text-stone-800">
                                                {report.userDisplayName || 'Unknown User'}
                                            </p>
                                            <p className="text-sm text-stone-500">
                                                {formatDate(report.startTime)} • {formatTime(report.startTime)} - {formatTime(report.endTime)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-6">
                                        <div className="text-right">
                                            <p className="text-xs text-stone-400 uppercase tracking-wider">Sales</p>
                                            <p className="font-bold text-green-700">₱{report.totalSales.toFixed(2)}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-stone-400 uppercase tracking-wider">Sold</p>
                                            <p className="font-bold text-stone-700">{report.totalSoldQty} qty</p>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                generatePDF(report);
                                            }}
                                            className="px-3 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-lg transition flex items-center"
                                        >
                                            <i className="fas fa-download mr-2"></i>
                                            PDF
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded Details */}
                                {selectedReport?.id === report.id && (
                                    <div className="mt-4 pt-4 border-t border-stone-200 animate-in slide-in-from-top-2 duration-300">
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                            <div className="bg-stone-50 p-3 rounded-lg">
                                                <p className="text-xs text-stone-400 uppercase">Production</p>
                                                <p className="font-bold text-stone-700">{report.totalProduction} units</p>
                                            </div>
                                            <div className="bg-stone-50 p-3 rounded-lg">
                                                <p className="text-xs text-stone-400 uppercase">Sold</p>
                                                <p className="font-bold text-stone-700">{report.totalSoldQty} units</p>
                                            </div>
                                            <div className="bg-stone-50 p-3 rounded-lg">
                                                <p className="text-xs text-stone-400 uppercase">Discharges (BO)</p>
                                                <p className="font-bold text-orange-600">{report.totalDischarges} units</p>
                                            </div>
                                            <div className="bg-green-50 p-3 rounded-lg">
                                                <p className="text-xs text-green-600 uppercase">Total Sales</p>
                                                <p className="font-bold text-green-700">₱{report.totalSales.toFixed(2)}</p>
                                            </div>
                                        </div>

                                        <div className="text-xs text-stone-400">
                                            Shift ID: {report.shiftId}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};
