import { randomId } from "@/lib/server/crypto";
import { getDb } from "@/lib/server/db";

export function writeAudit(
  actorUserId: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  metadata: Record<string, unknown> | null = null,
): void {
  getDb().prepare(`
    INSERT INTO audit_log (id, actor_user_id, action, entity, entity_id, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomId("aud"),
    actorUserId,
    action,
    entity,
    entityId,
    metadata ? JSON.stringify(metadata) : null,
    Date.now(),
  );
}