import type { Pool, PoolClient } from "pg";

export type NotificationType = "announcement" | "order_update" | "reseller_invite" | "question_answer";

export async function createNotification(
  client: Pool | PoolClient,
  params: {
    userId: number;
    type: NotificationType;
    title: string;
    body?: string | null;
    data?: Record<string, unknown> | null;
  }
) {
  await client.query(
    `INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1, $2, $3, $4, $5)`,
    [params.userId, params.type, params.title, params.body ?? null, params.data ? JSON.stringify(params.data) : null]
  );
}

// Usado pelo broadcast de anúncio — evita um round-trip por usuário.
export async function createNotificationForAllCustomers(
  client: Pool | PoolClient,
  params: { title: string; body?: string | null }
) {
  await client.query(
    `INSERT INTO notifications (user_id, type, title, body)
     SELECT id, 'announcement', $1, $2 FROM users`,
    [params.title, params.body ?? null]
  );
}
