const multer = require('multer');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');

const mammoth = require('mammoth');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { Document, Packer, Paragraph } = require('docx');
const pdfParse = require('pdf-parse');
const OpenAI = require("openai");
const Translation = require('../models/Translation');
const User = require('../models/User');

require('dotenv').config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads/';

        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage }).single('file');

exports.uploadFile = async (req, res) => {
    upload(req, res, async function (err) {
        if (err) {
            return res.status(400).json({ error: 'Error uploading file' });
        }

        const userId = req.body.userId;
        const file = req.file;
        const toLanguage = req.body.toLanguage;

        if (!file || !toLanguage) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const fileData = new Translation({
            userId: userId,
            originName: file.originalname,
            fileName: file.filename,
            filePath: file.path,
            fileType: file.mimetype,
            fileSize: file.size,
            toLanguage: toLanguage,
        });

        try {
            await fileData.save();
            res.status(200).json({ message: 'File uploaded successfully' });
        } catch (error) {
            res.status(500).json({ error: 'Error saving file details to database' });
        }
    });
};

exports.getSavedData = async (req, res) => {
    const userId = req.query.userId;

    Translation
        .find({ userId: userId })
        .sort({ updatedAt: -1 })
        .then(result => {
            res.status(200).json(result);
        });
};

async function extractPdfText(pdfFilePath) {
    try {
        const dataBuffer = await fsPromises.readFile(pdfFilePath);
        const data = await pdfParse(dataBuffer);
        return data.text;
    } catch (error) {
        console.error('Error reading PDF file:', error);
        throw error;
    }
}

const regenerateDocx = async (user, originalFile, targetLanguage) => {
    try {
        const { value: text } = await mammoth.extractRawText({ path: originalFile.filePath });
        if (user.characterLimit < text.length) {
            return null;
        }

        user.characterLimit = user.characterLimit - text.length;
        await user.save();

        const translatedText = await translateText(text, targetLanguage);

        const paragraphs = translatedText.split('\n').map(line => new Paragraph(line));

        const newDoc = new Document({
            sections: [{
                properties: {},
                children: paragraphs
            }]
        });

        const translatedBuffer = await Packer.toBuffer(newDoc);

        const outputPath = path.join('outputs', originalFile.fileName + '_translated.docx');
        fs.writeFileSync(outputPath, translatedBuffer);
        return outputPath;
    } catch (error) {
        console.error('Error processing DOCX file:', error);
    }

};

function isWinAnsiEncodable(char) {
    const charCode = char.charCodeAt(0);
    return charCode <= 255;
}

function filterUnsupportedCharacters(text) {
    return Array.from(text).filter(isWinAnsiEncodable).join('');
}

async function createTranslatedPdf(translatedText, outputPath) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();

    const courierFont = await pdfDoc.embedFont(StandardFonts.Courier);

    const filteredText = filterUnsupportedCharacters(translatedText);

    const fontSize = 12;
    const { width, height } = page.getSize();
    const lines = filteredText.split('\n');
    let yCoordinate = height - 50;

    lines.forEach((line) => {
        yCoordinate -= fontSize * 1.2;
        if (yCoordinate < 50) {
            page.endPath();
            page = pdfDoc.addPage();
            yCoordinate = height - 50 - fontSize * 1.2;
        }

        page.drawText(line, {
            x: 50,
            y: yCoordinate,
            size: fontSize,
            font: courierFont,
            maxWidth: width - 100,
            lineHeight: 14,
        });
    });

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);
}

const regeneratePdf = async (originalFile, targetLanguage) => {
    try {
        const pdfText = await extractPdfText(originalFile.filePath);

        const translatedText = await translateText(pdfText, targetLanguage);

        const outputPath = path.join('outputs', originalFile.fileName + '_translated.pdf');

        await createTranslatedPdf(translatedText, outputPath);
        return outputPath;
    } catch (error) {
        console.error('Error processing PDF file:', error);
    }
};

const translateText = async (text, targetLanguage) => {
    try {
        const prompt = `Translate the following text to ${targetLanguage}: "${text}"`;

        const chatCompletion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: 'user', content: prompt }]
        });

        const translatedText = chatCompletion.choices[0].message.content;
        return translatedText;
    } catch (error) {
        console.error('Error translating text:', error);
        throw error;
    }
};

exports.translate = async (req, res) => {
    const { id, userId } = req.body;

    const data = await Translation.findOne({ _id: id });
    const user = await User.findOne({ _id: userId });

    if (!data) {
        res.status(400).json({ message: "There is no data with your id" });
    } else {
        data.translated = true;
        await data.save();
    }

    if (user.fileSizeLimit < data.fileSize) {
        res.status(500).json({ message: 'Your file size is over-limited. Please upgrade your plan.' })
    }

    try {
        const targetLanguage = data.toLanguage;

        let translatedFilePath;
        if (data.fileType.includes('word')) {
            translatedFilePath = await regenerateDocx(user, data, targetLanguage);
        } else if (data.fileType.includes('pdf')) {
            translatedFilePath = await regeneratePdf(data, targetLanguage);
        }

        if (translatedFilePath) {
            data.translatedFilePath = translatedFilePath;
            await data.save();

            res.status(200).json({ message: 'Translation succeed.' });
        } else {
            res.status(500).json({ message: 'There are more characters in your file. Please try again.' });
        }

    } catch (error) {
        res.status(500).json({ message: 'Error translating document' });
    }
};