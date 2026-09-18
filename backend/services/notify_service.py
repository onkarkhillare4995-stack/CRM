"""Per-user notifications."""
from models.entities import new_id, now_utc


async def notify(db, *, recipient_id, type_, title, message="", entity_type=None,
                 entity_id=None, action_url=None):
    if not recipient_id:
        return
    await db.notifications.insert_one({
        "id": new_id(), "recipient_id": recipient_id, "type": type_, "title": title,
        "message": message, "entity_type": entity_type, "entity_id": entity_id,
        "action_url": action_url, "read_at": None, "created_at": now_utc(),
    })


async def list_for(db, user, *, only_unread=False):
    q = {"recipient_id": user["id"]}
    if only_unread:
        q["read_at"] = None
    return await db.notifications.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)


async def unread_count(db, user):
    return await db.notifications.count_documents({"recipient_id": user["id"], "read_at": None})


async def mark_read(db, user, notif_id):
    await db.notifications.update_one({"id": notif_id, "recipient_id": user["id"]},
                                      {"$set": {"read_at": now_utc()}})
    return {"ok": True}


async def mark_all_read(db, user):
    await db.notifications.update_many({"recipient_id": user["id"], "read_at": None},
                                       {"$set": {"read_at": now_utc()}})
    return {"ok": True}
