
// routes/export.js - Export PDF & Excel Routes
const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const Transaction = require('../models/Transaction');
const { protect } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');
const { request } = require('http');

// Tất cả routes đều yêu cầu authentication
router.use(protect);

// @route   GET /api/export/
// @desc    Test export route
// @access  Private 
router.get('/', (req, res) => {
  res.json({ success: true, message: 'Export route OK' });
});
// @route   GET /api/export/pdf
// @desc    Xuất báo cáo PDF
// @access  Private
router.get('/pdf', async (req, res) => {
  try {
    const { startDate, endDate, type } = req.query;

    // Build query
    const query = { user: req.user.id };
    if (type) query.type = type;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    // Lấy dữ liệu
    const transactions = await Transaction.find(query).sort('-date');
    const stats = await Transaction.getStatistics(req.user.id, startDate, endDate);

    // Tạo PDF
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    // Register Vietnamese font
    const fontPathRegular = path.join(__dirname, '..', 'fonts', 'Roboto-Regular.ttf');
    const fontPathBold = path.join(__dirname, '..', 'fonts', 'Roboto-Bold.ttf');

    doc.registerFont('Roboto', fontPathRegular);
    doc.registerFont('Roboto-Bold', fontPathBold);

    doc.font('Roboto');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=bao-cao-chi-tieu-${Date.now()}.pdf`);
    doc.pipe(res);

    doc.font('Roboto-Bold').fontSize(20).text('BÁO CÁO QUẢN LÝ CHI TIÊU', { align: 'center' });
    doc.moveDown();

    doc.font('Roboto').fontSize(12).text(`Người dùng: ${req.user.name}`, { align: 'center' });
    doc.text(`Email: ${req.user.email}`, { align: 'center' });
    
    if (startDate || endDate) {
      doc.text(
        `Thời gian: ${startDate ? new Date(startDate).toLocaleDateString('vi-VN') : 'Tất cả'} - ${endDate ? new Date(endDate).toLocaleDateString('vi-VN') : 'Hiện tại'}`,
        { align: 'center' }
      );
    }
    
    doc.text(`Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}`, { align: 'center' });
    doc.moveDown(2);

    // Thống kê tổng quan
    doc.fontSize(16).text('TỔNG QUAN', { underline: true });
    doc.moveDown();

    const summaryData = [
      ['Tổng Thu Nhập:', formatMoney(stats.income)],
      ['Tổng Chi Tiêu:', formatMoney(stats.expense)],
      ['Số Dư:', formatMoney(stats.balance)],
      ['Số giao dịch:', stats.totalTransactions]
    ];

    summaryData.forEach(([label, value]) => {
      doc.fontSize(12).text(label, { continued: true }).text(value, { align: 'right' });
    });

    doc.moveDown(2);

    // Danh sách giao dịch
    doc.fontSize(16).text('CHI TIẾT GIAO DỊCH', { underline: true });
    doc.moveDown();

    // Table header
    const tableTop = doc.y;
    const colWidths = [80, 100, 150, 100, 80];
    const headers = ['Ngày', 'Loại', 'Danh mục', 'Mô tả', 'Số tiền'];

    doc.fontSize(10).fillColor('#000000');
    let x = 50;
    headers.forEach((header, i) => {
      doc.text(header, x, tableTop, { width: colWidths[i], align: 'left' });
      x += colWidths[i];
    });

    // Draw line
    doc.moveTo(50, doc.y + 5).lineTo(550, doc.y + 5).stroke();
    doc.moveDown();

    // Table rows
    transactions.slice(0, 50).forEach((transaction) => { // Giới hạn 50 giao dịch
      if (doc.y > 700) { // Tạo trang mới nếu hết chỗ
        doc.addPage();
      }

      const rowY = doc.y;
      x = 50;

      const rowData = [
        new Date(transaction.date).toLocaleDateString('vi-VN'),
        transaction.type === 'thu' ? 'Thu' : 'Chi',
        transaction.category,
        transaction.description.substring(0, 30),
        formatMoney(transaction.amount)
      ];

      rowData.forEach((data, i) => {
        doc.fontSize(9).text(data, x, rowY, { width: colWidths[i], align: 'left' });
        x += colWidths[i];
      });

      doc.moveDown(0.5);
    });

    // Footer
    doc.fontSize(8).fillColor('#666666')
      .text(
        'Báo cáo được tạo tự động từ hệ thống quản lý chi tiêu',
        50,
        doc.page.height - 50,
        { align: 'center' }
      );

    doc.end();

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi xuất PDF',
      error: error.message
    });
  }
});

// @route   GET /api/export/excel
// @desc    Xuất báo cáo Excel
// @access  Private
router.get('/excel', async (req, res) => {
  try {
    const { startDate, endDate, type } = req.query;

    // Build query
    const query = { user: req.user.id };
    if (type) query.type = type;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    // Lấy dữ liệu
    const transactions = await Transaction.find(query).sort('-date');
    const stats = await Transaction.getStatistics(req.user.id, startDate, endDate);
    const categoryStats = await Transaction.getByCategory(req.user.id, startDate, endDate);

    // Tạo workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = req.user.name;
    workbook.created = new Date();

    // Sheet 1: Tổng quan
    const summarySheet = workbook.addWorksheet('Tổng Quan');
    summarySheet.columns = [
      { header: 'Chỉ số', key: 'label', width: 30 },
      { header: 'Giá trị', key: 'value', width: 20 }
    ];

    // Style header
    summarySheet.getRow(1).font = { bold: true, size: 12 };
    summarySheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    summarySheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

    // Add data
    summarySheet.addRow({ label: 'Tổng Thu Nhập', value: stats.income });
    summarySheet.addRow({ label: 'Tổng Chi Tiêu', value: stats.expense });
    summarySheet.addRow({ label: 'Số Dư', value: stats.balance });
    summarySheet.addRow({ label: 'Tổng Giao Dịch', value: stats.totalTransactions });

    // Format currency
    summarySheet.getColumn('value').numFmt = '#,##0 "đ"';

    // Sheet 2: Chi tiết giao dịch
    const transactionSheet = workbook.addWorksheet('Chi Tiết Giao Dịch');
    transactionSheet.columns = [
      { header: 'STT', key: 'stt', width: 10 },
      { header: 'Ngày', key: 'date', width: 15 },
      { header: 'Loại', key: 'type', width: 10 },
      { header: 'Danh Mục', key: 'category', width: 20 },
      { header: 'Mô Tả', key: 'description', width: 40 },
      { header: 'Số Tiền', key: 'amount', width: 20 }
    ];

    // Style header
    transactionSheet.getRow(1).font = { bold: true, size: 12 };
    transactionSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    transactionSheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

    // Add data
    transactions.forEach((transaction, index) => {
      transactionSheet.addRow({
        stt: index + 1,
        date: new Date(transaction.date).toLocaleDateString('vi-VN'),
        type: transaction.type === 'thu' ? 'Thu' : 'Chi',
        category: transaction.category,
        description: transaction.description,
        amount: transaction.amount
      });
    });

    // Format currency
    transactionSheet.getColumn('amount').numFmt = '#,##0 "đ"';

    // Sheet 3: Thống kê theo danh mục
    const categorySheet = workbook.addWorksheet('Theo Danh Mục');
    categorySheet.columns = [
      { header: 'Danh Mục', key: 'category', width: 20 },
      { header: 'Loại', key: 'type', width: 15 },
      { header: 'Tổng Tiền', key: 'total', width: 20 },
      { header: 'Số Lượng', key: 'count', width: 15 }
    ];

    // Style header
    categorySheet.getRow(1).font = { bold: true, size: 12 };
    categorySheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    categorySheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

    // Add data
    categoryStats.forEach((stat) => {
      categorySheet.addRow({
        category: stat._id.category,
        type: stat._id.type === 'thu' ? 'Thu' : 'Chi',
        total: stat.total,
        count: stat.count
      });
    });

    // Format currency
    categorySheet.getColumn('total').numFmt = '#,##0 "đ"';

    // Set response headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=bao-cao-chi-tieu-${Date.now()}.xlsx`
    );

    // Write to response
    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi xuất Excel',
      error: error.message
    });
  }
});

// Helper function: Format money
function formatMoney(amount) {
  return new Intl.NumberFormat('vi-VN').format(amount) + ' đ';
}

module.exports = router;
