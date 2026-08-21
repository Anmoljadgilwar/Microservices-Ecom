import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { clerkMiddleware } from "@hono/clerk-auth";
import paymentRoute from "./routes/payment.route.js";
import { cors } from "hono/cors";
import { consumer, producer } from "./utils/kafka.js";

const app = new Hono();
app.use("*", clerkMiddleware());
app.use("*", cors({ origin: ["http://localhost:3002"] }));

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

app.route("/payments", paymentRoute);

const start = async () => {
  try {
    Promise.all([await producer.connect(), await consumer.connect()]);
    serve(
      {
        fetch: app.fetch,
        port: 8002,
      },
      (info) => {
        console.log(`Payment service is running on port 8002`);
      },
    );
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
};
start();
