import { Hono } from 'hono';
import { z } from 'zod';
import Stripe from 'stripe';

type Bindings = {
    STRIPE_SECRET_KEY: string;
}

const app = new Hono<{ Bindings: Bindings }>();

// Middleware to set CORS headers
app.use('*', async (c, next) => {
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type');
    if (c.req.method === 'OPTIONS') {
        return c.text('', 204);
    }
    await next();
});

app.get("/", (c) => c.text("Hello world, this is Hono!!"));

const checkoutSessionSchema = z.object({
    priceId: z.string(),
    CustomerStripeId: z.string(),
    userId: z.string(),
    baseUrl: z.string(),
});

const billingPortalSessionSchema = z.object({
    CustomerStripeId: z.string(),
    returnUrl: z.string(),
});

const createStripeUserSchema = z.object({
    email: z.string(),
    name: z.string(),
    userId: z.string(),
});

// Function to create a Stripe Checkout session using Stripe SDK
async function createCheckoutSession(priceId: string, CustomerStripeId: string, userId: string, baseUrl: string, stripeSecretKey: string) {
    const stripe = new Stripe(stripeSecretKey);
    const session = await stripe.checkout.sessions.create({
        customer: CustomerStripeId,
        payment_method_types: ['card'],
        line_items: [
            {
                price: priceId,
                quantity: 1,
            },
        ],
        mode: 'subscription',
        success_url: `${baseUrl}/subscription-success`,
        cancel_url: `${baseUrl}/subscription-fail`,
        metadata: {
            priceId,
            userId,
        },
    });

    return session;
}

// Function to create a Stripe Billing Portal session using Stripe SDK
async function createBillingPortalSession(CustomerStripeId: string, returnUrl: string, stripeSecretKey: string) {
    const stripe = new Stripe(stripeSecretKey);
    const session = await stripe.billingPortal.sessions.create({
        customer: CustomerStripeId,
        return_url: returnUrl,
    });

    return session;
}

async function createStripeUser(email: string, name: string, userId: string, stripeSecretKey: string) {
    const stripe = new Stripe(stripeSecretKey);
    console.log("Creating a stripe customer")
    const customer = await stripe.customers.create({
        email: email,
        name: name,
        metadata: {
            userId: userId
        }
    });

    return customer.id;
}

// Route to handle the POST request for creating a Checkout session
app.post('/create-checkout-session', async (c) => {

    const requestBody = await c.req.json();
    console.log('Request body:', requestBody);

    const result = checkoutSessionSchema.safeParse(await c.req.json());

    if (!result.success) {
        return c.json({ error: 'Invalid request data' }, 400);
    }

    const { priceId, CustomerStripeId, userId, baseUrl } = result.data;

    try {
        const session = await createCheckoutSession(priceId, CustomerStripeId, userId, baseUrl, c.env.STRIPE_SECRET_KEY);
        return c.json(session);
    } catch (error) {
        console.log(error);
        return c.json({ error: 'Failed to create checkout session' }, 500);
    }
});

// Route to handle the POST request for creating a Billing Portal session
app.post('/create-billing-portal-session', async (c) => {
    const result = billingPortalSessionSchema.safeParse(await c.req.json());

    if (!result.success) {
        return c.json({ error: 'Invalid request data' }, 400);
    }

    const { CustomerStripeId, returnUrl } = result.data;

    try {
        const session = await createBillingPortalSession(CustomerStripeId, returnUrl, c.env.STRIPE_SECRET_KEY);
        return c.json(session);
    } catch (error) {
        console.log(error);
        return c.json({ error: 'Failed to create billing portal session' }, 500);
    }
});

// Route to handle the POST request for creating a Stripe user
app.post('/create-stripe-user', async (c) => {
    console.log('Creating stripe user')
    const requestBody = await c.req.json();
    console.log('Request body:', requestBody);
    const result = createStripeUserSchema.safeParse(await c.req.json());

    if (!result.success) {
        return c.json({ error: 'Invalid request data' }, 400);
    }

    const { email, name, userId } = result.data;

    console.log('creating a stripe user', email, name, userId)

    try {
        const customerId = await createStripeUser(email, name, userId, c.env.STRIPE_SECRET_KEY);
        return c.json({
            customerId: customerId
        });
    } catch (error) {
        console.log(error);
        return c.json({ error: 'Failed to create Stripe user' }, 500);
    }
});

export default app;
