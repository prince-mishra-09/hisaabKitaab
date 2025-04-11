// models/DayRecord.js
const mongoose = require("mongoose");

const dayRecordSchema = new mongoose.Schema({
  date: String,
  entries: String,
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
});

module.exports = mongoose.model("DayRecord", dayRecordSchema);
