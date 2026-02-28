export async function createPayment(authFetch, orderId) {
  const res = await authFetch('/api/payments/create/', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({order_id: orderId}),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || 'Не удалось создать платёж');

  return data; // {confirmation_url, payment_id, status}
}

export async function syncPayment(authFetch, orderId) {
  const res = await authFetch(`/api/payments/sync/${orderId}/`, {method: 'POST'});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || 'Не удалось проверить платёж');
  return data; // {status}
}