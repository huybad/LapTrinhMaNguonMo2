// models/Transaction.js - Transaction Model với MongoDB
const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['thu', 'chi'],
    required: [true, 'Vui lòng chọn loại giao dịch']
  },
  category: {
    type: String,
    required: [true, 'Vui lòng chọn danh mục'],
    trim: true
  },
  amount: {
    type: Number,
    required: [true, 'Vui lòng nhập số tiền'],
    min: [0, 'Số tiền phải lớn hơn 0']
  },
  description: {
    type: String,
    required: [true, 'Vui lòng nhập mô tả'],
    trim: true,
    maxlength: [200, 'Mô tả không được quá 200 ký tự']
  },
  date: {
    type: Date,
    required: [true, 'Vui lòng chọn ngày'],
    default: Date.now
  },
  tags: [{
    type: String,
    trim: true
  }],
  attachments: [{
    filename: String,
    url: String
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Middleware cập nhật updatedAt
transactionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index để tăng hiệu suất tìm kiếm
transactionSchema.index({ user: 1, date: -1 });
transactionSchema.index({ user: 1, type: 1 });
transactionSchema.index({ user: 1, category: 1 });

// Static method: Lấy thống kê của user
transactionSchema.statics.getStatistics = async function(userId, startDate, endDate) {
  const match = { user: new mongoose.Types.ObjectId(userId) };
  
  if (startDate && endDate) {
    match.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }
  
  const stats = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$type',
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);
  
  const income = stats.find(s => s._id === 'thu')?.total || 0;
  const expense = stats.find(s => s._id === 'chi')?.total || 0;
  
  return {
    income,
    expense,
    balance: income - expense,
    totalTransactions: stats.reduce((sum, s) => sum + s.count, 0)
  };
};

// Static method: Thống kê theo category
transactionSchema.statics.getByCategory = async function(userId, startDate, endDate) {
  const match = { user: new mongoose.Types.ObjectId(userId) };
  
  if (startDate && endDate) {
    match.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }
  
  return await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: { category: '$category', type: '$type' },
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { total: -1 }
    }
  ]);
};

// Static method: Thống kê theo tháng
transactionSchema.statics.getByMonth = async function(userId, year) {
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31, 23, 59, 59);
  
  return await this.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        date: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          month: { $month: '$date' },
          type: '$type'
        },
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { '_id.month': 1 }
    }
  ]);
};

module.exports = mongoose.model('Transaction', transactionSchema);
