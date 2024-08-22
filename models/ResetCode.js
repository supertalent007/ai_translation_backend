const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const resetCodeSchema = Schema({
    email: String,
    code: String,
    expiresAt: Date
});

module.exports = mongoose.model("ResetCode", resetCodeSchema);