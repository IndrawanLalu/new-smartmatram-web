import BatchDetailClient from "./_components/BatchDetailClient";

export default async function WorkOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BatchDetailClient batchId={id} />;
}
