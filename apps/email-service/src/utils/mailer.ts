import { BrevoClient } from "@getbrevo/brevo";

const brevo = new BrevoClient({
  apiKey: process.env.BREVO_API_KEY!,
});

const sendMail = async ({
  email,
  subject,
  text,
}: {
  email: string;
  subject: string;
  text: string;
}) => {
  try {
    const response = await brevo.transactionalEmails.sendTransacEmail({
      sender: {
        email: process.env.BREVO_SENDER_EMAIL!,
        name: process.env.BREVO_SENDER_NAME || "E-Commerce App",
      },
      to: [
        {
          email,
        },
      ],
      subject,
      textContent: text,
    });

    console.log("EMAIL SENT:", response);
  } catch (error) {
    console.error("EMAIL FAILED:", error);
    throw error;
  }
};

export default sendMail;
