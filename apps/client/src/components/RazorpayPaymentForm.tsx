"use client";

import { useAuth } from "@clerk/nextjs";
import Script from "next/script";
import { useEffect, useState } from "react";
import { ShippingFormInputs } from "@repo/types";
import useCartStore from "@/stores/cartStore";
import { useRouter } from "next/navigation";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const RazorpayPaymentForm = ({
  shippingForm,
}: {
  shippingForm: ShippingFormInputs;
}) => {
  const { cart } = useCartStore();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const { getToken } = useAuth();
  const router = useRouter();

  useEffect(() => {
    getToken().then((token) => setToken(token));
  }, []);

  const handlePayment = async () => {
    if (!token || !scriptReady || !window.Razorpay) return;
    setLoading(true);
    setError(null);
    try {
      const orderResponse = await fetch(
        `${process.env.NEXT_PUBLIC_PAYMENT_SERVICE_URL}/payments/create-order`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ cart, customer: shippingForm }),
        },
      );
      const order = await orderResponse.json();
      if (!orderResponse.ok) throw new Error(order.error);

      const razorpay = new window.Razorpay({
        key: order.key,
        amount: order.amount,
        currency: order.currency,
        name: "Ecommerce Store",
        description: "Order payment",
        order_id: order.orderId,
        prefill: {
          name: shippingForm.name,
          email: shippingForm.email,
          contact: shippingForm.phone,
        },
        handler: async (response: Record<string, string>) => {
          try {
            const verifyResponse = await fetch(
              `${process.env.NEXT_PUBLIC_PAYMENT_SERVICE_URL}/payments/verify`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  cart,
                  customer: shippingForm,
                  ...response,
                }),
              },
            );
            const result = await verifyResponse.json();
            if (!verifyResponse.ok) throw new Error(result.error);
            router.push("/orders");
          } catch (verificationError) {
            setError(
              verificationError instanceof Error
                ? verificationError.message
                : "Payment verification failed",
            );
          }
        },
      });
      razorpay.open();
    } catch (paymentError) {
      setError(
        paymentError instanceof Error ? paymentError.message : "Payment failed",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />
      <button
        type="button"
        disabled={!token || !scriptReady || loading}
        onClick={handlePayment}
      >
        {loading ? "Loading..." : "Pay securely"}
      </button>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
};

export default RazorpayPaymentForm;
