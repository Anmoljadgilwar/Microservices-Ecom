import { Hono } from "hono";
import {
  CartItemsType,
  ShippingFormInputs,
  shippingFormSchema,
} from "@repo/types";
import { shouldBeUser } from "../middleware/authMiddleware.js";
import { producer } from "../utils/kafka.js";
import {
  razorpay,
  razorpayKeyId,
  verifyPaymentSignature,
} from "../utils/razorpay.js";

const paymentRoute = new Hono();
const currency = process.env.RAZORPAY_CURRENCY || "INR";
const productServiceUrl =
  process.env.PRODUCT_SERVICE_URL || "http://localhost:8000";

type PaymentRequest = { cart: CartItemsType; customer: ShippingFormInputs };

const getProducts = async (cart: CartItemsType) => {
  if (!Array.isArray(cart) || cart.length === 0)
    throw new Error("Cart cannot be empty");

  const products = await Promise.all(
    cart.map(async (item) => {
      if (
        !Number.isInteger(item.id) ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1
      ) {
        throw new Error("Invalid product selection");
      }
      const response = await fetch(`${productServiceUrl}/products/${item.id}`);
      if (!response.ok) throw new Error(`Product ${item.id} is unavailable`);
      const product = (await response.json()) as {
        name: string;
        price: number;
      } | null;
      if (!product) throw new Error(`Product ${item.id} is unavailable`);
      return {
        name: product.name,
        quantity: item.quantity,
        price: product.price,
      };
    }),
  );

  return {
    products,
    amount: Math.round(
      products.reduce(
        (total, product) => total + product.price * product.quantity,
        0,
      ) * 100,
    ),
  };
};

paymentRoute.post("/create-order", shouldBeUser, async (c) => {
  try {
    const { cart, customer } = (await c.req.json()) as PaymentRequest;
    if (!shippingFormSchema.safeParse(customer).success) {
      return c.json({ error: "Invalid customer details" }, 400);
    }
    const { amount } = await getProducts(cart);
    const order = await razorpay.orders.create({
      amount,
      currency,
      receipt: `cart_${Date.now()}`.slice(0, 40),
      notes: { user_id: c.get("userId"), email: customer.email },
    });

    return c.json({
      key: razorpayKeyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error) {
    console.error("Razorpay order creation failed", error);
    return c.json({ error: "Unable to create payment order" }, 500);
  }
});

paymentRoute.post("/verify", shouldBeUser, async (c) => {
  try {
    const {
      cart,
      customer,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = (await c.req.json()) as PaymentRequest & {
      razorpay_order_id?: string;
      razorpay_payment_id?: string;
      razorpay_signature?: string;
    };
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return c.json({ error: "Incomplete payment response" }, 400);
    }
    if (!shippingFormSchema.safeParse(customer).success) {
      return c.json({ error: "Invalid customer details" }, 400);
    }

    const order = await razorpay.orders.fetch(razorpay_order_id);
    if (order.notes?.user_id !== c.get("userId")) {
      return c.json(
        { error: "Payment order does not belong to this user" },
        403,
      );
    }
    if (
      !verifyPaymentSignature(order.id, razorpay_payment_id, razorpay_signature)
    ) {
      return c.json({ error: "Payment signature verification failed" }, 400);
    }

    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    if (payment.order_id !== order.id || payment.status !== "captured") {
      return c.json({ error: "Payment has not been captured" }, 400);
    }

    const { products, amount } = await getProducts(cart);
    if (amount !== order.amount || order.currency !== currency) {
      return c.json({ error: "Payment amount validation failed" }, 400);
    }

    await producer.send("payment.successful", {
      value: {
        userId: c.get("userId"),
        email: customer.email,
        amount: order.amount,
        status: "success",
        products,
      },
    });
    return c.json({ verified: true });
  } catch (error) {
    console.error("Razorpay payment verification failed", error);
    return c.json({ error: "Unable to verify payment" }, 500);
  }
});

export default paymentRoute;
