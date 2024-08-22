const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const ResetCode = require('../models/ResetCode');
const nodemailer = require('nodemailer');

require('dotenv').config();

const appEmail = process.env.APP_EMAIL;
const appPassword = process.env.APP_PASSWORD;

const generateToken = (user) => {
    return jwt.sign({ id: user._id }, 'secret', { expiresIn: '1h' });
};

exports.register = async (req, res) => {
    const { firstName, lastName, email, password } = req.body;

    const validUser = await User.find({ email: email });

    if (validUser.length) {
        res.status(500).json({ message: 'This email is already in use.' })
    }

    const newUser = new User({
        firstName: firstName,
        lastName: lastName,
        email: email,
        password: password,
    });

    await newUser.save();

    const token = generateToken(newUser);

    const url = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: appEmail,
            pass: appPassword
        }
    });

    const mailOptions = {
        from: appEmail,
        to: email,
        subject: 'Verify your email',
        html: `<p>Click <a href="${url}">here</a> to verify your email.</p>`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error sending email:', error);
        } else {
            console.log('Email sent:', info.response);
        }
    });

    res.status(200).json({ message: 'User registered. Please check your email to verify your account.' });

}

exports.verify = async (req, res) => {
    const verifyUser = async (id) => {
        const user = await User.findById(id);

        if (user) {
            user.isVerified = true;
            await user.save();

            return true;
        }
        return false;
    }
    try {
        const token = req.query.token;
        const decoded = jwt.verify(token, 'secret');
        const userId = decoded.id;

        const isValidUser = await verifyUser(userId);

        if (isValidUser) {
            res.status(200).json({ message: 'Email verified.' });
        }
    } catch (error) {
        console.error('Email verification error:', error);
        res.status(400).send('Invalid or expired token.');
    }
}

exports.login = async (req, res) => {
    const { email, password } = req.body;

    try {
        const validUser = await User.findOne({ email: email });

        if (!validUser) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        if (!validUser.isVerified) {
            return res.status(500).json({ message: "You must verify your email." });
        }

        const isMatch = await bcrypt.compare(password, validUser.password);

        if (!isMatch) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        const token = generateToken(validUser);
        res.status(200).json({ token: token });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

exports.getUser = async (req, res) => {
    const id = req.params.id;

    const user = await User.findOne({ _id: id });

    if (user) {
        res.status(200).json(user);
    } else {
        res.status(400).json({ message: 'There is no user with current id.' });
    }
}

exports.deActiveUser = async (req, res) => {
    try {
        const userId = req.params.id;

        const deletedUser = await User.findByIdAndDelete(userId);

        if (!deletedUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json({ message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error });
    }
}

exports.generateCode = async (req, res) => {
    const { email } = req.body;

    const generateSixDigitCode = () => {
        const min = 100000;
        const max = 999999;
        return Math.floor(Math.random() * (max - min + 1)) + min;
    };

    const code = generateSixDigitCode().toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await ResetCode.findOneAndUpdate(
        { email },
        { code, expiresAt },
        { upsert: true }
    );

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: appEmail,
            pass: appPassword
        }
    });

    const mailOptions = {
        from: appEmail,
        to: email,
        subject: 'Password Reset Code',
        text: `Your password reset code is: ${code}`
    };

    try {
        await transporter.sendMail(mailOptions);
        res.status(200).send('Reset code sent to email');
    } catch (error) {
        res.status(500).send('Error sending email');
    }
}

exports.verifyCode = async (req, res) => {
    const { email, code } = req.body;

    try {
        const data = await ResetCode.findOne({ email: email, code: code });

        if (!data) {
            return res.status(404).json({ message: "No matching reset code found." });
        }

        const currentDate = new Date();
        if (data.expiresAt < currentDate) {
            return res.status(400).json({ message: "Reset code has expired." });
        }

        res.status(200).json({ message: 'Verify succeed.' })

    } catch (error) {
        console.error("Error finding reset code:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
}

exports.resetPassword = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required." });
    }

    try {
        const user = await User.findOne({ email: email });
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        user.password = password;
        await user.save();

        return res.status(200).json({ message: "Password updated successfully." });
    } catch (error) {
        console.error("Error updating password:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};