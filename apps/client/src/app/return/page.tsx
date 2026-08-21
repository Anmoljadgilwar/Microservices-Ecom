import Link from "next/link";

const ReturnPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ payment_id: string }> | undefined;
}) => {
  const paymentId = (await searchParams)?.payment_id;

  if (!paymentId) {
    return <div>No payment id found!</div>;
  }

  return (
    <div className="">
      <h1>Payment submitted</h1>
      <p>Payment reference: {paymentId}</p>
      <Link href="/orders">See your orders</Link>
    </div>
  );
};

export default ReturnPage;
