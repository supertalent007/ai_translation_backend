const Stripe = require("stripe");
const User = require('../models/User');

require('dotenv').config();

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

exports.createProduct = async (req, res) => {
    try {
        const product = await stripe.products.create({
            name: 'Monthly Subscription',
        });

        const price = await stripe.prices.create({
            unit_amount: 1000,
            currency: 'usd',
            recurring: { interval: 'month' },
            product: product.id,
        });

        res.json({ product, price });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

exports.createCheckoutSession = async (req, res) => {
    const { id } = req.body;

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: req.body.items.map(item => ({
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: item.name,
                    },
                    recurring: {
                        interval: 'month',
                    },
                    unit_amount: Math.ceil(item.price * 100),
                },
                quantity: item.quantity,
            })),
            mode: 'subscription',
            success_url: `http://localhost:3000/translations`,
            cancel_url: `http://localhost:3000/translations`,
        });

        const user = await User.findById(id);

        if (!user) {
            throw new Error('User not found');
        }

        const subscriptionData = {
            stripeSubscriptionId: session.id || "",
            status: "active",
            priceId: req.body.items[0].price,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(new Date().setMonth(new Date().getMonth() + 1)),
        };

        user.subscriptions.push(subscriptionData);
        await user.save();

        res.json({ id: session.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getUserSubscriptions = async (userId) => {
    try {
        const user = await User.findById(userId).select('subscriptions');
        return user.subscriptions;
    } catch (error) {
        throw new Error('Could not fetch subscriptions');
    }
};

const getLastUserSubscription = async (userId) => {
    try {
        const user = await User.findById(userId).select('subscriptions');

        if (!user) {
            throw new Error('User not found');
        }

        const subscriptions = user.subscriptions;

        if (subscriptions.length === 0) {
            return null;
        }

        return subscriptions[subscriptions.length - 1];
    } catch (error) {
        throw new Error('Could not fetch the last subscription: ' + error.message);
    }
}

exports.getSubscriptions = async (req, res) => {
    try {
        const subscription = await getUserSubscriptions(req.params.userId);
        res.json(subscription);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

exports.getCurrentSubscription = async (req, res) => {
    try {
        const subscription = await getLastUserSubscription(req.params.userId);
        res.json(subscription);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}