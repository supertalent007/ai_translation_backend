const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

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

    res.status(200).json({ token: token });

}

exports.login = async (req, res) => {
    const { email, password } = req.body;

    try {
        const validUser = await User.findOne({ email: email });

        if (!validUser) {
            return res.status(401).json({ message: "Invalid email or password" });
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