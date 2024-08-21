const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const translationSchema = new Schema({
    userId: {
        type: String,
        require: true,
    },
    originName: {
        type: String,
        require: true,
    },
    fileName: {
        type: String,
        require: true
    },
    filePath: {
        type: String
    },
    translatedFilePath: {
        type: String
    },
    fileType: {
        type: String
    },
    fileSize: {
        type: Number
    },
    toLanguage: {
        type: String,
        require: true
    },
    translated: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

module.exports = mongoose.model("Translation", translationSchema);